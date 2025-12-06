import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { RulesService } from '../rules/rules.service';
import { AutoDisableService } from '../auto-disable/auto-disable.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly schedulerEnabled: boolean;

  constructor(
    private configService: ConfigService,
    private schedulerRegistry: SchedulerRegistry,
    private rulesService: RulesService,
    private autoDisableService: AutoDisableService,
  ) {
    this.schedulerEnabled = this.configService.get<string>('SCHEDULER_ENABLED') === 'true';
  }

  async onModuleInit() {
    if (!this.schedulerEnabled) {
      this.logger.warn('⏸️  Scheduler отключен в настройках');
      return;
    }

    this.logger.log('🕐 Инициализация scheduler');
    await this.setupRuleCronJobs();
    this.setupAutoDisableCronJob();
  }

  /**
   * Настроить cron-задачу для автоправил (каждые 10 минут)
   */
  private setupAutoDisableCronJob() {
    const jobName = 'auto_disable_check';

    // Каждые 10 минут: */10 * * * *
    const cronExpression = '*/10 * * * *';

    this.logger.log(`📅 Автоправила запланированы на каждые 10 минут (cron: ${cronExpression})`);

    const job = new CronJob(cronExpression, async () => {
      this.logger.log('⏰ Запуск проверки автоправил');
      await this.executeAllAutoDisableRules();
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  /**
   * Выполнить все активные автоправила
   */
  private async executeAllAutoDisableRules() {
    try {
      const rules = await this.autoDisableService.findAllActive();

      this.logger.log(`Найдено ${rules.length} активных автоправил`);

      for (const rule of rules) {
        try {
          await this.autoDisableService.executeRule(rule.id);
        } catch (error) {
          this.logger.error(`Ошибка выполнения автоправила ${rule.id}: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Ошибка получения автоправил: ${error.message}`);
    }
  }

  /**
   * Настроить cron-задачи для всех активных правил
   */
  async setupRuleCronJobs() {
    const rules = await this.rulesService.getActiveRules();

    this.logger.log(`Найдено ${rules.length} активных правил`);

    for (const rule of rules) {
      try {
        await this.scheduleRule(rule.id, rule.runTime);
      } catch (error) {
        this.logger.error(
          `Ошибка настройки cron для правила ${rule.id}:`,
          error.message,
        );
      }
    }
  }

  /**
   * Запланировать выполнение правила на определенное время
   * @param ruleId - ID правила
   * @param runTime - время в формате HH:MM (например, "09:00")
   */
  async scheduleRule(ruleId: number, runTime: string) {
    const jobName = `rule_${ruleId}`;

    // Удаляем существующую задачу если есть
    try {
      this.schedulerRegistry.deleteCronJob(jobName);
    } catch (error) {
      // Задачи не было
    }

    // Парсим время
    const [hour, minute] = runTime.split(':').map(Number);

    if (isNaN(hour) || isNaN(minute)) {
      throw new Error(`Неверный формат времени: ${runTime}`);
    }

    // Создаём cron-выражение для ежедневного запуска в заданное время (по МСК)
    const cronExpression = `${minute} ${hour} * * *`;

    this.logger.log(
      `📅 Правило ${ruleId} запланировано на ${runTime} (cron: ${cronExpression})`,
    );

    const job = new CronJob(cronExpression, async () => {
      this.logger.log(`⏰ Запуск правила ${ruleId} по расписанию`);
      try {
        await this.rulesService.executeRule(ruleId);
      } catch (error) {
        this.logger.error(
          `Ошибка выполнения правила ${ruleId}:`,
          error.message,
        );
      }
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();
  }

  /**
   * Отменить выполнение правила
   */
  async unscheduleRule(ruleId: number) {
    const jobName = `rule_${ruleId}`;

    try {
      this.schedulerRegistry.deleteCronJob(jobName);
      this.logger.log(`🗑️  Задача для правила ${ruleId} удалена`);
    } catch (error) {
      this.logger.warn(`Задача ${jobName} не найдена`);
    }
  }

  /**
   * Обновить расписание правила
   */
  async rescheduleRule(ruleId: number, runTime: string) {
    await this.unscheduleRule(ruleId);
    await this.scheduleRule(ruleId, runTime);
  }

  /**
   * Получить все активные задачи
   */
  getScheduledJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    const result = [];

    jobs.forEach((job, name) => {
      result.push({
        name,
        running: job.running,
        lastDate: job.lastDate(),
        nextDate: job.nextDate(),
      });
    });

    return result;
  }
}
