import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { CreateSegmentationDto } from './dto/create-segmentation.dto';

const DELAY_BETWEEN_COPIES_MS = 6000; // 6 секунд между копиями

export interface SegmentationResult {
  success: boolean;
  createdGroups: {
    id: number;
    name: string;
    audienceId: number;
    audienceName: string;
  }[];
  errors: string[];
  totalCreated: number;
  totalRequested: number;
}

@Injectable()
export class SegmentationService {
  private readonly logger = new Logger(SegmentationService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
  ) {}

  /**
   * Проверка доступа к VK аккаунту (владелец или расшарен с canEdit)
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
   * Получить кампании с группами объявлений для выбора источника
   */
  async getCampaignsWithAdGroups(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);

    const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
    // Загружаем только АКТИВНЫЕ группы объявлений (не остановленные и не удалённые)
    const allAdGroups = await this.vkService.getAllAdGroupsWithToken(vkAccount.accessToken, undefined, 'active');

    return campaigns.map((campaign: any) => {
      const adGroups = allAdGroups.filter((ag: any) => ag.ad_plan_id === campaign.id);
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        adGroups: adGroups.map((ag: any) => ({
          id: ag.id,
          name: ag.name,
          status: ag.status,
        })),
      };
    });
  }

  /**
   * Получить аудитории (сегменты) напрямую из VK Ads API
   * Названия берутся из API /remarketing/segments.json
   */
  async getAudiences(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    const segments = await this.vkService.getRetargetingGroups(vkAccount.accessToken);

    if (!segments || segments.length === 0) {
      return [];
    }

    // Названия уже приходят из API!
    return segments.map((s: any) => ({
      id: s.id,
      name: s.name || `Сегмент ${s.id}`,
      hasCustomName: !!s.name, // Если есть имя из API
    }));
  }

  /**
   * Получить обычные интересы напрямую из VK Ads API (Авто, Финансы, и т.д.)
   * Названия берутся из API /targetings_tree.json?targetings=interests
   */
  async getInterests(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    const interests = await this.vkService.getInterests(vkAccount.accessToken);

    if (!interests || interests.length === 0) {
      return [];
    }

    // Названия уже приходят из API!
    return interests.map((i: any) => ({
      id: i.id,
      name: i.name || `Интерес ${i.id}`,
      fullName: i.fullName,
      hasCustomName: !!i.name,
    }));
  }

  /**
   * Получить соц-дем интересы напрямую из VK Ads API (доход, занятость, и т.д.)
   * Названия берутся из API /targetings_tree.json?targetings=interests_soc_dem
   */
  async getInterestsSocDem(userId: number, vkAccountId: number) {
    const vkAccount = await this.getVkAccount(userId, vkAccountId);
    const interests = await this.vkService.getInterestsSocDem(vkAccount.accessToken);

    if (!interests || interests.length === 0) {
      return [];
    }

    // Названия уже приходят из API!
    return interests.map((i: any) => ({
      id: i.id,
      name: i.name || `Соц-дем ${i.id}`,
      fullName: i.fullName,
      hasCustomName: !!i.name,
    }));
  }

  /**
   * Обновить название интереса
   */
  async updateInterestLabel(userId: number, vkAccountId: number, interestId: number, name: string) {
    await this.getVkAccount(userId, vkAccountId);

    return this.prisma.interestLabel.upsert({
      where: {
        vkAccountId_interestId: {
          vkAccountId,
          interestId,
        },
      },
      update: { name },
      create: {
        vkAccountId,
        interestId,
        name,
      },
    });
  }

  /**
   * Выполнить сегментирование: создать копии группы с разными аудиториями
   *
   * Логика:
   * - Для каждой аудитории из audienceIds создаётся копия группы
   * - В копии устанавливается ОДНА аудитория (сегмент) + опционально один интерес
   * - Название группы = название аудитории (+ интерес если выбран)
   */
  async execute(userId: number, dto: CreateSegmentationDto): Promise<SegmentationResult> {
    const vkAccount = await this.getVkAccount(userId, dto.vkAccountId);

    if (dto.audienceIds.length === 0) {
      throw new BadRequestException('Выберите хотя бы одну аудиторию');
    }

    this.logger.log(`Начало сегментирования: группа ${dto.sourceAdGroupId}, аудиторий: ${dto.audienceIds.length}, интерес: ${dto.interestId || 'нет'}, соц-дем: ${dto.socDemInterestId || 'нет'}`);

    const result: SegmentationResult = {
      success: true,
      createdGroups: [],
      errors: [],
      totalCreated: 0,
      totalRequested: dto.audienceIds.length,
    };

    // Получаем названия аудиторий из базы
    const audienceLabels = await this.getAudienceLabels(dto.vkAccountId, dto.audienceIds);

    // Получаем название интереса если указан
    let interestName: string | null = null;
    if (dto.interestId) {
      interestName = await this.getInterestName(dto.vkAccountId, dto.interestId);
    }

    // Получаем название соц-дем интереса если указан
    let socDemInterestName: string | null = null;
    if (dto.socDemInterestId) {
      socDemInterestName = await this.getInterestName(dto.vkAccountId, dto.socDemInterestId);
    }

    // Устанавливаем токен для VkService
    this.vkService.setAccessToken(vkAccount.accessToken);

    try {
      let copyNumber = 1;

      for (const audienceId of dto.audienceIds) {
        try {
          // 1. Создаём копию группы
          this.logger.log(`Создание копии ${copyNumber}/${dto.audienceIds.length} для аудитории ${audienceId}`);

          const copyResult = await this.vkService.createAdGroupCopy(dto.sourceAdGroupId, copyNumber);

          if (!copyResult || !copyResult.id) {
            result.errors.push(`Не удалось создать копию для аудитории ${audienceId}`);
            continue;
          }

          const newGroupId = copyResult.id;
          const audienceName = audienceLabels.get(audienceId) || `Аудитория ${audienceId}`;

          // 2. Формируем новое название группы
          let newName = audienceName;
          const nameParts: string[] = [];
          if (interestName) {
            nameParts.push(interestName);
          }
          if (socDemInterestName) {
            nameParts.push(socDemInterestName);
          }
          if (nameParts.length > 0) {
            newName = `${audienceName} + ${nameParts.join(' + ')}`;
          }

          // 3. Обновляем группу: название + targetings (только выбранная аудитория и интересы)
          const targetings: any = {
            segments: [audienceId], // ОДНА аудитория
          };

          if (dto.interestId) {
            targetings.interests = [dto.interestId];
          }

          if (dto.socDemInterestId) {
            targetings.interests_soc_dem = [dto.socDemInterestId];
          }

          await this.vkService.updateAdGroup(vkAccount.accessToken, newGroupId, {
            name: newName,
            targetings,
          });

          result.createdGroups.push({
            id: newGroupId,
            name: newName,
            audienceId,
            audienceName,
          });

          result.totalCreated++;
          copyNumber++;

          this.logger.log(`✅ Создана группа ${newGroupId}: "${newName}"`);

          // Задержка между созданиями (кроме последней)
          if (copyNumber <= dto.audienceIds.length) {
            await this.delay(DELAY_BETWEEN_COPIES_MS);
          }
        } catch (error) {
          this.logger.error(`Ошибка создания копии для аудитории ${audienceId}: ${error.message}`);
          result.errors.push(`Аудитория ${audienceId}: ${error.message}`);
        }
      }

      result.success = result.totalCreated > 0;

    } finally {
      this.vkService.resetAccessToken();
    }

    this.logger.log(`Сегментирование завершено: создано ${result.totalCreated}/${result.totalRequested} групп`);
    return result;
  }

  /**
   * Получить названия аудиторий из SegmentLabel
   */
  private async getAudienceLabels(vkAccountId: number, audienceIds: number[]): Promise<Map<number, string>> {
    const labels = await this.prisma.segmentLabel.findMany({
      where: {
        vkAccountId,
        segmentId: { in: audienceIds.map(id => BigInt(id)) },
      },
    });

    const result = new Map<number, string>();
    for (const label of labels) {
      result.set(Number(label.segmentId), label.name);
    }

    // Для аудиторий без названия используем "Аудитория {id}"
    for (const id of audienceIds) {
      if (!result.has(id)) {
        result.set(id, `Аудитория ${id}`);
      }
    }

    return result;
  }

  /**
   * Получить название интереса из базы или по умолчанию
   */
  private async getInterestName(vkAccountId: number, interestId: number): Promise<string> {
    try {
      const label = await this.prisma.interestLabel.findUnique({
        where: {
          vkAccountId_interestId: {
            vkAccountId,
            interestId,
          },
        },
      });
      return label?.name || `Интерес ${interestId}`;
    } catch {
      return `Интерес ${interestId}`;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
