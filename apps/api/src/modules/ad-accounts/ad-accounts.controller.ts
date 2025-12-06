import { Controller, Get, Post, Param, Query, Request, UseGuards } from '@nestjs/common';
import { AdAccountsService } from './ad-accounts.service';
import { AdGroup, AdStatistics, AdPlan } from '../vk/vk.service';
import { JwtAuthGuard } from '../../common/guards';

@Controller('ad-accounts')
@UseGuards(JwtAuthGuard)
export class AdAccountsController {
  constructor(private readonly adAccountsService: AdAccountsService) {}

  @Get()
  findAll(@Request() req) {
    return this.adAccountsService.findAll(req.user.id);
  }

  @Post('sync')
  sync(@Request() req) {
    const vkAccountId = 1; // TODO: получать из body
    return this.adAccountsService.sync(req.user.id, vkAccountId);
  }

  @Get('user')
  getUser() {
    return this.adAccountsService.getUser();
  }

  @Get('campaigns')
  getCampaigns(): Promise<AdPlan[]> {
    return this.adAccountsService.getCampaigns();
  }

  @Get('ad-groups')
  getAdGroups(
    @Query('adPlanId') adPlanId?: string,
  ): Promise<AdGroup[]> {
    const planId = adPlanId ? Number(adPlanId) : undefined;
    return this.adAccountsService.getAdGroups(planId);
  }

  @Get('stats')
  getStatistics(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('ids') ids?: string,
  ): Promise<AdStatistics[]> {
    return this.adAccountsService.getStatistics(dateFrom, dateTo, ids);
  }
}
