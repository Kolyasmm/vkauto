import { Module } from '@nestjs/common';
import { RulesController } from './rules.controller';
import { RulesService } from './rules.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VkModule } from '../vk/vk.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { VkAccountsModule } from '../vk-accounts/vk-accounts.module';
import { AuthModule } from '../auth/auth.module';
import { ProfitabilityModule } from '../profitability/profitability.module';

@Module({
  imports: [PrismaModule, VkModule, NotificationsModule, VkAccountsModule, AuthModule, ProfitabilityModule],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
