import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AutoDisableService } from './auto-disable.service';
import { CreateAutoDisableRuleDto } from './dto/create-auto-disable-rule.dto';
import { UpdateAutoDisableRuleDto } from './dto/update-auto-disable-rule.dto';
import { JwtAuthGuard } from '../../common/guards';

@Controller('auto-disable')
@UseGuards(JwtAuthGuard)
export class AutoDisableController {
  constructor(private readonly autoDisableService: AutoDisableService) {}

  @Post()
  create(@Body() dto: CreateAutoDisableRuleDto, @Request() req) {
    return this.autoDisableService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Request() req, @Query('vkAccountId') vkAccountId?: string) {
    return this.autoDisableService.findAll(req.user.id, vkAccountId ? +vkAccountId : undefined);
  }

  @Get('metric-types')
  getMetricTypes() {
    return this.autoDisableService.getMetricTypes();
  }

  @Get('operators')
  getOperators() {
    return this.autoDisableService.getOperators();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.autoDisableService.findOne(+id, req.user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAutoDisableRuleDto,
    @Request() req,
  ) {
    return this.autoDisableService.update(+id, req.user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.autoDisableService.remove(+id, req.user.id);
  }

  @Post(':id/execute')
  async execute(@Param('id') id: string, @Request() req) {
    await this.autoDisableService.findOne(+id, req.user.id);
    return this.autoDisableService.executeRule(+id);
  }
}
