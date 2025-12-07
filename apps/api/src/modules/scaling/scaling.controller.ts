import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards';
import { ScalingService } from './scaling.service';
import { CreateScalingTaskDto } from './dto/create-scaling-task.dto';
import { CreateBatchScalingTaskDto } from './dto/create-batch-scaling-task.dto';

@Controller('scaling')
@UseGuards(JwtAuthGuard)
export class ScalingController {
  constructor(private readonly scalingService: ScalingService) {}

  /**
   * Проверить существование группы объявлений
   */
  @Get('verify/:vkAccountId/:adGroupId')
  async verifyAdGroup(
    @Request() req,
    @Param('vkAccountId') vkAccountId: string,
    @Param('adGroupId') adGroupId: string,
  ) {
    return this.scalingService.verifyAdGroup(req.user.id, +vkAccountId, +adGroupId);
  }

  /**
   * Создать задачу масштабирования
   */
  @Post()
  async createTask(@Request() req, @Body() dto: CreateScalingTaskDto) {
    return this.scalingService.createTask(req.user.id, dto);
  }

  /**
   * Создать пакетные задачи масштабирования (очередь)
   */
  @Post('batch')
  async createBatchTasks(@Request() req, @Body() dto: CreateBatchScalingTaskDto) {
    return this.scalingService.createBatchTasks(req.user.id, dto);
  }

  /**
   * Получить все задачи пользователя
   */
  @Get()
  async getTasks(@Request() req, @Query('vkAccountId') vkAccountId?: string) {
    return this.scalingService.getTasks(
      req.user.id,
      vkAccountId ? parseInt(vkAccountId) : undefined,
    );
  }

  /**
   * Получить задачу по ID
   */
  @Get(':id')
  async getTask(@Request() req, @Param('id') taskId: string) {
    return this.scalingService.getTask(+taskId, req.user.id);
  }

  /**
   * Удалить задачу
   */
  @Delete(':id')
  async deleteTask(@Request() req, @Param('id') taskId: string) {
    return this.scalingService.deleteTask(+taskId, req.user.id);
  }
}
