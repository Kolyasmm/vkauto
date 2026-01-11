import { Module } from '@nestjs/common';
import { ProfitabilityController } from './profitability.controller';
import { ProfitabilityService } from './profitability.service';
import { VkModule } from '../vk/vk.module';
import { VkAccountsModule } from '../vk-accounts/vk-accounts.module';
import { LeadsTechModule } from '../leadstech/leadstech.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VkModule, VkAccountsModule, LeadsTechModule, AuthModule],
  controllers: [ProfitabilityController],
  providers: [ProfitabilityService],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
