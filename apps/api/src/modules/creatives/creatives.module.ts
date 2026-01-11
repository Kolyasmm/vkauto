import { Module } from '@nestjs/common';
import { CreativesController } from './creatives.controller';
import { CreativesService } from './creatives.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CreativesController],
  providers: [CreativesService],
  exports: [CreativesService],
})
export class CreativesModule {}
