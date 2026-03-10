import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService, AdStatistics } from '../vk/vk.service';
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
  details: { adId: number; name: string; spent: number; metricValue: number; threshold: number; metricType: string }[];
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

  async create(userId: number, dto: CreateAutoDisableRuleDto) {
    // Проверяем доступ к VK аккаунту (нужен canEdit для создания правил)
    if (dto.vkAccountId) {
      const hasAccess = await this.checkVkAccountAccess(dto.vkAccountId, userId, true);
      if (!hasAccess) {
        throw new NotFoundException('VK аккаунт не найден или у вас нет прав на редактирование');
      }
    }

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
    // Если указан конкретный vkAccountId - проверяем доступ и возвращаем правила для него
    if (vkAccountId) {
      const hasAccess = await this.checkVkAccountAccess(vkAccountId, userId);
      if (!hasAccess) {
        return [];
      }

      return this.prisma.autoDisableRule.findMany({
        where: { vkAccountId },
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

    // Иначе возвращаем все правила пользователя
    return this.prisma.autoDisableRule.findMany({
      where: { userId },
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
    const rule = await this.prisma.autoDisableRule.findUnique({
      where: { id },
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

    // Проверяем доступ к правилу (владелец или через shared account)
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

  async update(id: number, userId: number, dto: UpdateAutoDisableRuleDto) {
    const rule = await this.prisma.autoDisableRule.findUnique({
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
          throw new NotFoundException('У вас нет прав на редактирование этого правила');
        }
      } else {
        throw new NotFoundException(`Правило с ID ${id} не найдено`);
      }
    }

    return this.prisma.autoDisableRule.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number, userId: number) {
    const rule = await this.prisma.autoDisableRule.findUnique({
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
          throw new NotFoundException('У вас нет прав на удаление этого правила');
        }
      } else {
        throw new NotFoundException(`Правило с ID ${id} не найдено`);
      }
    }

    await this.prisma.autoDisableRule.delete({
      where: { id },
    });

    return { message: 'Правило успешно удалено' };
  }

  /**
   * Выполнить правило автоотключения
   * Работает с БАННЕРАМИ (объявлениями), а не с группами объявлений
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

      // Получаем активные баннеры (объявления), а не группы
      const activeBanners = await this.vkService.getAllActiveBanners();
      result.adsChecked = activeBanners.length;

      if (activeBanners.length === 0) {
        this.logger.log('Нет активных баннеров (объявлений)');
        await this.saveExecution(ruleId, result);
        return result;
      }

      // Вычисляем период для статистики по московскому времени (VK API работает по МСК)
      // Логика: если правило на N дней, проверяем (N-1) предыдущих дней + сегодня
      // Например: 1 день = с 00:00 сегодня, 3 дня = с 00:00 позавчера, 7 дней = с 00:00 шести дней назад
      const moscowNow = this.getMoscowDate();
      const dateToStr = this.formatDateString(moscowNow);

      const dateFrom = new Date(moscowNow);
      dateFrom.setDate(dateFrom.getDate() - (rule.periodDays - 1));
      const dateFromStr = this.formatDateString(dateFrom);

      // Получаем статистику по БАННЕРАМ (объявлениям)
      const bannerIds = activeBanners.map((b) => b.id);
      const stats = await this.vkService.getStatistics(dateFromStr, dateToStr, bannerIds, 'banner');

      this.logger.log(`Получена статистика для ${stats.length} баннеров (из ${activeBanners.length} активных)`);
      this.logger.log(`Условие правила: ${rule.metricType} ${rule.operator} ${rule.threshold}, мин. бюджет: ${rule.minSpent}₽, период: ${dateFromStr} — ${dateToStr}`);

      // Создаём map для быстрого поиска статистики
      const statsMap = new Map<number, AdStatistics>();
      for (const stat of stats) {
        statsMap.set(stat.id, stat);
      }

      const threshold = Number(rule.threshold);
      const minSpent = Number(rule.minSpent);
      let skippedNoStats = 0;
      let skippedLowSpent = 0;
      let skippedConditionNotMet = 0;

      // Проверяем каждый баннер
      for (const banner of activeBanners) {
        const stat = statsMap.get(banner.id);

        // Если нет статистики — суммируем из rows вручную
        let spent = 0;
        let clicks = 0;
        let shows = 0;
        let goals = 0;

        if (stat?.total?.base) {
          const base = stat.total.base;
          const baseAny = base as any;
          const vkData = baseAny.vk || {};
          spent = parseFloat(base.spent) || 0;
          clicks = baseAny.clicks || 0;
          shows = baseAny.shows || 0;
          goals = vkData.goals || baseAny.goals || 0;
        } else if (stat?.rows && stat.rows.length > 0) {
          // Fallback: суммируем из дневных строк если total отсутствует
          for (const row of stat.rows) {
            const rowBase = row.base as any;
            if (!rowBase) continue;
            spent += parseFloat(rowBase.spent) || 0;
            clicks += rowBase.clicks || 0;
            shows += rowBase.shows || 0;
            const rowVk = rowBase.vk || {};
            goals += rowVk.goals || rowBase.goals || 0;
          }
          this.logger.warn(`Баннер ${banner.id}: total отсутствует, суммировали из ${stat.rows.length} дневных строк (spent=${spent.toFixed(2)})`);
        } else {
          skippedNoStats++;
          continue;
        }

        // ГЛАВНОЕ УСЛОВИЕ: проверяем потраченный бюджет
        if (spent < minSpent) {
          skippedLowSpent++;
          continue;
        }

        // Вычисляем метрику для проверки
        let metricValue: number;

        switch (rule.metricType) {
          case 'clicks':
            metricValue = clicks;
            break;
          case 'goals':
            metricValue = goals;
            break;
          case 'ctr':
            metricValue = shows > 0 ? (clicks / shows) * 100 : 0;
            break;
          case 'cpl':
            metricValue = goals > 0 ? spent / goals : 999999;
            break;
          default:
            continue;
        }

        // Пропускаем если метрика NaN или Infinity
        if (!Number.isFinite(metricValue)) {
          continue;
        }

        // Проверяем условие
        let shouldDisable = false;
        if (rule.operator === 'lt') {
          shouldDisable = metricValue < threshold;
        } else if (rule.operator === 'lte') {
          shouldDisable = metricValue <= threshold;
        } else if (rule.operator === 'eq') {
          shouldDisable = metricValue === threshold;
        } else if (rule.operator === 'gt') {
          shouldDisable = metricValue > threshold;
        } else if (rule.operator === 'gte') {
          shouldDisable = metricValue >= threshold;
        }

        if (shouldDisable) {
          const bannerName = (banner as any).name || `Баннер ${banner.id}`;
          this.logger.log(
            `🔴 Отключение объявления ${banner.id} (${bannerName}): spent=${spent.toFixed(2)}₽, ${rule.metricType}=${metricValue.toFixed(2)} ${rule.operator} ${threshold}`,
          );

          try {
            await this.vkService.stopBanner(banner.id);
            result.adsDisabled++;
            result.details.push({
              adId: banner.id,
              name: bannerName,
              spent: Math.round(spent * 100) / 100,
              metricValue: Math.round(metricValue * 100) / 100,
              threshold,
              metricType: rule.metricType,
            });
          } catch (error) {
            this.logger.error(`Ошибка отключения баннера ${banner.id}: ${error.message}`);
          }
        } else {
          skippedConditionNotMet++;
        }
      }

      this.logger.log(
        `📊 Итог: отключено ${result.adsDisabled}, пропущено: нет статистики=${skippedNoStats}, мало потрачено=${skippedLowSpent}, условие не выполнено=${skippedConditionNotMet}`,
      );

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
      { value: 'clicks', label: 'Клики', unit: '' },
      { value: 'goals', label: 'Результаты (лиды)', unit: '' },
      { value: 'ctr', label: 'CTR', unit: '%' },
      { value: 'cpl', label: 'CPL (цена за результат)', unit: '₽' },
    ];
  }

  /**
   * Получить операторы для UI
   */
  getOperators() {
    return [
      { value: 'lt', label: '< (меньше)' },
      { value: 'lte', label: '≤ (меньше или равно)' },
      { value: 'eq', label: '= (равно)' },
      { value: 'gt', label: '> (больше)' },
      { value: 'gte', label: '≥ (больше или равно)' },
    ];
  }

  /**
   * Получить текущую дату в московском времени (UTC+3)
   * VK API работает по московскому времени
   */
  private getMoscowDate(): Date {
    const now = new Date();
    const moscowOffset = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
    return new Date(now.getTime() + moscowOffset);
  }

  /**
   * Форматировать дату в строку YYYY-MM-DD
   */
  private formatDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
