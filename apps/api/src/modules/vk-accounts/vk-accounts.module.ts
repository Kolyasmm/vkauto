import { Module } from '@nestjs/common';
import { VkAccountsService } from './vk-accounts.service';
import { VkAccountsController } from './vk-accounts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, NotificationsModule, AuthModule],
  controllers: [VkAccountsController],
  providers: [VkAccountsService],
  exports: [VkAccountsService],
})
export class VkAccountsModule {}
