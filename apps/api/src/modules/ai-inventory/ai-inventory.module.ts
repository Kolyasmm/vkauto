import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AiInventoryController } from './ai-inventory.controller';
import { AiInventoryService } from './ai-inventory.service';
import { InventorySyncService } from './sync/inventory-sync.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AiInventoryController],
  providers: [AiInventoryService, InventorySyncService],
  exports: [AiInventoryService, InventorySyncService],
})
export class AiInventoryModule {}
