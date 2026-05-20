import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PopularityPickerService, PickedSelection } from './picker/popularity-picker.service';
import { assembleAdPlanPayload } from './assembly/payload-assembler';
import { VkLauncherClient } from './vk-launcher-client';
import { AiLaunchObjective, QuickLaunchDto } from './dto/quick-launch.dto';

@Injectable()
export class AiLaunchService {
  private readonly logger = new Logger(AiLaunchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly picker: PopularityPickerService,
  ) {}

  async quickLaunch(userId: number, vkAccountId: number, dto: QuickLaunchDto) {
    await this.assertAccess(userId, vkAccountId);

    const account = await this.prisma.vkAccount.findUnique({
      where: { id: vkAccountId },
      select: { accessToken: true, isActive: true },
    });
    if (!account) throw new NotFoundException(`VkAccount ${vkAccountId} не найден`);
    if (!account.isActive) {
      throw new BadRequestException(`VkAccount ${vkAccountId} деактивирован`);
    }

    const strategy = dto.strategy ?? 'popularity_v1';
    const campaignName =
      dto.campaignName ?? `AI ${dto.objective} ${this.formatDate(new Date())}`;
    const dailyBudget = dto.dailyBudget ?? 200;

    const run = await this.prisma.aiLaunchRun.create({
      data: {
        userId,
        vkAccountId,
        strategy,
        objective: dto.objective,
        inputParams: { campaignName, dailyBudget } as Prisma.InputJsonValue,
        status: 'pending',
      },
    });

    const t0 = Date.now();
    try {
      const selection = await this.pickSelection(vkAccountId, dto.objective);
      await this.prisma.aiLaunchRun.update({
        where: { id: run.id },
        data: { selection: this.serializeSelection(selection) as Prisma.InputJsonValue, status: 'running' },
      });

      const client = new VkLauncherClient(account.accessToken);

      let urlId: number | undefined;
      if (dto.objective === AiLaunchObjective.MESSAGES) {
        if (!selection.community) throw new BadRequestException('Не выбрано сообщество');
        const target =
          selection.community.url && selection.community.url.startsWith('http')
            ? selection.community.url
            : selection.community.shortname
              ? `https://vk.com/${selection.community.shortname}`
              : selection.community.url;
        urlId = await client.createUrl(target);
      }

      const payload = assembleAdPlanPayload({
        objective: dto.objective,
        campaignName,
        dailyBudget,
        selection,
        urlId,
      });

      this.logger.log(`AI launch ${run.id}: payload ready, отправляю в VK`);
      const result = await client.createAdPlan(payload);

      await this.prisma.aiLaunchRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          resultCampaignId: result.adPlanId,
          resultAdGroupIds: result.adGroupIds,
          resultBannerIds: result.bannerIds,
          durationMs: Date.now() - t0,
          completedAt: new Date(),
        },
      });

      return {
        runId: run.id,
        status: 'success' as const,
        strategy,
        objective: dto.objective,
        campaignName,
        campaignId: result.adPlanId.toString(),
        adGroupIds: result.adGroupIds.map((x) => x.toString()),
        bannerIds: result.bannerIds.map((x) => x.toString()),
        selection: this.serializeSelection(selection),
        note: 'Кампания создана в статусе "blocked". Активируй вручную в VK Ads после проверки.',
      };
    } catch (err: any) {
      const message = this.formatError(err);
      this.logger.error(`AI launch ${run.id} failed: ${message}`);
      await this.prisma.aiLaunchRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorMessage: message.slice(0, 2000),
          durationMs: Date.now() - t0,
          completedAt: new Date(),
        },
      });
      throw new BadRequestException(message);
    }
  }

  async getRun(userId: number, vkAccountId: number, runId: number) {
    await this.assertAccess(userId, vkAccountId);
    const run = await this.prisma.aiLaunchRun.findUnique({ where: { id: runId } });
    if (!run || run.vkAccountId !== vkAccountId) {
      throw new NotFoundException(`Launch run ${runId} не найден`);
    }
    return this.serializeRun(run);
  }

  async listRuns(userId: number, vkAccountId: number) {
    await this.assertAccess(userId, vkAccountId);
    const runs = await this.prisma.aiLaunchRun.findMany({
      where: { vkAccountId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return runs.map((r) => this.serializeRun(r));
  }

  // ---- helpers ---------------------------------------------------------

  private async pickSelection(vkAccountId: number, objective: AiLaunchObjective): Promise<PickedSelection> {
    switch (objective) {
      case AiLaunchObjective.MESSAGES:
        return this.picker.pickForMessages(vkAccountId);
      case AiLaunchObjective.LEAD_FORM:
        return this.picker.pickForLeadForm(vkAccountId);
      case AiLaunchObjective.APP_INSTALLS:
        return this.picker.pickForAppInstalls(vkAccountId);
      default:
        throw new BadRequestException(`Неизвестный objective: ${objective}`);
    }
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
    if (!shared) throw new ForbiddenException('Нет доступа к этому VK кабинету');
  }

  private serializeSelection(s: PickedSelection): any {
    const out: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (!v) continue;
      out[k] = JSON.parse(JSON.stringify(v, (_, val) => (typeof val === 'bigint' ? val.toString() : val)));
    }
    return out;
  }

  private serializeRun(r: any) {
    return {
      ...r,
      resultCampaignId: r.resultCampaignId?.toString() ?? null,
      resultAdGroupIds: (r.resultAdGroupIds ?? []).map((x: bigint) => x.toString()),
      resultBannerIds: (r.resultBannerIds ?? []).map((x: bigint) => x.toString()),
    };
  }

  private formatDate(d: Date): string {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }

  private formatError(err: any): string {
    if (err?.response?.data) {
      return `${err.message}: ${JSON.stringify(err.response.data).slice(0, 1000)}`;
    }
    return err?.message ?? String(err);
  }
}
