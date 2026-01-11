import { Controller, Get, Query, UseGuards, Request, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards';
import { ProfitabilityService } from './profitability.service';

@Controller('profitability')
@UseGuards(JwtAuthGuard)
export class ProfitabilityController {
  constructor(private profitabilityService: ProfitabilityService) {}

  /**
   * Получить анализ прибыльности баннеров
   * GET /profitability?vkAccountId=1&days=7
   */
  @Get()
  async getProfitability(
    @Request() req,
    @Query('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.profitabilityService.getProfitability(req.user.id, vkAccountId, days);
  }

  /**
   * Получить только прибыльные баннеры
   * GET /profitability/profitable?vkAccountId=1&days=7
   */
  @Get('profitable')
  async getProfitableBanners(
    @Request() req,
    @Query('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.profitabilityService.getProfitableBanners(req.user.id, vkAccountId, days);
  }
}
