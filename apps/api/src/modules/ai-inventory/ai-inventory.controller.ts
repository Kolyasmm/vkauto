import { Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiInventoryService } from './ai-inventory.service';

@Controller('ai-inventory')
@UseGuards(JwtAuthGuard)
export class AiInventoryController {
  constructor(private readonly service: AiInventoryService) {}

  @Post(':vkAccountId/sync')
  async startSync(@Request() req: any, @Param('vkAccountId', ParseIntPipe) vkAccountId: number) {
    return this.service.startSync(req.user.id, vkAccountId);
  }

  @Get(':vkAccountId/sync/latest')
  async latestSync(@Request() req: any, @Param('vkAccountId', ParseIntPipe) vkAccountId: number) {
    return this.service.getLatestSync(req.user.id, vkAccountId);
  }

  @Get(':vkAccountId/sync/:syncId')
  async syncStatus(
    @Request() req: any,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Param('syncId', ParseIntPipe) syncId: number,
  ) {
    return this.service.getSync(req.user.id, vkAccountId, syncId);
  }

  @Get(':vkAccountId/stats')
  async stats(@Request() req: any, @Param('vkAccountId', ParseIntPipe) vkAccountId: number) {
    return this.service.getInventoryStats(req.user.id, vkAccountId);
  }
}
