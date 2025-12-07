import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { VkAccountsService } from '../vk-accounts/vk-accounts.service';
import { CreateScalingTaskDto } from './dto/create-scaling-task.dto';
import { CreateBatchScalingTaskDto } from './dto/create-batch-scaling-task.dto';

const DELAY_BETWEEN_COPIES_MS = 6000; // 6 секунд между копиями
const MAX_COPIES = 15;
const WARNING_THRESHOLD = 10;

interface CreatedCopy {
  id: number;
  name: string;
}

@Injectable()
export class ScalingService {
  private readonly logger = new Logger(ScalingService.name);
  private runningTasks: Set<number> = new Set();
  private taskQueue: number[] = [];
  private isProcessingQueue = false;

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
    private vkAccountsService: VkAccountsService,
  ) {}

  /**
   * Проверить существование группы объявлений
   */
  async verifyAdGroup(userId: number, vkAccountId: number, adGroupId: number) {
    // Проверяем что аккаунт принадлежит пользователю
    await this.vkAccountsService.findOne(vkAccountId, userId);

    // Получаем аккаунт с токеном
    const vkAccount = await this.vkAccountsService.findOneWithToken(vkAccountId);

    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    this.vkService.setAccessToken(vkAccount.accessToken);

    try {
      // Получаем группу напрямую по ID
      const group = await this.vkService.getAdGroupById(adGroupId);

      if (!group) {
        throw new NotFoundException(`Группа объявлений с ID ${adGroupId} не найдена`);
      }

      return {
        id: group.id,
        name: group.name,
        status: group.status,
      };
    } finally {
      this.vkService.resetAccessToken();
    }
  }

  /**
   * Создать задачу масштабирования
   */
  async createTask(userId: number, dto: CreateScalingTaskDto) {
    if (dto.copiesCount > MAX_COPIES) {
      throw new BadRequestException(`Максимальное количество копий: ${MAX_COPIES}`);
    }

    // Проверяем существование группы
    const adGroup = await this.verifyAdGroup(userId, dto.vkAccountId, dto.adGroupId);

    // Создаем задачу
    const task = await this.prisma.scalingTask.create({
      data: {
        userId,
        vkAccountId: dto.vkAccountId,
        sourceAdGroupId: BigInt(dto.adGroupId),
        sourceAdGroupName: adGroup.name,
        copiesCount: dto.copiesCount,
        status: 'pending',
      },
    });

    // Запускаем выполнение в фоне
    this.executeTask(task.id).catch((error) => {
      this.logger.error(`Ошибка выполнения задачи ${task.id}: ${error.message}`);
    });

    const warning = dto.copiesCount > WARNING_THRESHOLD
      ? `Внимание: создание ${dto.copiesCount} копий займет около ${Math.ceil(dto.copiesCount * DELAY_BETWEEN_COPIES_MS / 1000 / 60)} минут. Возможны сбои при высокой нагрузке на API.`
      : null;

    return {
      id: task.id,
      status: 'pending',
      message: `Задача создана. Создание ${dto.copiesCount} копий группы "${adGroup.name}"`,
      warning,
      estimatedTime: Math.ceil(dto.copiesCount * DELAY_BETWEEN_COPIES_MS / 1000),
    };
  }

  /**
   * Создать пакетные задачи масштабирования (очередь)
   */
  async createBatchTasks(userId: number, dto: CreateBatchScalingTaskDto) {
    if (dto.copiesCount > MAX_COPIES) {
      throw new BadRequestException(`Максимальное количество копий: ${MAX_COPIES}`);
    }

    if (dto.adGroupIds.length > 50) {
      throw new BadRequestException('Максимум 50 групп за раз');
    }

    // Проверяем что аккаунт принадлежит пользователю
    const vkAccount = await this.vkAccountsService.findOneWithToken(dto.vkAccountId);
    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    const createdTasks: any[] = [];
    const errors: { adGroupId: number; error: string }[] = [];

    this.vkService.setAccessToken(vkAccount.accessToken);

    try {
      // Создаем задачи для каждой группы
      for (const adGroupId of dto.adGroupIds) {
        try {
          // Проверяем существование группы
          const group = await this.vkService.getAdGroupById(adGroupId);

          if (!group) {
            errors.push({ adGroupId, error: 'Группа не найдена' });
            continue;
          }

          // Создаем задачу
          const task = await this.prisma.scalingTask.create({
            data: {
              userId,
              vkAccountId: dto.vkAccountId,
              sourceAdGroupId: BigInt(adGroupId),
              sourceAdGroupName: group.name,
              copiesCount: dto.copiesCount,
              status: 'pending',
            },
          });

          createdTasks.push({
            id: task.id,
            adGroupId,
            adGroupName: group.name,
          });

          // Добавляем в очередь
          this.taskQueue.push(task.id);

          this.logger.log(`Задача ${task.id} добавлена в очередь для группы ${adGroupId}`);
        } catch (error) {
          errors.push({ adGroupId, error: error.message });
        }
      }
    } finally {
      this.vkService.resetAccessToken();
    }

    // Запускаем обработку очереди если ещё не запущена
    if (!this.isProcessingQueue && this.taskQueue.length > 0) {
      this.processQueue().catch((error) => {
        this.logger.error(`Ошибка обработки очереди: ${error.message}`);
      });
    }

    const totalCopies = createdTasks.length * dto.copiesCount;
    const estimatedMinutes = Math.ceil(totalCopies * DELAY_BETWEEN_COPIES_MS / 1000 / 60);

    return {
      success: true,
      createdTasks,
      errors,
      totalTasks: createdTasks.length,
      totalCopies,
      message: `Создано ${createdTasks.length} задач. Будет создано ${totalCopies} копий.`,
      estimatedTime: `~${estimatedMinutes} минут`,
      queuePosition: this.taskQueue.length,
    };
  }

  /**
   * Обработка очереди задач последовательно
   */
  private async processQueue() {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;
    this.logger.log(`Начало обработки очереди. Задач в очереди: ${this.taskQueue.length}`);

    try {
      while (this.taskQueue.length > 0) {
        const taskId = this.taskQueue.shift();
        if (taskId) {
          this.logger.log(`Обработка задачи ${taskId}. Осталось в очереди: ${this.taskQueue.length}`);
          await this.executeTask(taskId);

          // Небольшая задержка между задачами
          if (this.taskQueue.length > 0) {
            await this.delay(2000);
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
      this.logger.log('Очередь обработана');
    }
  }

  /**
   * Выполнить задачу масштабирования
   */
  private async executeTask(taskId: number) {
    if (this.runningTasks.has(taskId)) {
      this.logger.warn(`Задача ${taskId} уже выполняется`);
      return;
    }

    this.runningTasks.add(taskId);

    try {
      const task = await this.prisma.scalingTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new NotFoundException(`Задача ${taskId} не найдена`);
      }

      // Получаем VK аккаунт
      const vkAccount = await this.prisma.vkAccount.findUnique({
        where: { id: task.vkAccountId },
      });

      if (!vkAccount) {
        throw new Error('VK аккаунт не найден');
      }

      // Обновляем статус на running
      await this.prisma.scalingTask.update({
        where: { id: taskId },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      this.vkService.setAccessToken(vkAccount.accessToken);

      const createdCopies: CreatedCopy[] = [];
      const sourceAdGroupId = Number(task.sourceAdGroupId);

      this.logger.log(`Начало масштабирования группы ${sourceAdGroupId}, создаем ${task.copiesCount} копий`);

      for (let i = 0; i < task.copiesCount; i++) {
        try {
          // Создаем копию
          const copyResult = await this.vkService.createAdGroupCopy(sourceAdGroupId);

          if (copyResult && copyResult.id) {
            createdCopies.push({
              id: copyResult.id,
              name: copyResult.name || `Копия ${i + 1}`,
            });

            this.logger.log(`Создана копия ${i + 1}/${task.copiesCount}: ID ${copyResult.id}`);
          }

          // Обновляем прогресс
          const progress = Math.round(((i + 1) / task.copiesCount) * 100);
          await this.prisma.scalingTask.update({
            where: { id: taskId },
            data: {
              progress,
              copiesCreated: createdCopies.length,
              createdCopies: createdCopies as any,
            },
          });

          // Задержка между запросами (кроме последнего)
          if (i < task.copiesCount - 1) {
            await this.delay(DELAY_BETWEEN_COPIES_MS);
          }
        } catch (error) {
          this.logger.error(`Ошибка создания копии ${i + 1}: ${error.message}`);
          // Продолжаем с следующей копией
        }
      }

      // Завершаем задачу
      const finalStatus = createdCopies.length === task.copiesCount ? 'completed' :
                          createdCopies.length > 0 ? 'completed' : 'failed';

      await this.prisma.scalingTask.update({
        where: { id: taskId },
        data: {
          status: finalStatus,
          progress: 100,
          copiesCreated: createdCopies.length,
          createdCopies: createdCopies as any,
          completedAt: new Date(),
          errorMessage: createdCopies.length < task.copiesCount
            ? `Создано ${createdCopies.length} из ${task.copiesCount} копий`
            : null,
        },
      });

      this.logger.log(`Задача ${taskId} завершена: создано ${createdCopies.length}/${task.copiesCount} копий`);
    } catch (error) {
      this.logger.error(`Ошибка задачи ${taskId}: ${error.message}`);

      await this.prisma.scalingTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });
    } finally {
      this.vkService.resetAccessToken();
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * Преобразовать задачу для JSON (BigInt -> string)
   */
  private serializeTask(task: any) {
    return {
      ...task,
      sourceAdGroupId: task.sourceAdGroupId?.toString(),
    };
  }

  /**
   * Получить все задачи пользователя
   */
  async getTasks(userId: number, vkAccountId?: number) {
    const tasks = await this.prisma.scalingTask.findMany({
      where: {
        userId,
        ...(vkAccountId ? { vkAccountId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return tasks.map((task) => this.serializeTask(task));
  }

  /**
   * Получить задачу по ID
   */
  async getTask(taskId: number, userId: number) {
    const task = await this.prisma.scalingTask.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new NotFoundException(`Задача ${taskId} не найдена`);
    }

    return this.serializeTask(task);
  }

  /**
   * Удалить задачу
   */
  async deleteTask(taskId: number, userId: number) {
    const task = await this.getTask(taskId, userId);

    if (task.status === 'running') {
      throw new BadRequestException('Нельзя удалить выполняющуюся задачу');
    }

    await this.prisma.scalingTask.delete({
      where: { id: taskId },
    });

    return { message: 'Задача удалена' };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
