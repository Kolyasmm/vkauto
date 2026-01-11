import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VkAccountsService } from '../vk-accounts/vk-accounts.service';
import { ProfitabilityService } from '../profitability/profitability.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

export interface ExecutionLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export interface ExecutionResult {
  groupsChecked: number;
  groupsMatched: number;
  copiesCreated: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
  details: any;
  logs?: ExecutionLog[];
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
    private notificationsService: NotificationsService,
    private vkAccountsService: VkAccountsService,
    private profitabilityService: ProfitabilityService,
  ) {}

  /**
   * Проверить, имеет ли пользователь доступ к VK аккаунту (владелец или расшарен с canEdit)
   */
  private async checkVkAccountAccess(vkAccountId: number, userId: number, requireEdit: boolean = false): Promise<boolean> {
    // Проверяем, является ли пользователь владельцем
    const ownedAccount = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId },
    });

    if (ownedAccount) {
      return true;
    }

    // Проверяем, расшарен ли аккаунт с этим пользователем
    const sharedAccess = await this.prisma.vkAccountShare.findFirst({
      where: {
        vkAccountId,
        sharedWithUserId: userId,
        ...(requireEdit ? { canEdit: true } : {}),
      },
    });

    return !!sharedAccess;
  }

  /**
   * Создать правило
   */
  async create(userId: number, dto: CreateRuleDto) {
    // Если указан vkAccountId - проверяем доступ к аккаунту (нужен canEdit для создания правил)
    if (dto.vkAccountId) {
      const hasAccess = await this.checkVkAccountAccess(dto.vkAccountId, userId, true);

      if (!hasAccess) {
        throw new BadRequestException('VK аккаунт не найден или у вас нет прав на редактирование');
      }
    }

    return this.prisma.rule.create({
      data: {
        userId,
        vkAccountId: dto.vkAccountId,
        name: dto.name,
        adAccountId: dto.adAccountId,
        cplThreshold: dto.cplThreshold,
        minLeads: dto.minLeads,
        copiesCount: dto.copiesCount,
        copyBudget: dto.copyBudget,
        profitabilityCheck: dto.profitabilityCheck || 'cpl',
        periodDays: dto.periodDays || 1,
        runTime: dto.runTime,
        isActive: dto.isActive ?? true,
      },
      include: {
        adAccount: true,
        vkAccount: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Получить все правила пользователя (включая правила расшаренных аккаунтов)
   */
  async findAll(userId: number, vkAccountId?: number) {
    // Если указан конкретный vkAccountId - проверяем доступ и возвращаем правила для него
    if (vkAccountId) {
      const hasAccess = await this.checkVkAccountAccess(vkAccountId, userId);
      if (!hasAccess) {
        return [];
      }

      return this.prisma.rule.findMany({
        where: { vkAccountId },
        include: {
          adAccount: true,
          vkAccount: { select: { id: true, name: true } },
          executions: {
            orderBy: { executedAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Иначе возвращаем все правила пользователя
    return this.prisma.rule.findMany({
      where: { userId },
      include: {
        adAccount: true,
        vkAccount: { select: { id: true, name: true } },
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить правило по ID (с проверкой доступа через shared accounts)
   */
  async findOne(id: number, userId: number) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        adAccount: true,
        vkAccount: { select: { id: true, name: true } },
        executions: {
          orderBy: { executedAt: 'desc' },
          take: 10,
          include: {
            adGroupCopies: true,
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${id} не найдено`);
    }

    // Проверяем, что пользователь имеет доступ к этому правилу
    // (либо владелец правила, либо имеет доступ к VK аккаунту)
    if (rule.userId !== userId) {
      if (rule.vkAccountId) {
        const hasAccess = await this.checkVkAccountAccess(rule.vkAccountId, userId);
        if (!hasAccess) {
          throw new NotFoundException(`Правило с ID ${id} не найдено`);
        }
      } else {
        throw new NotFoundException(`Правило с ID ${id} не найдено`);
      }
    }

    return rule;
  }

  /**
   * Обновить правило (требуется canEdit для shared accounts)
   */
  async update(id: number, userId: number, dto: UpdateRuleDto) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: { vkAccount: true },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${id} не найдено`);
    }

    // Проверяем права на редактирование
    if (rule.userId !== userId) {
      if (rule.vkAccountId) {
        const hasEditAccess = await this.checkVkAccountAccess(rule.vkAccountId, userId, true);
        if (!hasEditAccess) {
          throw new BadRequestException('У вас нет прав на редактирование этого правила');
        }
      } else {
        throw new NotFoundException(`Правило с ID ${id} не найдено`);
      }
    }

    return this.prisma.rule.update({
      where: { id: rule.id },
      data: dto,
      include: {
        adAccount: true,
      },
    });
  }

  /**
   * Удалить правило (требуется canEdit для shared accounts)
   */
  async remove(id: number, userId: number) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${id} не найдено`);
    }

    // Проверяем права на редактирование
    if (rule.userId !== userId) {
      if (rule.vkAccountId) {
        const hasEditAccess = await this.checkVkAccountAccess(rule.vkAccountId, userId, true);
        if (!hasEditAccess) {
          throw new BadRequestException('У вас нет прав на удаление этого правила');
        }
      } else {
        throw new NotFoundException(`Правило с ID ${id} не найдено`);
      }
    }

    await this.prisma.rule.delete({
      where: { id: rule.id },
    });

    return { message: 'Правило успешно удалено' };
  }

  /**
   * Выполнить правило (основная логика автодублирования)
   * Использует VK Ads API (ads.vk.com)
   */
  async executeRule(ruleId: number): Promise<ExecutionResult> {
    const logs: ExecutionLog[] = [];
    const addLog = (type: ExecutionLog['type'], message: string) => {
      const entry = { timestamp: new Date().toISOString(), type, message };
      logs.push(entry);
      this.logger.log(`[${type.toUpperCase()}] ${message}`);
    };

    addLog('info', `🚀 Запуск правила ID: ${ruleId}`);

    const rule = await this.prisma.rule.findUnique({
      where: { id: ruleId },
      include: {
        user: true,
        adAccount: true,
        vkAccount: true,
      },
    });

    if (!rule || !rule.isActive) {
      addLog('error', `Правило ${ruleId} неактивно или не найдено`);
      return {
        groupsChecked: 0,
        groupsMatched: 0,
        copiesCreated: 0,
        status: 'failed',
        errorMessage: 'Правило неактивно или не найдено',
        details: {},
        logs,
      };
    }

    // Устанавливаем токен из VK аккаунта для этого правила
    if (rule.vkAccount?.accessToken) {
      this.vkService.setAccessToken(rule.vkAccount.accessToken);
      addLog('info', `Используем аккаунт: ${rule.vkAccount.name}`);
    }

    const result: ExecutionResult = {
      groupsChecked: 0,
      groupsMatched: 0,
      copiesCreated: 0,
      status: 'success',
      details: {
        successfulGroups: [],
        failedGroups: [],
      },
      logs,
    };

    try {
      // Получаем вчерашнюю дату
      const yesterday = this.vkService.getYesterdayDate();

      // Собираем прибыльные группы (ad_group_id) из прибыльных баннеров
      const profitableGroupsSet = new Set<number>(); // Убираем дубли
      const profitableGroupsData = new Map<number, { name: string; goals?: number; cpl?: number; profit?: number; roi?: number; bannerId: number }>();

      // Выбираем метод проверки прибыльности
      if (rule.profitabilityCheck === 'leadstech') {
        // ====== ПРОВЕРКА ЧЕРЕЗ LEADSTECH (реальная прибыльность) ======
        const periodDays = rule.periodDays || 1;
        addLog('info', `🎯 Проверка через LeadsTech (период: ${periodDays} дней)`);

        // Получаем прибыльные баннеры через LeadsTech (доход > расход)
        const profitableBanners = await this.profitabilityService.getProfitableBanners(
          rule.userId,
          rule.vkAccountId,
          periodDays,
        );

        result.groupsChecked = profitableBanners.length;
        addLog('info', `Найдено ${profitableBanners.length} прибыльных объявлений`);

        // Собираем уникальные группы из прибыльных баннеров
        for (const banner of profitableBanners) {
          const adGroupId = banner.adGroupId;

          if (adGroupId && banner.profit > 0) {
            addLog('success', `Баннер ${banner.bannerId}: прибыль ${banner.profit.toFixed(2)}₽, ROI ${banner.roi.toFixed(0)}% → группа ${adGroupId}`);

            profitableGroupsSet.add(adGroupId);

            // Сохраняем данные о первом прибыльном баннере группы
            if (!profitableGroupsData.has(adGroupId)) {
              profitableGroupsData.set(adGroupId, {
                name: banner.bannerName || `Группа ${adGroupId}`,
                profit: banner.profit,
                roi: banner.roi,
                bannerId: banner.bannerId,
              });
            }
          }
        }
      } else {
        // ====== ПРОВЕРКА ПО CPL (классическая логика) ======
        addLog('info', `🎯 Проверка по CPL (порог: ${rule.cplThreshold}₽, мин. лидов: ${rule.minLeads})`);

        // Получаем только АКТИВНЫЕ баннеры (объявления)
        const banners = await this.vkService.getAllActiveBanners();
        result.groupsChecked = banners.length;

        addLog('info', `Найдено ${banners.length} активных объявлений`);

        // Получаем ID всех баннеров для статистики
        const bannerIds = banners.map((banner) => banner.id);

        // Получаем статистику за вчера по баннерам
        const statistics = await this.vkService.getStatistics(
          yesterday,
          yesterday,
          bannerIds,
          'banner',
        );

        // Создаем map для быстрого поиска статистики
        const statsMap = new Map<number, any>();
        for (const stat of statistics) {
          statsMap.set(stat.id, stat);
        }

        // Проверяем каждый баннер на соответствие условиям
        for (const banner of banners) {
          const stat = statsMap.get(banner.id);

          if (!stat || !stat.total || !stat.total.base) {
            continue;
          }

          // VK Реклама хранит результаты в vk.goals
          const vkData = stat.total.base.vk || {};
          const goals = vkData.goals || stat.total.base.goals || 0;
          const spent = parseFloat(stat.total.base.spent) || 0;
          const cpl = this.vkService.calculateCPL(spent, goals);

          // Проверяем условия правила
          if (
            goals >= rule.minLeads &&
            cpl < parseFloat(rule.cplThreshold.toString())
          ) {
            const bannerWithGroup = banner as any;
            const adGroupId = bannerWithGroup.ad_group_id;

            if (adGroupId) {
              addLog('success', `Баннер ${banner.id}: лиды=${goals}, CPL=${cpl.toFixed(2)}₽ → группа ${adGroupId}`);

              profitableGroupsSet.add(adGroupId);

              // Сохраняем данные о первом прибыльном баннере группы
              if (!profitableGroupsData.has(adGroupId)) {
                profitableGroupsData.set(adGroupId, {
                  name: `Группа ${adGroupId}`,
                  goals,
                  cpl: parseFloat(cpl.toFixed(2)),
                  bannerId: banner.id,
                });
              }
            }
          }
        }
      }

      // Дублируем каждую уникальную прибыльную группу
      const profitableGroups = Array.from(profitableGroupsSet);
      addLog('info', `📋 Очередь на дублирование: ${profitableGroups.length} групп (по ${rule.copiesCount} копий каждая)`);

      for (let i = 0; i < profitableGroups.length; i++) {
        const adGroupId = profitableGroups[i];
        const groupData = profitableGroupsData.get(adGroupId);
        if (!groupData) continue;

        result.groupsMatched++;
        addLog('info', `[${i + 1}/${profitableGroups.length}] Копирую группу ${adGroupId} (${groupData.name})...`);

        try {
          // Создаём копии группы с заданным бюджетом (или оригинальным, если не указан)
          const copyBudget = rule.copyBudget ? parseFloat(rule.copyBudget.toString()) : undefined;
          const copiedIds = await this.vkService.createAdGroupCopies(
            adGroupId,
            rule.copiesCount,
            copyBudget,
          );

          result.copiesCreated += copiedIds.length;

          result.details.successfulGroups.push({
            originalId: adGroupId,
            name: groupData.name,
            copiedIds,
            goals: groupData.goals,
            cpl: groupData.cpl,
            profit: groupData.profit,
            roi: groupData.roi,
          });

          addLog('success', `✅ Группа ${adGroupId}: создано ${copiedIds.length} копий (ID: ${copiedIds.join(', ')})`);
        } catch (error) {
          addLog('error', `❌ Группа ${adGroupId}: ${error.message}`);
          result.details.failedGroups.push({
            originalId: adGroupId,
            name: groupData.name,
            error: error.message,
          });
          result.status = 'partial';
        }
      }

      // Сохраняем результат выполнения
      const execution = await this.prisma.ruleExecution.create({
        data: {
          ruleId,
          groupsChecked: result.groupsChecked,
          groupsMatched: result.groupsMatched,
          copiesCreated: result.copiesCreated,
          status: result.status,
          details: result.details,
        },
      });

      // Сохраняем информацию о каждой копии
      for (const group of result.details.successfulGroups) {
        for (const copiedId of group.copiedIds) {
          await this.prisma.adGroupCopy.create({
            data: {
              ruleExecutionId: execution.id,
              originalAdId: group.originalId,
              copiedAdId: copiedId,
            },
          });
        }
      }

      // Отправляем уведомление в Telegram
      if (rule.user.telegramChatId) {
        await this.notificationsService.sendRuleExecutionReport(
          rule.user.telegramChatId.toString(),
          rule.name,
          result,
        );
      }

      addLog('success', `🏁 Готово! Создано ${result.copiesCreated} копий из ${result.groupsMatched} групп`);

      return result;
    } catch (error) {
      addLog('error', `💥 Критическая ошибка: ${error.message}`);

      // Сохраняем ошибку
      await this.prisma.ruleExecution.create({
        data: {
          ruleId,
          groupsChecked: result.groupsChecked,
          groupsMatched: result.groupsMatched,
          copiesCreated: result.copiesCreated,
          status: 'failed',
          errorMessage: error.message,
          details: result.details,
        },
      });

      return {
        ...result,
        status: 'failed',
        errorMessage: error.message,
        logs,
      };
    } finally {
      // Сбрасываем токен к дефолтному после выполнения
      this.vkService.resetAccessToken();
    }
  }

  /**
   * Тестовый запуск правила (симуляция без создания копий)
   */
  async testRule(ruleId: number, userId: number) {
    const rule = await this.prisma.rule.findFirst({
      where: { id: ruleId, userId },
      include: { vkAccount: true },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${ruleId} не найдено`);
    }

    this.logger.log(`🧪 Тестовый запуск правила ID: ${ruleId}`);

    // Устанавливаем токен из VK аккаунта
    if (rule.vkAccount?.accessToken) {
      this.vkService.setAccessToken(rule.vkAccount.accessToken);
      this.logger.log(`Используем токен аккаунта: ${rule.vkAccount.name}`);
    }

    try {
      // Если выбран режим LeadsTech - проверяем объявления через LeadsTech
      if (rule.profitabilityCheck === 'leadstech') {
        const periodDays = rule.periodDays || 1;
        this.logger.log(`🎯 Тест: проверяем прибыльность через LeadsTech (период: ${periodDays} дней, rule.periodDays=${rule.periodDays})`);

        // Получаем полную статистику прибыльности через LeadsTech
        const profitabilityResult = await this.profitabilityService.getProfitability(
          rule.userId,
          rule.vkAccountId,
          periodDays,
        );

        const profitableBanners = profitabilityResult.profitable;
        this.logger.log(`Найдено ${profitableBanners.length} прибыльных баннеров из ${profitabilityResult.summary.totalBanners} проверенных`);

        // Собираем уникальные группы
        const profitableGroupsSet = new Set<number>();
        const matchingGroups = [];

        for (const banner of profitableBanners) {
          const adGroupId = banner.adGroupId;
          if (adGroupId && banner.profit > 0 && !profitableGroupsSet.has(adGroupId)) {
            profitableGroupsSet.add(adGroupId);
            matchingGroups.push({
              adGroupId,
              name: banner.bannerName || `Группа ${adGroupId}`,
              bannerId: banner.bannerId,
              profit: banner.profit,
              roi: banner.roi,
              wouldCreateCopies: rule.copiesCount,
            });
          }
        }

        return {
          checkType: 'leadstech',
          totalBannersChecked: profitabilityResult.summary.totalBanners,
          profitableBanners: profitableBanners.length,
          uniqueGroups: matchingGroups.length,
          wouldCreateCopies: matchingGroups.length * rule.copiesCount,
          details: matchingGroups,
          period: profitabilityResult.period,
        };
      }

      // Иначе проверяем по CPL (классический режим)
      const yesterday = this.vkService.getYesterdayDate();

      // Получаем только АКТИВНЫЕ группы объявлений (с пагинацией)
      const adGroups = await this.vkService.getActiveAdGroups();
      const adGroupIds = adGroups.map((group) => group.id);

      // Получаем статистику
      const statistics = await this.vkService.getStatistics(
        yesterday,
        yesterday,
        adGroupIds,
        'ad_group',
      );

      // Создаем map для быстрого поиска
      const statsMap = new Map<number, any>();
      for (const stat of statistics) {
        statsMap.set(stat.id, stat);
      }

      const matchingGroups = [];

      for (const group of adGroups) {
        const stat = statsMap.get(group.id);

        if (!stat || !stat.total || !stat.total.base) {
          continue;
        }

        // VK Реклама хранит результаты в vk.goals, а не в goals
        const vkData = stat.total.base.vk || {};
        const goals = vkData.goals || stat.total.base.goals || 0;
        const spent = parseFloat(stat.total.base.spent) || 0;
        const cpl = this.vkService.calculateCPL(spent, goals);

        if (
          goals >= rule.minLeads &&
          cpl < parseFloat(rule.cplThreshold.toString())
        ) {
          matchingGroups.push({
            adGroupId: group.id,
            name: group.name,
            goals,
            spent,
            cpl: parseFloat(cpl.toFixed(2)),
            wouldCreateCopies: rule.copiesCount,
          });
        }
      }

      return {
        checkType: 'cpl',
        totalGroupsChecked: adGroups.length,
        matchingGroups: matchingGroups.length,
        wouldCreateCopies: matchingGroups.length * rule.copiesCount,
        details: matchingGroups,
      };
    } finally {
      this.vkService.resetAccessToken();
    }
  }

  /**
   * Получить активные правила для планировщика
   */
  async getActiveRules() {
    return this.prisma.rule.findMany({
      where: { isActive: true },
      include: {
        user: true,
        adAccount: true,
      },
    });
  }
}
