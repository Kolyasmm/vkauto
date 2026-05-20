import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AiLaunchController } from './ai-launch.controller';
import { AiLaunchService } from './ai-launch.service';
import { PopularityPickerService } from './picker/popularity-picker.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AiLaunchController],
  providers: [AiLaunchService, PopularityPickerService],
  exports: [AiLaunchService],
})
export class AiLaunchModule {}
