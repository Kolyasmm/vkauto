import { Module } from '@nestjs/common';
import { BulkEditController } from './bulk-edit.controller';
import { BulkEditService } from './bulk-edit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VkModule } from '../vk/vk.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, VkModule, AuthModule],
  controllers: [BulkEditController],
  providers: [BulkEditService],
  exports: [BulkEditService],
})
export class BulkEditModule {}
