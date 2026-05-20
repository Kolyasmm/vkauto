import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface PickedSelection {
  // socialactivity
  community?: { id: number; vkUrlId: bigint; url: string; shortname: string | null };
  // common
  title?: { id: number; role: string; body: string };
  description?: { id: number; role: string; body: string };
  cta?: { id: number; role: string; value: string };
  icon?: { id: number; vkContentId: bigint; contentKey: string };
  image?: { id: number; vkContentId: bigint; contentKey: string };
  audience?: { id: number; profile: any };
  package?: { id: number; vkPackageId: number; objective: string | null };
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

  async pickForMessages(vkAccountId: number): Promise<PickedSelection> {
    const community = await this.pickWeighted(
      await this.prisma.aiCommunityRef.findMany({
        where: { vkAccountId, urlType: { in: ['vk_group', 'vk_post'] } },
      }),
      (r) => r.usageCount,
    );
    if (!community) {
      throw new BadRequestException(
        'В инвентаре нет VK-сообществ для рекламы. Сначала запусти sync (POST /api/ai-inventory/:id/sync) на кабинете, где уже были кампании с целью Сообщения.',
      );
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const description = await this.pickText(vkAccountId, ['text_2000', 'text_220', 'text_90']);
    const ctaRow = await this.pickText(vkAccountId, ['cta_community_vk']);

    if (!title || !description) {
      throw new BadRequestException(
        'В инвентаре нет текстовых атомов. Запусти sync — атомы извлекаются из textblocks существующих баннеров.',
      );
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256']);
    if (!icon) {
      throw new BadRequestException('В инвентаре нет иконки (icon_256x256). Нужны баннеры с логотипом.');
    }

    const image = await this.pickCreative(vkAccountId, [
      'video_portrait_9_16_30s',
      'video_landscape_16_9_30s',
      'image_1080x607',
      'image_600x600',
      'image_240x400',
    ]);
    if (!image) {
      throw new BadRequestException('В инвентаре нет основного креатива (видео или изображения 9:16 / 16:9 / квадрат).');
    }

    const audience = await this.pickWeighted(
      await this.prisma.aiAudienceProfile.findMany({ where: { vkAccountId } }),
      (r) => r.usageCount,
    );

    const pack = await this.pickWeighted(
      await this.prisma.aiAdGroupIndex.findMany({
        where: { vkAccountId, objective: { in: ['socialengagement', 'socialactivity'] }, packageId: { not: null } },
        select: { packageId: true },
      }),
      () => 1,
    );

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
      image: { id: image.id, vkContentId: image.vkContentId, contentKey: image.contentKey },
      audience: audience ? { id: audience.id, profile: audience.profile } : undefined,
      package: pack?.packageId
        ? { id: 0, vkPackageId: pack.packageId, objective: 'socialengagement' }
        : undefined,
    };
  }

  async pickForLeadForm(vkAccountId: number): Promise<PickedSelection> {
    const leadForm = await this.pickWeighted(
      await this.prisma.aiLeadForm.findMany({ where: { vkAccountId } }),
      (r) => Math.max(1, r.leadsCount),
    );
    if (!leadForm) {
      throw new BadRequestException(
        'В инвентаре нет лид-форм. Создай форму в кабинете и запусти sync.',
      );
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const short = await this.pickText(vkAccountId, ['text_90']);
    const long = await this.pickText(vkAccountId, ['text_220', 'text_2000', 'text_long']);

    if (!title || !short || !long) {
      throw new BadRequestException(
        'Для лид-формы нужны атомы title_40_vkads, text_90, text_220. В инвентаре их пока нет.',
      );
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256']);
    const image = await this.pickCreative(vkAccountId, ['image_600x600', 'image_1080x607']);

    if (!icon || !image) {
      throw new BadRequestException('Не хватает креативов icon_256x256 и/или image_600x600 для лид-формы.');
    }

    const audience = await this.pickWeighted(
      await this.prisma.aiAudienceProfile.findMany({ where: { vkAccountId } }),
      (r) => r.usageCount,
    );

    return {
      leadForm: { id: leadForm.id, vkLeadFormId: leadForm.vkLeadFormId, name: leadForm.name },
      title: { id: title.id, role: title.role, body: title.body },
      description: { id: short.id, role: short.role, body: short.body },
      cta: { id: long.id, role: long.role, value: long.body },
      icon: { id: icon.id, vkContentId: icon.vkContentId, contentKey: icon.contentKey },
      image: { id: image.id, vkContentId: image.vkContentId, contentKey: image.contentKey },
      audience: audience ? { id: audience.id, profile: audience.profile } : undefined,
    };
  }

  async pickForAppInstalls(vkAccountId: number): Promise<PickedSelection> {
    const app = await this.pickWeighted(
      await this.prisma.aiMobileApp.findMany({ where: { vkAccountId } }),
      () => 1,
    );
    if (!app) {
      throw new BadRequestException(
        'В кабинете нет мобильных приложений. Зарегистрируй приложение в VK Ads и запусти sync.',
      );
    }

    const title = await this.pickText(vkAccountId, ['title_40_vkads', 'title_25']);
    const short = await this.pickText(vkAccountId, ['text_90']);
    const long = await this.pickText(vkAccountId, ['text_220']);
    if (!title || !short || !long) {
      throw new BadRequestException('Не хватает текстовых атомов title/short/long для appinstalls.');
    }

    const icon = await this.pickCreative(vkAccountId, ['icon_256x256_app', 'icon_256x256']);
    const image = await this.pickCreative(vkAccountId, ['image_600x600', 'image_1080x607']);
    if (!icon || !image) {
      throw new BadRequestException('Не хватает креативов для appinstalls.');
    }

    const audience = await this.pickWeighted(
      await this.prisma.aiAudienceProfile.findMany({ where: { vkAccountId } }),
      (r) => r.usageCount,
    );

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
      image: { id: image.id, vkContentId: image.vkContentId, contentKey: image.contentKey },
      audience: audience ? { id: audience.id, profile: audience.profile } : undefined,
    };
  }

  // ---- helpers ---------------------------------------------------------

  private async pickText(vkAccountId: number, roles: string[]) {
    const rows = await this.prisma.aiTextAtom.findMany({
      where: { vkAccountId, role: { in: roles } },
    });
    return this.pickWeighted(rows, (r) => r.usageCount);
  }

  private async pickCreative(vkAccountId: number, contentKeys: string[]) {
    const rows = await this.prisma.aiCreativeAsset.findMany({
      where: { vkAccountId, contentKey: { in: contentKeys } },
    });
    return this.pickWeighted(rows, (r) => r.usageCount);
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
