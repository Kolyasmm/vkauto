import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventorySyncService } from './sync/inventory-sync.service';

@Injectable()
export class AiInventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: InventorySyncService,
  ) {}

  async startSync(userId: number, vkAccountId: number) {
    await this.assertAccess(userId, vkAccountId);
    return this.sync.startSync(vkAccountId);
  }

  async getLatestSync(userId: number, vkAccountId: number) {
    await this.assertAccess(userId, vkAccountId);
    return this.sync.getLatestSync(vkAccountId);
  }

  async getSync(userId: number, vkAccountId: number, syncId: number) {
    await this.assertAccess(userId, vkAccountId);
    const sync = await this.sync.getSync(syncId);
    if (sync.vkAccountId !== vkAccountId) {
      throw new NotFoundException(`Sync ${syncId} не относится к этому кабинету`);
    }
    return sync;
  }

  async getInventoryStats(userId: number, vkAccountId: number) {
    await this.assertAccess(userId, vkAccountId);
    return this.sync.getInventoryStats(vkAccountId);
  }

  private async assertAccess(userId: number, vkAccountId: number) {
    const owned = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId },
      select: { id: true },
    });
    if (owned) return;
    const shared = await this.prisma.vkAccountShare.findUnique({
      where: { vkAccountId_sharedWithUserId: { vkAccountId, sharedWithUserId: userId } },
      select: { vkAccountId: true },
    });
    if (!shared) {
      throw new ForbiddenException('Нет доступа к этому VK кабинету');
    }
  }
}
