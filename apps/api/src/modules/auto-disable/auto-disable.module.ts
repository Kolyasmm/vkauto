import { Module } from '@nestjs/common';
import { AutoDisableService } from './auto-disable.service';
import { AutoDisableController } from './auto-disable.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { VkModule } from '../vk/vk.module';
import { VkAccountsModule } from '../vk-accounts/vk-accounts.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, VkModule, VkAccountsModule, NotificationsModule, AuthModule],
  controllers: [AutoDisableController],
  providers: [AutoDisableService],
  exports: [AutoDisableService],
})
export class AutoDisableModule {}
