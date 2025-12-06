import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { RulesModule } from '../rules/rules.module';
import { AutoDisableModule } from '../auto-disable/auto-disable.module';

@Module({
  imports: [RulesModule, AutoDisableModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}