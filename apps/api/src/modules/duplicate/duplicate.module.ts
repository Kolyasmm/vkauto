import { Module } from '@nestjs/common';
import { DuplicateController } from './duplicate.controller';
import { DuplicateService } from './duplicate.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VkModule } from '../vk/vk.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, VkModule, AuthModule],
  controllers: [DuplicateController],
  providers: [DuplicateService],
  exports: [DuplicateService],
})
export class DuplicateModule {}
