import { Module } from '@nestjs/common';
import { ScalingController } from './scaling.controller';
import { ScalingService } from './scaling.service';
import { VkModule } from '../vk/vk.module';
import { VkAccountsModule } from '../vk-accounts/vk-accounts.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VkModule, VkAccountsModule, AuthModule],
  controllers: [ScalingController],
  providers: [ScalingService],
  exports: [ScalingService],
})
export class ScalingModule {}
