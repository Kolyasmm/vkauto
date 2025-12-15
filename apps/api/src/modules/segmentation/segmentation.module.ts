import { Module } from '@nestjs/common';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';
import { VkModule } from '../vk/vk.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [VkModule, AuthModule],
  controllers: [SegmentationController],
  providers: [SegmentationService],
  exports: [SegmentationService],
})
export class SegmentationModule {}
