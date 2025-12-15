import { Injectable, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';

// Email с доступом к дублированию
const ALLOWED_EMAILS = ['kolyaorekhov@gmail.com'];

@Injectable()
export class DuplicateService {
  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
  ) {}

  // Проверка доступа
  private async checkAccess(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user || !ALLOWED_EMAILS.includes(user.email)) {
      throw new ForbiddenException('Доступ к дублированию ограничен');
    }
  }

  // Проверить есть ли доступ (для фронтенда)
  async hasAccess(userId: number): Promise<{ hasAccess: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    return {
      hasAccess: user ? ALLOWED_EMAILS.includes(user.email) : false,
    };
  }

  // Получить список кампаний с группами объявлений
  async getCampaignsWithGroups(userId: number, vkAccountId: number) {
    await this.checkAccess(userId);

    const vkAccount = await this.prisma.vkAccount.findFirst({
      where: { id: vkAccountId, userId },
    });

    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    // Получаем кампании
    const campaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
    return campaigns;
  }

  // Дублировать кампанию
  async duplicateCampaign(userId: number, dto: {
    vkAccountId: number;
    campaignId: number;
    copies: number; // количество копий
    newName?: string; // новое название (опционально)
  }) {
    await this.checkAccess(userId);

    const vkAccount = await this.prisma.vkAccount.findFirst({
      where: { id: dto.vkAccountId, userId },
    });

    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    if (dto.copies < 1 || dto.copies > 10) {
      throw new BadRequestException('Количество копий должно быть от 1 до 10');
    }

    // Запускаем дублирование
    const results: Array<{ copyNumber: number; campaignId?: number; error?: string }> = [];

    for (let i = 0; i < dto.copies; i++) {
      try {
        const copyName = dto.newName
          ? `${dto.newName} (копия ${i + 1})`
          : undefined; // если не указано, VK добавит "(копия)" сам

        const newCampaignId = await this.vkService.duplicateCampaign(
          vkAccount.accessToken,
          dto.campaignId,
          copyName,
        );

        results.push({ copyNumber: i + 1, campaignId: newCampaignId });
      } catch (error) {
        results.push({
          copyNumber: i + 1,
          error: error.message || 'Неизвестная ошибка',
        });
      }
    }

    return {
      originalCampaignId: dto.campaignId,
      copies: dto.copies,
      results,
      successCount: results.filter(r => r.campaignId).length,
      failCount: results.filter(r => r.error).length,
    };
  }

  // Дублировать несколько кампаний сразу
  async duplicateMultipleCampaigns(userId: number, dto: {
    vkAccountId: number;
    campaigns: Array<{
      campaignId: number;
      copies: number;
      newName?: string;
    }>;
  }) {
    await this.checkAccess(userId);

    const vkAccount = await this.prisma.vkAccount.findFirst({
      where: { id: dto.vkAccountId, userId },
    });

    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    if (!dto.campaigns || dto.campaigns.length === 0) {
      throw new BadRequestException('Выберите хотя бы одну кампанию');
    }

    if (dto.campaigns.length > 20) {
      throw new BadRequestException('Максимум 20 кампаний за раз');
    }

    // Результаты для каждой кампании
    const campaignResults: Array<{
      originalCampaignId: number;
      originalName?: string;
      copies: number;
      results: Array<{ copyNumber: number; campaignId?: number; error?: string }>;
      successCount: number;
      failCount: number;
    }> = [];

    // Получаем информацию о кампаниях для отображения имен
    let campaignsInfo: Map<number, string> = new Map();
    try {
      const allCampaigns = await this.vkService.getCampaignsWithDetails(vkAccount.accessToken);
      campaignsInfo = new Map(allCampaigns.map((c: any) => [c.id, c.name]));
    } catch {
      // Игнорируем ошибку - имена не критичны
    }

    // Дублируем каждую кампанию последовательно
    for (const campaign of dto.campaigns) {
      if (campaign.copies < 1 || campaign.copies > 10) {
        campaignResults.push({
          originalCampaignId: campaign.campaignId,
          originalName: campaignsInfo.get(campaign.campaignId),
          copies: campaign.copies,
          results: [{ copyNumber: 1, error: 'Количество копий должно быть от 1 до 10' }],
          successCount: 0,
          failCount: 1,
        });
        continue;
      }

      const results: Array<{ copyNumber: number; campaignId?: number; error?: string }> = [];

      for (let i = 0; i < campaign.copies; i++) {
        try {
          const copyName = campaign.newName
            ? `${campaign.newName} (копия ${i + 1})`
            : undefined;

          const newCampaignId = await this.vkService.duplicateCampaign(
            vkAccount.accessToken,
            campaign.campaignId,
            copyName,
          );

          results.push({ copyNumber: i + 1, campaignId: newCampaignId });
        } catch (error) {
          results.push({
            copyNumber: i + 1,
            error: error.message || 'Неизвестная ошибка',
          });
        }
      }

      campaignResults.push({
        originalCampaignId: campaign.campaignId,
        originalName: campaignsInfo.get(campaign.campaignId),
        copies: campaign.copies,
        results,
        successCount: results.filter(r => r.campaignId).length,
        failCount: results.filter(r => r.error).length,
      });
    }

    // Общая статистика
    const totalSuccess = campaignResults.reduce((sum, c) => sum + c.successCount, 0);
    const totalFail = campaignResults.reduce((sum, c) => sum + c.failCount, 0);

    return {
      campaignResults,
      totalCampaigns: dto.campaigns.length,
      totalSuccess,
      totalFail,
    };
  }
}
