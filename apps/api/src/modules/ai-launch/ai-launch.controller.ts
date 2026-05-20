import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiLaunchService } from './ai-launch.service';
import { QuickLaunchDto } from './dto/quick-launch.dto';

@Controller('ai-launch')
@UseGuards(JwtAuthGuard)
export class AiLaunchController {
  constructor(private readonly service: AiLaunchService) {}

  @Post(':vkAccountId')
  async quickLaunch(
    @Request() req: any,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Body() dto: QuickLaunchDto,
  ) {
    return this.service.quickLaunch(req.user.id, vkAccountId, dto);
  }

  @Get(':vkAccountId/runs')
  async listRuns(@Request() req: any, @Param('vkAccountId', ParseIntPipe) vkAccountId: number) {
    return this.service.listRuns(req.user.id, vkAccountId);
  }

  @Get(':vkAccountId/runs/:runId')
  async getRun(
    @Request() req: any,
    @Param('vkAccountId', ParseIntPipe) vkAccountId: number,
    @Param('runId', ParseIntPipe) runId: number,
  ) {
    return this.service.getRun(req.user.id, vkAccountId, runId);
  }
}
