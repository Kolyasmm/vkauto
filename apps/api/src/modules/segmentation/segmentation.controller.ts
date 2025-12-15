import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SegmentationService } from './segmentation.service';
import { CreateSegmentationDto } from './dto/create-segmentation.dto';

@Controller('segmentation')
@UseGuards(JwtAuthGuard)
export class SegmentationController {
  constructor(private readonly segmentationService: SegmentationService) {}

  /**
   * Получить кампании с группами объявлений для выбора источника
   */
  @Get('campaigns/:vkAccountId')
  async getCampaignsWithAdGroups(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.segmentationService.getCampaignsWithAdGroups(req.user.id, vkAccountId);
  }

  /**
   * Получить доступные аудитории (сегменты ретаргетинга) с названиями
   */
  @Get('audiences/:vkAccountId')
  async getAudiences(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.segmentationService.getAudiences(req.user.id, vkAccountId);
  }

  /**
   * Получить доступные интересы
   */
  @Get('interests/:vkAccountId')
  async getInterests(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.segmentationService.getInterests(req.user.id, vkAccountId);
  }

  /**
   * Выполнить сегментирование - создать копии группы с разными аудиториями
   */
  @Post('execute')
  async execute(
    @Request() req,
    @Body() dto: CreateSegmentationDto,
  ) {
    return this.segmentationService.execute(req.user.id, dto);
  }

  /**
   * Обновить название интереса
   */
  @Put('interest-label/:vkAccountId/:interestId')
  async updateInterestLabel(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Param('interestId', ParseIntPipe) interestId: number,
    @Body('name') name: string,
  ) {
    return this.segmentationService.updateInterestLabel(
      req.user.id,
      vkAccountId,
      interestId,
      name,
    );
  }
}
