import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VkAccountsService } from '../vk-accounts/vk-accounts.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

export interface ExecutionResult {
  groupsChecked: number;
  groupsMatched: number;
  copiesCreated: number;
  status: 'success' | 'partial' | 'failed';
  errorMessage?: string;
  details: any;
}

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
    private notificationsService: NotificationsService,
    private vkAccountsService: VkAccountsService,
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
    this.logger.log(`🚀 Выполнение правила ID: ${ruleId}`);

    const rule = await this.prisma.rule.findUnique({
      where: { id: ruleId },
      include: {
        user: true,
        adAccount: true,
        vkAccount: true,
      },
    });

    if (!rule || !rule.isActive) {
      this.logger.warn(`Правило ${ruleId} неактивно или не найдено`);
      return {
        groupsChecked: 0,
        groupsMatched: 0,
        copiesCreated: 0,
        status: 'failed',
        errorMessage: 'Правило неактивно или не найдено',
        details: {},
      };
    }

    // Устанавливаем токен из VK аккаунта для этого правила
    if (rule.vkAccount?.accessToken) {
      this.vkService.setAccessToken(rule.vkAccount.accessToken);
      this.logger.log(`Используем токен аккаунта: ${rule.vkAccount.name}`);
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
    };

    try {
      // Получаем вчерашнюю дату
      const yesterday = this.vkService.getYesterdayDate();

      // Получаем только АКТИВНЫЕ группы объявлений (с пагинацией)
      const adGroups = await this.vkService.getActiveAdGroups();
      result.groupsChecked = adGroups.length;

      this.logger.log(`Проверяем ${adGroups.length} активных групп объявлений`);

      // Получаем ID всех групп для статистики
      const adGroupIds = adGroups.map((group) => group.id);

      // Получаем статистику за вчера
      const statistics = await this.vkService.getStatistics(
        yesterday,
        yesterday,
        adGroupIds,
        'ad_group',
      );

      // Создаем map для быстрого поиска статистики
      const statsMap = new Map<number, any>();
      for (const stat of statistics) {
        statsMap.set(stat.id, stat);
      }

      // Проверяем каждую группу на соответствие условиям
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

        this.logger.debug(
          `Группа ${group.id} (${group.name}): результатов=${goals}, CPL=${cpl.toFixed(2)}₽`,
        );

        // Проверяем условия правила
        if (
          goals >= rule.minLeads &&
          cpl < parseFloat(rule.cplThreshold.toString())
        ) {
          this.logger.log(
            `✅ Группа ${group.id} подходит под правило! Создаём ${rule.copiesCount} копий`,
          );

          result.groupsMatched++;

          try {
            // Создаём копии с заданным бюджетом (или оригинальным, если не указан)
            const copyBudget = rule.copyBudget ? parseFloat(rule.copyBudget.toString()) : undefined;
            const copiedIds = await this.vkService.createAdGroupCopies(
              group.id,
              rule.copiesCount,
              copyBudget,
            );

            result.copiesCreated += copiedIds.length;

            result.details.successfulGroups.push({
              originalId: group.id,
              name: group.name,
              copiedIds,
              goals,
              cpl: parseFloat(cpl.toFixed(2)),
            });
          } catch (error) {
            this.logger.error(
              `Ошибка при создании копий для группы ${group.id}:`,
              error.message,
            );
            result.details.failedGroups.push({
              originalId: group.id,
              name: group.name,
              error: error.message,
            });
            result.status = 'partial';
          }
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

      this.logger.log(
        `✅ Правило ${ruleId} выполнено. Создано ${result.copiesCreated} копий из ${result.groupsMatched} подходящих групп`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Ошибка выполнения правила ${ruleId}:`, error.message);

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
