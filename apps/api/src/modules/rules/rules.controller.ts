import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RulesService, ExecutionResult } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { JwtAuthGuard } from '../../common/guards';

@Controller('rules')
@UseGuards(JwtAuthGuard)
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  create(@Body() createRuleDto: CreateRuleDto, @Request() req) {
    return this.rulesService.create(req.user.id, createRuleDto);
  }

  @Get()
  findAll(@Request() req, @Query('vkAccountId') vkAccountId?: string) {
    return this.rulesService.findAll(req.user.id, vkAccountId ? +vkAccountId : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.rulesService.findOne(+id, req.user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateRuleDto: UpdateRuleDto,
    @Request() req,
  ) {
    return this.rulesService.update(+id, req.user.id, updateRuleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    return this.rulesService.remove(+id, req.user.id);
  }

  @Post(':id/test')
  test(@Param('id') id: string, @Request() req) {
    return this.rulesService.testRule(+id, req.user.id);
  }

  @Post(':id/run')
  async run(@Param('id') id: string): Promise<ExecutionResult> {
    return this.rulesService.executeRule(+id);
  }

  @Get(':id/history')
  async getHistory(@Param('id') id: string, @Request() req) {
    const rule = await this.rulesService.findOne(+id, req.user.id);
    return rule.executions;
  }
}
