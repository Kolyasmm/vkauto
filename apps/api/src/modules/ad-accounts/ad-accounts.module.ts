import { Module } from '@nestjs/common';
import { AdAccountsController } from './ad-accounts.controller';
import { AdAccountsService } from './ad-accounts.service';
import { VkModule } from '../vk/vk.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VkModule, AuthModule],
  controllers: [AdAccountsController],
  providers: [AdAccountsService],
  exports: [AdAccountsService],
})
export class AdAccountsModule {}
