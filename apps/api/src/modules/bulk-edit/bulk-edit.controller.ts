import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { BulkEditService, BulkEditResponse } from './bulk-edit.service';

@Controller('bulk-edit')
@UseGuards(JwtAuthGuard)
export class BulkEditController {
  constructor(private readonly bulkEditService: BulkEditService) {}

  /**
   * Получить кампании с группами объявлений
   */
  @Get('campaigns/:vkAccountId')
  async getCampaignsWithAdGroups(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.bulkEditService.getCampaignsWithAdGroups(req.user.id, vkAccountId);
  }

  /**
   * Получить доступные аудитории (ретаргетинг)
   */
  @Get('audiences/:vkAccountId')
  async getAudiences(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.bulkEditService.getAudiences(req.user.id, vkAccountId);
  }

  /**
   * Получить доступные интересы
   */
  @Get('interests/:vkAccountId')
  async getInterests(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.bulkEditService.getInterests(req.user.id, vkAccountId);
  }

  /**
   * Получить доступные интересы соц-дем
   */
  @Get('interests-soc-dem/:vkAccountId')
  async getInterestsSocDem(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.bulkEditService.getInterestsSocDem(req.user.id, vkAccountId);
  }

  /**
   * Массовое обновление групп объявлений
   */
  @Post('update')
  async bulkUpdateAdGroups(
    @Request() req,
    @Body() dto: {
      vkAccountId: number;
      adGroupIds: number[];
      changes: {
        audiences?: number[];
        interests?: number[];
        interestsSocDem?: number[];
        budgetLimitDay?: number;
        name?: string;
        audienceMode?: 'replace' | 'add' | 'remove';
        interestsMode?: 'replace' | 'add' | 'remove';
        socDemMode?: 'replace' | 'add' | 'remove';
      };
    },
  ): Promise<BulkEditResponse> {
    return this.bulkEditService.bulkUpdateAdGroups(req.user.id, dto);
  }

  /**
   * Обновить название сегмента
   */
  @Put('segment-label/:vkAccountId/:segmentId')
  async updateSegmentLabel(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Param('segmentId', ParseIntPipe) segmentId: number,
    @Body() dto: { name: string },
  ) {
    return this.bulkEditService.updateSegmentLabel(req.user.id, vkAccountId, segmentId, dto.name);
  }

  /**
   * Массовое обновление названий сегментов
   */
  @Post('segment-labels/:vkAccountId')
  async updateSegmentLabels(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Body() dto: { labels: { segmentId: number; name: string }[] },
  ) {
    return this.bulkEditService.updateSegmentLabels(req.user.id, vkAccountId, dto.labels);
  }

  // ============ БАННЕРЫ (ОБЪЯВЛЕНИЯ) ============

  /**
   * Получить кампании с баннерами (объявлениями)
   */
  @Get('campaigns-banners/:vkAccountId')
  async getCampaignsWithBanners(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('status') status?: string,
  ) {
    return this.bulkEditService.getCampaignsWithBanners(req.user.id, vkAccountId, status);
  }

  /**
   * Получить все баннеры с текстами для массового редактирования (плоский список)
   */
  @Get('banners/:vkAccountId')
  async getBannersWithTexts(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('status') status?: string,
  ) {
    return this.bulkEditService.getBannersWithTexts(req.user.id, vkAccountId, status);
  }

  /**
   * Массовое обновление баннеров (объявлений)
   */
  @Post('banners/update')
  async bulkUpdateBanners(
    @Request() req,
    @Body() dto: {
      vkAccountId: number;
      bannerIds: number[];
      changes: {
        name?: string;
        title?: string;
        description?: string;
      };
    },
  ) {
    return this.bulkEditService.bulkUpdateBanners(req.user.id, dto);
  }
}
