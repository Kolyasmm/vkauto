import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Множители на вес атома по verdict.
// Чем выше WINNER_MULT — тем сильнее ИИ предпочитает winner. ×5 значит winner
// в 5 раз вероятнее neutral при том же usage_count.
const VERDICT_WEIGHT = {
  winner: 5,
  neutral: 1,
  loser: 0.1, // не убираем совсем — даём шанс восстановиться
  unknown: 1,
};

export interface PickedCreative {
  id: number;
  vkContentId: bigint;
  contentKey: string;
}

export interface PickedAudience {
  id: number;
  profile: any;
  name: string;
}

export interface PickedSelection {
  // socialactivity
  community?: { id: number; vkUrlId: bigint; url: string; shortname: string | null };
  // common
  title?: { id: number; role: string; body: string };
  description?: { id: number; role: string; body: string };
  cta?: { id: number; role: string; value: string };
  icon?: PickedCreative;
  images: PickedCreative[]; // массив — 1 креатив = 1 группа
  audience?: PickedAudience;
  package?: { id: number; vkPackageId: number; objective: string | null };
  advertiser?: { id: number; body: string };
  // lead_form
  leadForm?: { id: number; vkLeadFormId: bigint; name: string | null };
  // app_installs
  mobileApp?: { id: number; vkMobileAppId: bigint; platform: string | null; name: string | null };
}

interface PickedRow<T> {
  row: T;
  weight: number;
}

