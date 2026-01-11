import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VkModule } from './modules/vk/vk.module';
import { AdAccountsModule } from './modules/ad-accounts/ad-accounts.module';
import { RulesModule } from './modules/rules/rules.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { VkAccountsModule } from './modules/vk-accounts/vk-accounts.module';
import { AutoDisableModule } from './modules/auto-disable/auto-disable.module';
import { ScalingModule } from './modules/scaling/scaling.module';
import { DuplicateModule } from './modules/duplicate/duplicate.module';
import { BulkEditModule } from './modules/bulk-edit/bulk-edit.module';
import { AutoUploadModule } from './modules/auto-upload/auto-upload.module';
import { SegmentationModule } from './modules/segmentation/segmentation.module';
import { LeadsTechModule } from './modules/leadstech/leadstech.module';
import { ProfitabilityModule } from './modules/profitability/profitability.module';
import { CreativesModule } from './modules/creatives/creatives.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    VkModule,
    AdAccountsModule,
    RulesModule,
    SchedulerModule,
    NotificationsModule,
    VkAccountsModule,
    AutoDisableModule,
    ScalingModule,
    DuplicateModule,
    BulkEditModule,
    AutoUploadModule,
    SegmentationModule,
    LeadsTechModule,
    ProfitabilityModule,
    CreativesModule,
  ],
})
export class AppModule {}
