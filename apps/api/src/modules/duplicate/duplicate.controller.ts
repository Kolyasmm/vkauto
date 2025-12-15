import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DuplicateService } from './duplicate.service';

@Controller('duplicate')
@UseGuards(JwtAuthGuard)
export class DuplicateController {
  constructor(private readonly duplicateService: DuplicateService) {}

  // Проверка доступа
  @Get('access')
  async checkAccess(@Request() req) {
    return this.duplicateService.hasAccess(req.user.id);
  }

  // Получить список кампаний с группами
  @Get('campaigns/:vkAccountId')
  async getCampaigns(
    @Request() req,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
  ) {
    return this.duplicateService.getCampaignsWithGroups(req.user.id, vkAccountId);
  }

  // Дублировать кампанию
  @Post('execute')
  async duplicateCampaign(
    @Request() req,
    @Body() dto: {
      vkAccountId: number;
      campaignId: number;
      copies: number;
      newName?: string;
    },
  ) {
    return this.duplicateService.duplicateCampaign(req.user.id, dto);
  }

  // Дублировать несколько кампаний
  @Post('execute-batch')
  async duplicateMultipleCampaigns(
    @Request() req,
    @Body() dto: {
      vkAccountId: number;
      campaigns: Array<{
        campaignId: number;
        copies: number;
        newName?: string;
      }>;
    },
  ) {
    return this.duplicateService.duplicateMultipleCampaigns(req.user.id, dto);
  }
}
