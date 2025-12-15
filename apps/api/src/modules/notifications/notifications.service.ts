import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';

interface ExecutionResult {
  groupsChecked: number;
  groupsMatched: number;
  copiesCreated: number;
  status: string;
  details: any;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private bot: Telegraf;
  private enabled: boolean;

  constructor(private configService: ConfigService) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    const enabledValue = this.configService.get<string>('TELEGRAM_NOTIFICATIONS_ENABLED');
    this.enabled = enabledValue === 'true';

    if (token && this.enabled) {
      try {
        this.bot = new Telegraf(token);
        this.logger.log('✅ Telegram-бот инициализирован');
      } catch (error) {
        this.logger.error('Ошибка инициализации Telegram-бота:', error.message);
        this.enabled = false;
      }
    } else {
      this.logger.warn('⚠️  Telegram-уведомления отключены');
    }
  }

  /**
   * Отправить сообщение в Telegram
   */
  async sendMessage(chatId: string, message: string): Promise<void> {
    if (!this.enabled || !this.bot) {
      this.logger.debug('Telegram-уведомления отключены, сообщение не отправлено');
      return;
    }

    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'HTML',
      });
      this.logger.log(`✉️  Сообщение отправлено в Telegram (chat: ${chatId})`);
    } catch (error) {
      this.logger.error(
        `Ошибка отправки сообщения в Telegram (chat: ${chatId}):`,
        error.message,
      );
    }
  }

  /**
   * Отправить отчет о выполнении правила
   */
  async sendRuleExecutionReport(
    chatId: string,
    ruleName: string,
    result: ExecutionResult,
  ): Promise<void> {
    const statusEmoji = result.status === 'success' ? '✅' : result.status === 'partial' ? '⚠️' : '❌';

    let message = `
${statusEmoji} <b>Отчет о выполнении правила</b>

<b>Правило:</b> ${ruleName}
<b>Статус:</b> ${this.getStatusText(result.status)}

<b>📊 Статистика:</b>
• Проверено групп: ${result.groupsChecked}
• Подошли под правило: ${result.groupsMatched}
• Создано копий: ${result.copiesCreated}
`;

    if (result.details?.successfulGroups?.length > 0) {
      message += '\n<b>✅ Успешные группы:</b>\n';
      for (const group of result.details.successfulGroups) {
        message += `• ID ${group.originalId}: ${group.leads} лидов, CPL ${group.cpl}₽ → ${group.copiedIds.length} копий\n`;
      }
    }

    if (result.details?.failedGroups?.length > 0) {
      message += '\n<b>❌ Ошибки:</b>\n';
      for (const group of result.details.failedGroups) {
        message += `• ID ${group.originalId}: ${group.error}\n`;
      }
    }

    await this.sendMessage(chatId, message);
  }

  /**
   * Получить текст статуса
   */
  private getStatusText(status: string): string {
    switch (status) {
      case 'success':
        return 'Успешно';
      case 'partial':
        return 'Частично выполнено';
      case 'failed':
        return 'Ошибка';
      default:
        return status;
    }
  }

  /**
   * Отправить тестовое сообщение
   */
  async sendTestMessage(chatId: string): Promise<void> {
    const message = `
🤖 <b>Тестовое сообщение</b>

VK Automation Platform успешно подключен к вашему Telegram!

Вы будете получать уведомления о:
• Выполнении правил автодублирования
• Автоматическом отключении объявлений
• Созданных копиях объявлений
• Ошибках и проблемах

<i>Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</i>
`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Отправить отчет об автоматическом отключении объявлений
   */
  async sendAutoDisableReport(
    chatId: string,
    ruleName: string,
    result: {
      adsChecked: number;
      adsDisabled: number;
      status: string;
      details?: { adId: number; name: string; spent: number; metricValue: number; threshold: number; metricType: string }[];
    },
  ): Promise<void> {
    const statusEmoji = result.status === 'success' ? '🔴' : '❌';

    // Общая сумма потраченного бюджета на отключённых объявлениях
    const totalSpent = result.details?.reduce((sum, ad) => sum + (ad.spent || 0), 0) || 0;

    let message = `
${statusEmoji} <b>Автоотключение объявлений</b>

<b>Правило:</b> ${ruleName}
<b>Статус:</b> ${this.getStatusText(result.status)}

<b>📊 Статистика:</b>
• Проверено объявлений: ${result.adsChecked}
• Отключено: ${result.adsDisabled}
• Потрачено на отключённых: ${totalSpent.toFixed(2)}₽
`;

    if (result.details && result.details.length > 0) {
      message += '\n<b>Отключённые объявления:</b>\n';
      for (const ad of result.details.slice(0, 10)) {
        const metricLabel = this.getMetricLabel(ad.metricType);
        message += `• ${ad.name} (ID: ${ad.adId})\n`;
        message += `  💰 Потрачено: ${ad.spent.toFixed(2)}₽ | ${metricLabel}: ${ad.metricValue} (порог: ${ad.threshold})\n`;
      }
      if (result.details.length > 10) {
        message += `<i>...и ещё ${result.details.length - 10}</i>\n`;
      }
    }

    message += `\n<i>${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</i>`;

    await this.sendMessage(chatId, message);
  }

  /**
   * Получить человекочитаемое название метрики
   */
  private getMetricLabel(metricType: string): string {
    switch (metricType) {
      case 'clicks':
        return 'Кликов';
      case 'goals':
        return 'Результатов';
      case 'ctr':
        return 'CTR';
      case 'cpl':
        return 'CPL';
      default:
        return metricType;
    }
  }
}
