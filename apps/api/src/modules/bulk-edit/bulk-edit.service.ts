import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';

export interface BulkEditResultItem {
  adGroupId: number;
  adGroupName?: string;
  campaignName?: string;
  success: boolean;
  error?: string;
}

export interface BulkEditResponse {
  results: BulkEditResultItem[];
  totalGroups: number;
  successCount: number;
  failCount: number;
}

@Injectable()
export class BulkEditService {
  private readonly logger = new Logger(BulkEditService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
  ) {}

  /**
   * Проверка доступа к VK аккаунту
   */
  private async getVkAccount(userId: number, vkAccountId: number) {
    // Проверяем владение
    const ownedAccount = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId },
    });

    if (ownedAccount) return ownedAccount;

    // Проверяем shared access с canEdit
    const sharedAccess = await this.prisma.vkAccountShare.findFirst({
      where: {
        vkAccountId,
        sharedWithUserId: userId,
        canEdit: true,
      },
      include: { vkAccount: true },
    });

    if (sharedAccess) return sharedAccess.vkAccount;

    throw new NotFoundException('VK аккаунт не найден или нет прав на редактирование');
  }

  /**
   * Получить список кампаний с группами объявлений
   */
  async getCampaignsWithAdGroups(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);

    // Получаем кампании
    const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);

    // Получаем все группы объявлений
    const allAdGroups = await this.vkService.getAllAdGroupsWithToken(vkAccount.accessToken);

    // Группируем по кампаниям
    const result = campaigns.map((campaign: any) => {
      const adGroups = allAdGroups.filter((ag: any) => ag.ad_plan_id === campaign.id);
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        adGroups: adGroups.map((ag: any) => ({
          id: ag.id,
          name: ag.name,
          status: ag.status,
          budget_limit_day: ag.budget_limit_day,
          targetings: ag.targetings,
        })),
      };
    });

    return result;
  }

  /**
   * Получить доступные аудитории (ретаргетинг) с названиями из базы
   */
  async getAudiences(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    const segments = await this.vkService.getRetargetingGroups(vkAccount.accessToken);

    // Если нет сегментов, возвращаем пустой массив
    if (!segments || segments.length === 0) {
      return [];
    }

    // Получаем сохранённые названия из базы
    const segmentIds = segments.map((s: any) => BigInt(s.id));

    let labelsMap = new Map<string, string>();
    if (segmentIds.length > 0) {
      const labels = await this.prisma.segmentLabel.findMany({
        where: {
          vkAccountId,
          segmentId: { in: segmentIds },
        },
      });
      labelsMap = new Map(labels.map(l => [l.segmentId.toString(), l.name]));
    }

    // Добавляем названия к сегментам
    return segments.map((s: any) => ({
      ...s,
      name: labelsMap.get(s.id.toString()) || `Сегмент ${s.id}`,
      hasCustomName: labelsMap.has(s.id.toString()),
    }));
  }

  /**
   * Получить доступные интересы
   */
  async getInterests(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    return this.vkService.getInterests(vkAccount.accessToken);
  }

  /**
   * Получить доступные интересы соц-дем
   */
  async getInterestsSocDem(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    return this.vkService.getInterestsSocDem(vkAccount.accessToken);
  }

  /**
   * Обновить название сегмента
   */
  async updateSegmentLabel(userId: number, vkAccountId: number, segmentId: number, name: string) {
    // Проверяем доступ
    await this.getVkAccount(userId, vkAccountId);

    const result = await this.prisma.segmentLabel.upsert({
      where: {
        vkAccountId_segmentId: {
          vkAccountId,
          segmentId: BigInt(segmentId),
        },
      },
      update: { name },
      create: {
        vkAccountId,
        segmentId: BigInt(segmentId),
        name,
      },
    });

    // Конвертируем BigInt в string для JSON сериализации
    return {
      ...result,
      segmentId: result.segmentId.toString(),
    };
  }

  /**
   * Массовое обновление названий сегментов
   */
  async updateSegmentLabels(userId: number, vkAccountId: number, labels: { segmentId: number; name: string }[]) {
    await this.getVkAccount(userId, vkAccountId);

    const results = await Promise.all(
      labels.map(({ segmentId, name }) =>
        this.prisma.segmentLabel.upsert({
          where: {
            vkAccountId_segmentId: {
              vkAccountId,
              segmentId: BigInt(segmentId),
            },
          },
          update: { name },
          create: {
            vkAccountId,
            segmentId: BigInt(segmentId),
            name,
          },
        })
      )
    );

    // Конвертируем BigInt в string для JSON сериализации
    return results.map(r => ({
      ...r,
      segmentId: r.segmentId.toString(),
    }));
  }

  /**
   * Массовое обновление групп объявлений
   */
  async bulkUpdateAdGroups(userId: number, dto: {
    vkAccountId: number;
    adGroupIds: number[];
    changes: {
      audiences?: number[];        // ID аудиторий ретаргетинга
      interests?: number[];        // ID интересов
      interestsSocDem?: number[];  // ID интересов соц-дем
      budgetLimitDay?: number;     // Дневной бюджет в рублях
      name?: string;               // Новое название (шаблон с {name}, {id}, {n})
      // Режим работы с аудиториями/интересами
      audienceMode?: 'replace' | 'add' | 'remove';
      interestsMode?: 'replace' | 'add' | 'remove';
    };
  }): Promise<BulkEditResponse> {
    const vkAccount = await this.getVkAccount(userId, dto.vkAccountId);

    if (!dto.adGroupIds || dto.adGroupIds.length === 0) {
      throw new BadRequestException('Выберите хотя бы одну группу объявлений');
    }

    if (dto.adGroupIds.length > 100) {
      throw new BadRequestException('Максимум 100 групп за раз');
    }

    const results: BulkEditResultItem[] = [];

    // Получаем информацию о группах для отображения
    let adGroupsInfo: Map<number, { name: string; campaignName?: string; targetings?: any }> = new Map();
    try {
      const allAdGroups = await this.vkService.getAllAdGroupsWithToken(vkAccount.accessToken);
      const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
      const campaignsMap = new Map(campaigns.map((c: any) => [c.id, c.name]));

      adGroupsInfo = new Map(
        allAdGroups
          .filter((ag: any) => dto.adGroupIds.includes(ag.id))
          .map((ag: any) => [
            ag.id,
            {
              name: ag.name,
              campaignName: campaignsMap.get(ag.ad_plan_id) as string | undefined,
              targetings: ag.targetings,
            },
          ])
      );
    } catch {
      // Игнорируем - информация не критична
    }

    // Обновляем каждую группу
    for (const adGroupId of dto.adGroupIds) {
      try {
        const updateData: any = {};
        const info = adGroupsInfo.get(adGroupId);
        const currentTargetings = info?.targetings || {};

        // Подготавливаем targetings
        if (dto.changes.audiences !== undefined ||
            dto.changes.interests !== undefined ||
            dto.changes.interestsSocDem !== undefined) {

          updateData.targetings = { ...currentTargetings };

          // Аудитории (сегменты в VK API)
          if (dto.changes.audiences !== undefined) {
            const mode = dto.changes.audienceMode || 'replace';
            const currentSegments = currentTargetings.segments || [];

            if (mode === 'replace') {
              updateData.targetings.segments = dto.changes.audiences;
            } else if (mode === 'add') {
              updateData.targetings.segments = [...new Set([...currentSegments, ...dto.changes.audiences])];
            } else if (mode === 'remove') {
              updateData.targetings.segments = currentSegments.filter(
                (id: number) => !dto.changes.audiences!.includes(id)
              );
            }
          }

          // Интересы
          if (dto.changes.interests !== undefined) {
            const mode = dto.changes.interestsMode || 'replace';
            const currentInterests = currentTargetings.interests || [];

            if (mode === 'replace') {
              updateData.targetings.interests = dto.changes.interests;
            } else if (mode === 'add') {
              updateData.targetings.interests = [...new Set([...currentInterests, ...dto.changes.interests])];
            } else if (mode === 'remove') {
              updateData.targetings.interests = currentInterests.filter(
                (id: number) => !dto.changes.interests!.includes(id)
              );
            }
          }

          // Интересы соц-дем
          if (dto.changes.interestsSocDem !== undefined) {
            const mode = dto.changes.interestsMode || 'replace';
            const currentInterestsSocDem = currentTargetings.interests_soc_dem || [];

            if (mode === 'replace') {
              updateData.targetings.interests_soc_dem = dto.changes.interestsSocDem;
            } else if (mode === 'add') {
              updateData.targetings.interests_soc_dem = [...new Set([...currentInterestsSocDem, ...dto.changes.interestsSocDem])];
            } else if (mode === 'remove') {
              updateData.targetings.interests_soc_dem = currentInterestsSocDem.filter(
                (id: number) => !dto.changes.interestsSocDem!.includes(id)
              );
            }
          }
        }

        // Дневной бюджет в рублях (VK API принимает строку в рублях)
        if (dto.changes.budgetLimitDay !== undefined) {
          updateData.budget_limit_day = String(Math.round(dto.changes.budgetLimitDay));
        }

        // Название группы (поддержка шаблонов: {name} - текущее название, {id} - ID группы, {n} - номер по порядку)
        if (dto.changes.name !== undefined && dto.changes.name.trim()) {
          const currentIndex = dto.adGroupIds.indexOf(adGroupId) + 1;
          let newName = dto.changes.name
            .replace(/{name}/g, info?.name || '')
            .replace(/{id}/g, String(adGroupId))
            .replace(/{n}/g, String(currentIndex));
          updateData.name = newName;
        }

        // Отправляем обновление
        await this.vkService.updateAdGroup(vkAccount.accessToken, adGroupId, updateData);

        results.push({
          adGroupId,
          adGroupName: info?.name,
          campaignName: info?.campaignName,
          success: true,
        });

        // Небольшая задержка между запросами (rate limiting)
        await this.sleep(200);
      } catch (error) {
        results.push({
          adGroupId,
          adGroupName: adGroupsInfo.get(adGroupId)?.name,
          campaignName: adGroupsInfo.get(adGroupId)?.campaignName,
          success: false,
          error: error.message || 'Неизвестная ошибка',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return {
      results,
      totalGroups: dto.adGroupIds.length,
      successCount,
      failCount,
    };
  }

  // ============ МАССОВОЕ РЕДАКТИРОВАНИЕ БАННЕРОВ (ОБЪЯВЛЕНИЙ) ============

  /**
   * Получить кампании с баннерами (объявлениями) - структура как для групп объявлений
   * ВАЖНО: VK API campaign_id в баннерах == ad_group_id (баг/особенность API)
   * Поэтому связываем баннеры с кампаниями через группы объявлений: banner.ad_group_id -> ad_group.ad_plan_id
   */
  async getCampaignsWithBanners(userId: number, vkAccountId: number, statusFilter?: string) {
    this.logger.log(`getCampaignsWithBanners: начало, vkAccountId=${vkAccountId}, statusFilter=${statusFilter}`);
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    this.logger.log(`getCampaignsWithBanners: vkAccount найден, token существует: ${!!vkAccount.accessToken}`);

    // Получаем кампании
    this.logger.log(`getCampaignsWithBanners: загружаем кампании...`);
    const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
    this.logger.log(`getCampaignsWithBanners: загружено ${campaigns.length} кампаний`);

    // Получаем все баннеры
    this.logger.log(`getCampaignsWithBanners: загружаем баннеры...`);
    const allBanners = await this.vkService.getAllBannersWithTextblocks(vkAccount.accessToken, statusFilter);
    this.logger.log(`getCampaignsWithBanners: загружено ${allBanners.length} баннеров`);

    // Получаем группы объявлений - нужны для связи баннер -> кампания через ad_plan_id
    let adGroupsMap = new Map<number, { name: string; adPlanId: number }>();
    try {
      const adGroups = await this.vkService.getAllAdGroupsWithToken(vkAccount.accessToken);
      adGroupsMap = new Map(adGroups.map((ag: any) => [ag.id, { name: ag.name, adPlanId: ag.ad_plan_id }]));
      this.logger.log(`getCampaignsWithBanners: загружено ${adGroupsMap.size} групп объявлений`);
    } catch (error) {
      this.logger.warn(`getCampaignsWithBanners: ошибка загрузки групп: ${error.message}`);
    }

    // Создаём Map кампаний по ID
    const campaignsMap = new Map(campaigns.map((c: any) => [c.id, c]));

    // Группируем баннеры по кампаниям через группы объявлений
    const result = campaigns.map((campaign: any) => {
      // Фильтруем баннеры: находим те, чья группа объявлений принадлежит этой кампании
      const campaignBanners = allBanners
        .filter((b: any) => {
          const adGroup = adGroupsMap.get(b.ad_group_id);
          return adGroup && adGroup.adPlanId === campaign.id;
        })
        .map((banner: any) => {
          const adGroup = adGroupsMap.get(banner.ad_group_id);
          const tb = banner.textblocks || {};
          // Определяем тип формата и описание
          let description = '';
          let descriptionFormat = 'unknown';
          if (tb.text_2000 !== undefined) {
            description = tb.text_2000.text || '';
            descriptionFormat = 'text_2000';
          } else if (tb.text_220 !== undefined) {
            description = tb.text_220.text || '';
            descriptionFormat = 'text_220';
          } else if (tb.text_90 !== undefined) {
            description = tb.text_90.text || '';
            descriptionFormat = 'text_90';
          }
          return {
            id: banner.id,
            name: banner.name,
            status: banner.status,
            moderationStatus: banner.moderation_status,
            adGroupId: banner.ad_group_id,
            adGroupName: adGroup?.name || `Группа ${banner.ad_group_id}`,
            title: tb.title_40_vkads?.text || '',
            description,
            descriptionFormat, // text_2000, text_220, text_90 или unknown
            // Дополнительно для "приложений"
            shortDescription: tb.text_90?.text || '',
          };
        });

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        banners: campaignBanners,
      };
    });

    // Фильтруем кампании без баннеров
    const filteredResult = result.filter((c: any) => c.banners.length > 0);
    this.logger.log(`getCampaignsWithBanners: возвращаем ${filteredResult.length} кампаний с баннерами`);
    return filteredResult;
  }

  /**
   * Получить все баннеры с текстами для массового редактирования (плоский список)
   */
  async getBannersWithTexts(userId: number, vkAccountId: number, statusFilter?: string) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    const banners = await this.vkService.getAllBannersWithTextblocks(vkAccount.accessToken, statusFilter);

    // Получаем названия групп и кампаний для удобства
    let adGroupsMap = new Map<number, string>();
    let campaignsMap = new Map<number, string>();

    try {
      const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
      campaignsMap = new Map(campaigns.map((c: any) => [c.id, c.name]));

      const adGroups = await this.vkService.getAllAdGroupsWithToken(vkAccount.accessToken);
      adGroupsMap = new Map(adGroups.map((ag: any) => [ag.id, ag.name]));
    } catch {
      // Не критично
    }

    return banners.map((banner: any) => ({
      id: banner.id,
      name: banner.name,
      status: banner.status,
      moderationStatus: banner.moderation_status,
      adGroupId: banner.ad_group_id,
      adGroupName: adGroupsMap.get(banner.ad_group_id) || `Группа ${banner.ad_group_id}`,
      campaignId: banner.campaign_id,
      campaignName: campaignsMap.get(banner.campaign_id) || `Кампания ${banner.campaign_id}`,
      // Текстовые блоки
      title: banner.textblocks?.title_40_vkads?.text || '',
      description: banner.textblocks?.text_2000?.text || '',
    }));
  }

  /**
   * Массовое обновление баннеров (объявлений)
   *
   * ВАЖНО: VK API требует передачи ВСЕХ textblocks при обновлении - они полностью замещаются.
   * Поэтому сначала получаем текущие textblocks, модифицируем нужные поля, отправляем все.
   */
  async bulkUpdateBanners(userId: number, dto: {
    vkAccountId: number;
    bannerIds: number[];
    changes: {
      name?: string;           // Новое название баннера (шаблон с {name}, {id}, {n})
      title?: string;          // Новый заголовок (title_40_vkads)
      description?: string;    // Новое описание (text_2000)
    };
  }): Promise<{
    results: { bannerId: number; bannerName?: string; success: boolean; error?: string }[];
    totalBanners: number;
    successCount: number;
    failCount: number;
  }> {
    const vkAccount = await this.getVkAccount(userId, dto.vkAccountId);

    if (!dto.bannerIds || dto.bannerIds.length === 0) {
      throw new BadRequestException('Выберите хотя бы одно объявление');
    }

    if (dto.bannerIds.length > 100) {
      throw new BadRequestException('Максимум 100 объявлений за раз');
    }

    const results: { bannerId: number; bannerName?: string; success: boolean; error?: string }[] = [];

    // Получаем информацию о баннерах с textblocks
    let bannersInfo = new Map<number, { name: string; textblocks: any }>();
    try {
      const allBanners = await this.vkService.getAllBannersWithTextblocks(vkAccount.accessToken);
      bannersInfo = new Map(
        allBanners
          .filter((b: any) => dto.bannerIds.includes(b.id))
          .map((b: any) => [b.id, { name: b.name, textblocks: b.textblocks || {} }])
      );
      this.logger.log(`bulkUpdateBanners: загружено ${bannersInfo.size} баннеров для обновления`);
    } catch (error) {
      this.logger.error(`bulkUpdateBanners: ошибка загрузки баннеров: ${error.message}`);
    }

    // Обновляем каждый баннер
    for (const bannerId of dto.bannerIds) {
      try {
        const updateData: any = {};
        const info = bannersInfo.get(bannerId);

        // Название баннера (поддержка шаблонов)
        if (dto.changes.name !== undefined && dto.changes.name.trim()) {
          const currentIndex = dto.bannerIds.indexOf(bannerId) + 1;
          updateData.name = dto.changes.name
            .replace(/{name}/g, info?.name || '')
            .replace(/{id}/g, String(bannerId))
            .replace(/{n}/g, String(currentIndex));
        }

        // Обновление textblocks (заголовок и/или описание)
        // VK API требует передачи ВСЕХ textblocks - они полностью замещаются
        // ВАЖНО: разные форматы баннеров используют разные поля:
        // - "Сообщения": title_40_vkads, text_2000
        // - "Установка приложений": title_40_vkads, text_90, text_220
        if (dto.changes.title !== undefined || dto.changes.description !== undefined) {
          const currentTextblocks = info?.textblocks || {};
          const newTextblocks = { ...currentTextblocks };

          // Обновляем заголовок (title_40_vkads) - универсально для всех форматов
          if (dto.changes.title !== undefined && currentTextblocks.title_40_vkads !== undefined) {
            newTextblocks.title_40_vkads = {
              text: dto.changes.title,
              title: currentTextblocks.title_40_vkads?.title || '',
            };
          }

          // Обновляем описание - определяем какое поле использовать на основе текущих textblocks
          if (dto.changes.description !== undefined) {
            // Формат "Сообщения" и подобные - длинное описание 2000 символов
            if (currentTextblocks.text_2000 !== undefined) {
              newTextblocks.text_2000 = {
                text: dto.changes.description,
                title: currentTextblocks.text_2000?.title || '',
              };
            }

            // Формат "Приложения" - длинное описание 220 символов
            if (currentTextblocks.text_220 !== undefined) {
              newTextblocks.text_220 = {
                text: dto.changes.description.slice(0, 220),
                title: currentTextblocks.text_220?.title || '',
              };
            }

            // Формат "Приложения" - короткое описание 90 символов
            if (currentTextblocks.text_90 !== undefined) {
              newTextblocks.text_90 = {
                text: dto.changes.description.slice(0, 90),
                title: currentTextblocks.text_90?.title || '',
              };
            }

            // Проверяем что хоть одно поле описания было найдено
            if (currentTextblocks.text_2000 === undefined &&
                currentTextblocks.text_220 === undefined &&
                currentTextblocks.text_90 === undefined) {
              this.logger.warn(`bulkUpdateBanners: баннер ${bannerId} не имеет известных полей описания`);
            }
          }

          updateData.textblocks = newTextblocks;
        }

        // Если нечего менять - пропускаем
        if (Object.keys(updateData).length === 0) {
          results.push({
            bannerId,
            bannerName: info?.name,
            success: true,
          });
          continue;
        }

        this.logger.log(`bulkUpdateBanners: обновляем баннер ${bannerId}:`, JSON.stringify(updateData));

        await this.vkService.updateBanner(vkAccount.accessToken, bannerId, updateData);

        results.push({
          bannerId,
          bannerName: info?.name,
          success: true,
        });

        // Rate limiting
        await this.sleep(200);
      } catch (error) {
        this.logger.error(`bulkUpdateBanners: ошибка баннера ${bannerId}: ${error.message}`);
        results.push({
          bannerId,
          bannerName: bannersInfo.get(bannerId)?.name,
          success: false,
          error: error.message || 'Неизвестная ошибка',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    this.logger.log(`bulkUpdateBanners: завершено. Успешно: ${successCount}, ошибок: ${failCount}`);

    return {
      results,
      totalBanners: dto.bannerIds.length,
      successCount,
      failCount,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
