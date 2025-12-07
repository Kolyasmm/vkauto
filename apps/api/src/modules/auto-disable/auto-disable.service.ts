import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { VkAccountsService } from '../vk-accounts/vk-accounts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAutoDisableRuleDto } from './dto/create-auto-disable-rule.dto';
import { UpdateAutoDisableRuleDto } from './dto/update-auto-disable-rule.dto';
import { Decimal } from '@prisma/client/runtime/library';

export interface AutoDisableExecutionResult {
  adsChecked: number;
  adsDisabled: number;
  status: 'success' | 'failed';
  errorMessage?: string;
  details: { adId: number; name: string; metricValue: number; threshold: number }[];
}

@Injectable()
export class AutoDisableService {
  private readonly logger = new Logger(AutoDisableService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
    private vkAccountsService: VkAccountsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(userId: number, dto: CreateAutoDisableRuleDto) {
    return this.prisma.autoDisableRule.create({
      data: {
        userId,
        vkAccountId: dto.vkAccountId,
        name: dto.name,
        metricType: dto.metricType,
        operator: dto.operator,
        threshold: dto.threshold,
        periodDays: dto.periodDays,
        minSpent: dto.minSpent,
        runTime: dto.runTime || '09:00',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async findAll(userId: number, vkAccountId?: number) {
    return this.prisma.autoDisableRule.findMany({
      where: {
        userId,
        ...(vkAccountId ? { vkAccountId } : {}),
      },
      include: {
        vkAccount: { select: { id: true, name: true } },
        executions: {
          take: 5,
          orderBy: { executedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, userId: number) {
    const rule = await this.prisma.autoDisableRule.findFirst({
      where: { id, userId },
      include: {
        vkAccount: { select: { id: true, name: true } },
        executions: {
          take: 10,
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${id} не найдено`);
    }

    return rule;
  }

  async update(id: number, userId: number, dto: UpdateAutoDisableRuleDto) {
    await this.findOne(id, userId);

    return this.prisma.autoDisableRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, userId: number) {
    await this.findOne(id, userId);

    await this.prisma.autoDisableRule.delete({
      where: { id },
    });

    return { message: 'Правило успешно удалено' };
  }

  /**
   * Выполнить правило автоотключения
   */
  async executeRule(ruleId: number): Promise<AutoDisableExecutionResult> {
    const rule = await this.prisma.autoDisableRule.findUnique({
      where: { id: ruleId },
      include: {
        vkAccount: true,
      },
    });

    if (!rule) {
      throw new NotFoundException(`Правило с ID ${ruleId} не найдено`);
    }

    if (!rule.vkAccount) {
      throw new Error('VK аккаунт не найден для этого правила');
    }

    this.logger.log(`Выполнение правила автоотключения: ${rule.name} (ID: ${ruleId})`);

    const result: AutoDisableExecutionResult = {
      adsChecked: 0,
      adsDisabled: 0,
      status: 'success',
      details: [],
    };

    try {
      // Устанавливаем токен для VK API
      this.vkService.setAccessToken(rule.vkAccount.accessToken);

      // Получаем активные группы объявлений
      const activeGroups = await this.vkService.getActiveAdGroups();
      result.adsChecked = activeGroups.length;

      if (activeGroups.length === 0) {
        this.logger.log('Нет активных групп объявлений');
        await this.saveExecution(ruleId, result);
        return result;
      }

      // Вычисляем период для статистики
      const dateTo = new Date();
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - rule.periodDays);

      const dateFromStr = dateFrom.toISOString().split('T')[0];
      const dateToStr = dateTo.toISOString().split('T')[0];

      // Получаем статистику
      const groupIds = activeGroups.map((g) => g.id);
      const stats = await this.vkService.getStatistics(dateFromStr, dateToStr, groupIds, 'ad_group');

      // Проверяем каждую группу
      for (const group of activeGroups) {
        const stat = stats.find((s) => s.id === group.id);
        if (!stat || !stat.total?.base) continue;

        const base = stat.total.base;
        const spent = parseFloat(base.spent);
        const minSpent = Number(rule.minSpent);

        // Проверяем минимальный бюджет
        if (spent < minSpent) continue;

        // Вычисляем метрику
        let metricValue: number;
        const threshold = Number(rule.threshold);

        switch (rule.metricType) {
          case 'cpc':
            metricValue = parseFloat(base.cpc);
            break;
          case 'ctr':
            // CTR = (clicks / shows) * 100
            metricValue = base.shows > 0 ? (base.clicks / base.shows) * 100 : 0;
            break;
          case 'cpl':
            // CPL = spent / goals
            metricValue = base.goals > 0 ? spent / base.goals : Infinity;
            break;
          case 'conversions':
            metricValue = base.goals;
            break;
          default:
            continue;
        }

        // Проверяем условие
        let shouldDisable = false;
        if (rule.operator === 'gte') {
          shouldDisable = metricValue >= threshold;
        } else if (rule.operator === 'lt') {
          shouldDisable = metricValue < threshold;
        }

        if (shouldDisable) {
          this.logger.log(
            `Отключение группы ${group.id} (${group.name}): ${rule.metricType}=${metricValue.toFixed(2)} ${rule.operator} ${threshold}`,
          );

          try {
            await this.vkService.stopAdGroup(group.id);
            result.adsDisabled++;
            result.details.push({
              adId: group.id,
              name: group.name,
              metricValue: Math.round(metricValue * 100) / 100,
              threshold,
            });
          } catch (error) {
            this.logger.error(`Ошибка отключения группы ${group.id}: ${error.message}`);
          }
        }
      }

      // Отправляем уведомление в Telegram
      if (rule.vkAccount.telegramChatId && result.adsDisabled > 0) {
        await this.notificationsService.sendAutoDisableReport(
          rule.vkAccount.telegramChatId,
          rule.name,
          result,
        );
      }
    } catch (error) {
      result.status = 'failed';
      result.errorMessage = error.message;
      this.logger.error(`Ошибка выполнения правила ${ruleId}: ${error.message}`);
    } finally {
      this.vkService.resetAccessToken();
      await this.saveExecution(ruleId, result);
    }

    return result;
  }

  private async saveExecution(ruleId: number, result: AutoDisableExecutionResult) {
    await this.prisma.autoDisableExecution.create({
      data: {
        ruleId,
        adsChecked: result.adsChecked,
        adsDisabled: result.adsDisabled,
        status: result.status,
        errorMessage: result.errorMessage,
        details: result.details as any,
      },
    });
  }

  /**
   * Получить правила для выполнения в указанное время
   */
  async getRulesForTime(time: string): Promise<any[]> {
    return this.prisma.autoDisableRule.findMany({
      where: {
        isActive: true,
        runTime: time,
      },
      include: {
        vkAccount: true,
      },
    });
  }

  /**
   * Получить все активные правила (для scheduler)
   */
  async findAllActive(): Promise<{ id: number }[]> {
    return this.prisma.autoDisableRule.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });
  }

  /**
   * Получить метрики для UI (описание типов метрик)
   */
  getMetricTypes() {
    return [
      { value: 'cpc', label: 'CPC (стоимость клика)', unit: '₽' },
      { value: 'ctr', label: 'CTR (кликабельность)', unit: '%' },
      { value: 'cpl', label: 'CPL (стоимость лида)', unit: '₽' },
      { value: 'conversions', label: 'Конверсии (количество)', unit: '' },
    ];
  }

  /**
   * Получить операторы для UI
   */
  getOperators() {
    return [
      { value: 'gte', label: '≥ (больше или равно)' },
      { value: 'lt', label: '< (меньше)' },
    ];
  }
}
