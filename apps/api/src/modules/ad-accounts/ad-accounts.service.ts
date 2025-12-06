import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService, AdGroup, AdStatistics, AdPlan } from '../vk/vk.service';

@Injectable()
export class AdAccountsService {
  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
  ) {}

  /**
   * Синхронизировать информацию о пользователе VK Ads
   */
  async sync(userId: number, vkAccountId: number) {
    const user = await this.vkService.getUser();

    // Проверяем существующую запись
    const existing = await this.prisma.adAccount.findFirst({
      where: {
        vkAccountId,
        vkAdAccountId: BigInt(user.id),
      },
    });

    if (!existing) {
      const newAccount = await this.prisma.adAccount.create({
        data: {
          vkAccountId,
          vkAdAccountId: BigInt(user.id),
          name: user.username || `VK Ads ${user.id}`,
        },
      });

      return {
        message: 'Аккаунт VK Ads синхронизирован',
        account: newAccount,
        user,
      };
    }

    return {
      message: 'Аккаунт уже существует',
      account: existing,
      user,
    };
  }

  /**
   * Получить список кабинетов пользователя
   */
  async findAll(userId: number) {
    return this.prisma.adAccount.findMany({
      where: {
        vkAccount: {
          userId,
        },
      },
      include: {
        vkAccount: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Получить кампании (ad_plans)
   */
  async getCampaigns(): Promise<AdPlan[]> {
    return this.vkService.getAdPlans();
  }

  /**
   * Получить группы объявлений
   */
  async getAdGroups(adPlanId?: number): Promise<AdGroup[]> {
    return this.vkService.getAdGroups(adPlanId);
  }

  /**
   * Получить статистику
   */
  async getStatistics(
    dateFrom?: string,
    dateTo?: string,
    ids?: string,
  ): Promise<AdStatistics[]> {
    const yesterday = this.vkService.getYesterdayDate();
    const objectIds = ids ? ids.split(',').map(Number) : undefined;

    return this.vkService.getStatistics(
      dateFrom || yesterday,
      dateTo || yesterday,
      objectIds,
      'ad_group',
    );
  }

  /**
   * Получить информацию о пользователе VK Ads
   */
  async getUser() {
    return this.vkService.getUser();
  }
}