@Injectable()
export class PopularityPickerService {
  private readonly logger = new Logger(PopularityPickerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pickForMessages(vkAccountId: number, creativesCount = 1): Promise<PickedSelection> {
    const community = await this.pickWeighted(
      await this.prisma.aiCommunityRef.findMany({
        where: {
          vkAccountId,
          OR: [
            { urlType: { in: ['vk_group', 'vk_post', 'internal'] } },
            { url: { contains: 'vk.com/club' } },
            { url: { contains: 'vk.com/public' } },
          ],
        },
      }),
      (r) => r.usageCount,
    );
    if (!community) {
      throw new BadRequestException(
        'В инвентаре нет VK-сообществ для рекламы. Сначала запусти sync на кабинете.',
      );
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const description = await this.pickText(vkAccountId, ['text_2000', 'text_220', 'text_90']);
    const ctaRow = await this.pickText(vkAccountId, ['cta_community_vk']);

    if (!title || !description) {
      throw new BadRequestException('В инвентаре нет текстовых атомов. Запусти sync.');
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256']);
    if (!icon) {
      throw new BadRequestException('В инвентаре нет иконки (icon_256x256).');
    }

    const images = await this.pickCreativesMany(vkAccountId, ['image_600x600'], creativesCount);
    if (!images.length) {
      throw new BadRequestException('В инвентаре нет квадратных креативов 600x600 для сообщений.');
    }

    const audience = await this.pickAudience(vkAccountId);

    const pack = await this.pickWeighted(
      await this.prisma.aiAdGroupIndex.findMany({
        where: { vkAccountId, objective: { in: ['socialengagement', 'socialactivity'] }, packageId: { not: null } },
        select: { packageId: true },
      }),
      () => 1,
    );

    const advertiser = await this.pickText(vkAccountId, ['about_company_115']);

    return {
      community: {
        id: community.id,
        vkUrlId: community.vkUrlId,
        url: community.url,
        shortname: community.groupShortname,
      },
      title: { id: title.id, role: title.role, body: title.body },
      description: { id: description.id, role: description.role, body: description.body },
      cta: ctaRow ? { id: ctaRow.id, role: ctaRow.role, value: ctaRow.body } : undefined,
      icon: { id: icon.id, vkContentId: icon.vkContentId, contentKey: icon.contentKey },
      images: images.map((i) => ({ id: i.id, vkContentId: i.vkContentId, contentKey: i.contentKey })),
      audience,
      package: pack?.packageId
        ? { id: 0, vkPackageId: pack.packageId, objective: 'socialengagement' }
        : undefined,
      advertiser: advertiser ? { id: advertiser.id, body: advertiser.body } : undefined,
    };
  }

  async pickForLeadForm(vkAccountId: number, creativesCount = 1): Promise<PickedSelection> {
    const leadForm = await this.pickWeighted(
      await this.prisma.aiLeadForm.findMany({ where: { vkAccountId } }),
      (r) => Math.max(1, r.leadsCount),
    );
    if (!leadForm) {
      throw new BadRequestException('В инвентаре нет лид-форм.');
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const short = await this.pickText(vkAccountId, ['text_90']);
    const long = await this.pickText(vkAccountId, ['text_220', 'text_2000', 'text_long']);

    if (!title || !short || !long) {
      throw new BadRequestException('Не хватает текстовых атомов title/short/long для лид-формы.');
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256']);
    const images = await this.pickCreativesMany(
      vkAccountId,
      ['image_600x600', 'image_1080x607'],
      creativesCount,
    );

    if (!icon || !images.length) {
      throw new BadRequestException('Не хватает креативов для лид-формы.');
    }

    const audience = await this.pickAudience(vkAccountId);
    const advertiser = await this.pickText(vkAccountId, ['about_company_115']);

    return {
      leadForm: { id: leadForm.id, vkLeadFormId: leadForm.vkLeadFormId, name: leadForm.name },
      title: { id: title.id, role: title.role, body: title.body },
      description: { id: short.id, role: short.role, body: short.body },
      cta: { id: long.id, role: long.role, value: long.body },
      icon: { id: icon.id, vkContentId: icon.vkContentId, contentKey: icon.contentKey },
      images: images.map((i) => ({ id: i.id, vkContentId: i.vkContentId, contentKey: i.contentKey })),
      audience,
      advertiser: advertiser ? { id: advertiser.id, body: advertiser.body } : undefined,
    };
  }

  async pickForAppInstalls(vkAccountId: number, creativesCount = 1): Promise<PickedSelection> {
    const app = await this.pickWeighted(
      await this.prisma.aiMobileApp.findMany({ where: { vkAccountId } }),
      () => 1,
    );
    if (!app) {
      throw new BadRequestException('В кабинете нет мобильных приложений.');
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const short = await this.pickText(vkAccountId, ['text_90']);
    const long = await this.pickText(vkAccountId, ['text_220']);
    if (!title || !short || !long) {
      throw new BadRequestException('Не хватает текстовых атомов для appinstalls.');
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256_app', 'icon_256x256']);
    const images = await this.pickCreativesMany(
      vkAccountId,
      ['image_600x600', 'image_1080x607'],
      creativesCount,
    );
    if (!icon || !images.length) {
      throw new BadRequestException('Не хватает креативов для appinstalls.');
    }

    const audience = await this.pickAudience(vkAccountId);
    const advertiser = await this.pickText(vkAccountId, ['about_company_115']);

    return {
      mobileApp: {
        id: app.id,
        vkMobileAppId: app.vkMobileAppId,
        platform: app.platform,
        name: app.name,
      },
      title: { id: title.id, role: title.role, body: title.body },
      description: { id: short.id, role: short.role, body: short.body },
      cta: { id: long.id, role: long.role, value: long.body },
      icon: { id: icon.id, vkContentId: icon.vkContentId, contentKey: icon.contentKey },
      images: images.map((i) => ({ id: i.id, vkContentId: i.vkContentId, contentKey: i.contentKey })),
      audience,
      advertiser: advertiser ? { id: advertiser.id, body: advertiser.body } : undefined,
    };
  }

  // ---- helpers ---------------------------------------------------------

  private async pickAudience(vkAccountId: number): Promise<PickedAudience | undefined> {
    const rows = await this.prisma.aiAudienceProfile.findMany({ where: { vkAccountId } });
    const verdicts = await this.loadVerdicts(vkAccountId, 'audience_profile');
    const audience = this.pickWeighted(rows, (r) =>
      this.weightWithVerdict(r.usageCount, verdicts.get(r.id)),
    );
    if (!audience) return undefined;
    const name = await this.resolveAudienceName(vkAccountId, audience.profile);
    return { id: audience.id, profile: audience.profile, name };
  }

  // Собирает читаемое имя аудитории: "{сегмент} + {интерес}" или фолбэк.
  private async resolveAudienceName(vkAccountId: number, profile: any): Promise<string> {
    const segmentId = Array.isArray(profile?.segments) && profile.segments.length
      ? Number(profile.segments[0])
      : null;
    const interestId = Array.isArray(profile?.interests) && profile.interests.length
      ? Number(profile.interests[0])
      : null;

    let segmentName: string | null = null;
    if (segmentId != null) {
      const row = await this.prisma.segmentLabel.findUnique({
        where: { vkAccountId_segmentId: { vkAccountId, segmentId: BigInt(segmentId) } },
      });
      segmentName = row?.name ?? `сегмент ${segmentId}`;
    }

    let interestName: string | null = null;
    if (interestId != null) {
      const row = await this.prisma.interestLabel.findUnique({
        where: { vkAccountId_interestId: { vkAccountId, interestId } },
      });
      interestName = row?.name ?? `интерес ${interestId}`;
    }

    if (segmentName && interestName) return `${segmentName} + ${interestName}`;
    if (segmentName) return segmentName;
    if (interestName) return interestName;
    return 'аудитория';
  }

  // Грузит verdicts (atomId → verdict) для уровня и кабинета.
  private async loadVerdicts(
    vkAccountId: number,
    level: 'text_atom' | 'creative_asset' | 'audience_profile',
  ): Promise<Map<number, 'winner' | 'loser' | 'neutral'>> {
    const rows = await this.prisma.aiPerformanceVerdict.findMany({
      where: { vkAccountId, level },
      select: { vkObjectId: true, verdict: true },
    });
    const m = new Map<number, 'winner' | 'loser' | 'neutral'>();
    for (const r of rows) m.set(Number(r.vkObjectId), r.verdict as any);
    return m;
  }

  private weightWithVerdict(
    usage: number,
    verdict: 'winner' | 'loser' | 'neutral' | undefined,
  ): number {
    const mult = verdict ? VERDICT_WEIGHT[verdict] : VERDICT_WEIGHT.unknown;
    return Math.max(0.01, usage * mult);
  }

  private async pickText(vkAccountId: number, roles: string[]) {
    const rows = await this.prisma.aiTextAtom.findMany({
      where: { vkAccountId, role: { in: roles } },
    });
    const verdicts = await this.loadVerdicts(vkAccountId, 'text_atom');
    return this.pickWeighted(rows, (r) => this.weightWithVerdict(r.usageCount, verdicts.get(r.id)));
  }

  private async pickCreative(vkAccountId: number, contentKeys: string[]) {
    const rows = await this.prisma.aiCreativeAsset.findMany({
      where: { vkAccountId, contentKey: { in: contentKeys } },
    });
    const verdicts = await this.loadVerdicts(vkAccountId, 'creative_asset');
    return this.pickWeighted(rows, (r) => this.weightWithVerdict(r.usageCount, verdicts.get(r.id)));
  }

  // Берёт N уникальных креативов (без повтора), взвешенно по usage × verdict.
  private async pickCreativesMany(vkAccountId: number, contentKeys: string[], count: number) {
    const rows = await this.prisma.aiCreativeAsset.findMany({
      where: { vkAccountId, contentKey: { in: contentKeys } },
    });
    const verdicts = await this.loadVerdicts(vkAccountId, 'creative_asset');
    const out: typeof rows = [];
    const pool = [...rows];
    const take = Math.min(count, pool.length);
    for (let i = 0; i < take; i++) {
      const picked = this.pickWeighted(pool, (r) => this.weightWithVerdict(r.usageCount, verdicts.get(r.id)));
      if (!picked) break;
      out.push(picked);
      const idx = pool.indexOf(picked);
      if (idx >= 0) pool.splice(idx, 1);
    }
    return out;
  }

  private pickWeighted<T>(rows: T[], getWeight: (r: T) => number): T | null {
    if (!rows.length) return null;
    const weighted: PickedRow<T>[] = rows.map((row) => ({ row, weight: Math.max(1, getWeight(row)) }));
    const total = weighted.reduce((sum, w) => sum + w.weight, 0);
    let r = Math.random() * total;
    for (const w of weighted) {
      r -= w.weight;
      if (r <= 0) return w.row;
    }
    return weighted[weighted.length - 1].row;
  }
}
