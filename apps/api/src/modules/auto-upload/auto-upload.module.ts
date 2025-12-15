import { Module } from '@nestjs/common';
import { AutoUploadController } from './auto-upload.controller';
import { AutoUploadService } from './auto-upload.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VkModule } from '../vk/vk.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, VkModule, AuthModule],
  controllers: [AutoUploadController],
  providers: [AutoUploadService],
  exports: [AutoUploadService],
})
export class AutoUploadModule {}
