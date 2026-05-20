import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { VkInventoryClient } from '../vk-inventory-client';

export interface SyncStats {
  adPlans: number;
  adGroups: number;
  banners: number;
  textAtoms: number;
  creativeAssets: number;
  communityRefs: number;
  audienceProfiles: number;
  leadForms: number;
  mobileApps: number;
  packages: number;
}

const EMPTY_STATS = (): SyncStats => ({
  adPlans: 0,
  adGroups: 0,
  banners: 0,
  textAtoms: 0,
  creativeAssets: 0,
  communityRefs: 0,
  audienceProfiles: 0,
  leadForms: 0,
  mobileApps: 0,
  packages: 0,
});

@Injectable()
export class InventorySyncService {
  private readonly logger = new Logger(InventorySyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async startSync(vkAccountId: number): Promise<{ id: number; status: string }> {
    const account = await this.prisma.vkAccount.findUnique({
      where: { id: vkAccountId },
      select: { id: true, accessToken: true, isActive: true },
    });
    if (!account) {
      throw new NotFoundException(`VkAccount ${vkAccountId} не найден`);
    }

    const running = await this.prisma.aiInventorySync.findFirst({
      where: { vkAccountId, status: { in: ['pending', 'running'] } },
      orderBy: { startedAt: 'desc' },
    });
    if (running) {
      throw new ConflictException(`Уже идёт синхронизация id=${running.id}`);
    }

    const sync = await this.prisma.aiInventorySync.create({
      data: { vkAccountId, status: 'running', progress: 0 },
    });

    // запускаем в фоне — не ждём
    this.runSync(sync.id, vkAccountId, account.accessToken).catch((err) => {
      this.logger.error(`Sync ${sync.id} crashed: ${err.message}`);
    });

    return { id: sync.id, status: sync.status };
  }

  async getLatestSync(vkAccountId: number) {
    return this.prisma.aiInventorySync.findFirst({
      where: { vkAccountId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async getSync(id: number) {
    const sync = await this.prisma.aiInventorySync.findUnique({ where: { id } });
    if (!sync) throw new NotFoundException(`Sync ${id} не найден`);
    return sync;
  }

  async getInventoryStats(vkAccountId: number): Promise<SyncStats> {
    const [
      adPlans,
      adGroups,
      banners,
      textAtoms,
      creativeAssets,
      communityRefs,
      audienceProfiles,
      leadForms,
      mobileApps,
      packages,
    ] = await Promise.all([
      this.prisma.aiAdPlanIndex.count({ where: { vkAccountId } }),
      this.prisma.aiAdGroupIndex.count({ where: { vkAccountId } }),
      this.prisma.aiBannerIndex.count({ where: { vkAccountId } }),
      this.prisma.aiTextAtom.count({ where: { vkAccountId } }),
      this.prisma.aiCreativeAsset.count({ where: { vkAccountId } }),
      this.prisma.aiCommunityRef.count({ where: { vkAccountId } }),
      this.prisma.aiAudienceProfile.count({ where: { vkAccountId } }),
      this.prisma.aiLeadForm.count({ where: { vkAccountId } }),
      this.prisma.aiMobileApp.count({ where: { vkAccountId } }),
      this.prisma.aiPackage.count({ where: { vkAccountId } }),
    ]);
    return {
      adPlans,
      adGroups,
      banners,
      textAtoms,
      creativeAssets,
      communityRefs,
      audienceProfiles,
      leadForms,
      mobileApps,
      packages,
    };
  }

  private async runSync(syncId: number, vkAccountId: number, token: string) {
    const stats = EMPTY_STATS();
    const client = new VkInventoryClient(token);
    const t0 = Date.now();

    try {
      await this.tick(syncId, 5);
      stats.packages = await this.syncPackages(client, vkAccountId);

      await this.tick(syncId, 15);
      stats.adPlans = await this.syncAdPlans(client, vkAccountId);

      await this.tick(syncId, 30);
      const { adGroups, audienceProfiles } = await this.syncAdGroups(client, vkAccountId);
      stats.adGroups = adGroups;
      stats.audienceProfiles = audienceProfiles;

      await this.tick(syncId, 70);
      const banners = await this.syncBanners(client, vkAccountId);
      stats.banners = banners.banners;
      stats.textAtoms = banners.textAtoms;
      stats.creativeAssets = banners.creativeAssets;
      stats.communityRefs = banners.communityRefs;

      await this.tick(syncId, 85);
      stats.leadForms = await this.syncLeadForms(client, vkAccountId);

      await this.tick(syncId, 95);
      stats.mobileApps = await this.syncMobileApps(client, vkAccountId);

      await this.prisma.aiInventorySync.update({
        where: { id: syncId },
        data: {
          status: 'completed',
          progress: 100,
          stats: stats as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
      this.logger.log(`Sync ${syncId} done in ${Date.now() - t0}ms: ${JSON.stringify(stats)}`);
    } catch (err: any) {
      const message = err?.response?.data
        ? `${err.message}: ${JSON.stringify(err.response.data).slice(0, 500)}`
        : err?.message || String(err);
      this.logger.error(`Sync ${syncId} failed: ${message}`);
      await this.prisma.aiInventorySync.update({
        where: { id: syncId },
        data: {
          status: 'failed',
          errorMessage: message.slice(0, 2000),
          stats: stats as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    }
  }

  private async tick(syncId: number, progress: number) {
    await this.prisma.aiInventorySync.update({
      where: { id: syncId },
      data: { progress },
    });
  }

  // ---- syncers ---------------------------------------------------------

  private async syncPackages(client: VkInventoryClient, vkAccountId: number): Promise<number> {
    const items = await client.packages().catch(() => [] as any[]);
    for (const p of items) {
      const vkPackageId = Number(p.id);
      if (!Number.isFinite(vkPackageId)) continue;
      await this.prisma.aiPackage.upsert({
        where: { vkAccountId_vkPackageId: { vkAccountId, vkPackageId } },
        update: {
          objective: p.objective ?? null,
          subObjective: p.sub_objective ?? null,
          name: p.name ?? null,
          raw: p as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkPackageId,
          objective: p.objective ?? null,
          subObjective: p.sub_objective ?? null,
          name: p.name ?? null,
          raw: p as Prisma.InputJsonValue,
        },
      });
    }
    return items.length;
  }

  private async syncAdPlans(client: VkInventoryClient, vkAccountId: number): Promise<number> {
    const items = await client.adPlans();
    for (const p of items) {
      const vkAdPlanId = BigInt(p.id);
      await this.prisma.aiAdPlanIndex.upsert({
        where: { vkAccountId_vkAdPlanId: { vkAccountId, vkAdPlanId } },
        update: {
          name: p.name ?? null,
          objective: p.objective ?? null,
          adObjectType: p.ad_object_type ?? null,
          adObjectId: p.ad_object_id ? BigInt(p.ad_object_id) : null,
          status: p.status ?? null,
          budgetLimit: this.toDecimal(p.budget_limit),
          budgetLimitDay: this.toDecimal(p.budget_limit_day),
          raw: p as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkAdPlanId,
          name: p.name ?? null,
          objective: p.objective ?? null,
          adObjectType: p.ad_object_type ?? null,
          adObjectId: p.ad_object_id ? BigInt(p.ad_object_id) : null,
          status: p.status ?? null,
          budgetLimit: this.toDecimal(p.budget_limit),
          budgetLimitDay: this.toDecimal(p.budget_limit_day),
          raw: p as Prisma.InputJsonValue,
        },
      });
    }
    return items.length;
  }

  private async syncAdGroups(
    client: VkInventoryClient,
    vkAccountId: number,
  ): Promise<{ adGroups: number; audienceProfiles: number }> {
    const items = await client.adGroups();
    const profileSeen = new Map<string, any>();

    for (const g of items) {
      const vkAdGroupId = BigInt(g.id);
      await this.prisma.aiAdGroupIndex.upsert({
        where: { vkAccountId_vkAdGroupId: { vkAccountId, vkAdGroupId } },
        update: {
          vkAdPlanId: g.ad_plan_id ? BigInt(g.ad_plan_id) : null,
          name: g.name ?? null,
          status: g.status ?? null,
          packageId: g.package_id ?? null,
          objective: g.objective ?? null,
          targetings: (g.targetings ?? null) as Prisma.InputJsonValue,
          budget: this.toDecimal(g.budget_limit_day ?? g.budget_limit),
          maxPrice: this.toDecimal(g.max_price),
          raw: g as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkAdGroupId,
          vkAdPlanId: g.ad_plan_id ? BigInt(g.ad_plan_id) : null,
          name: g.name ?? null,
          status: g.status ?? null,
          packageId: g.package_id ?? null,
          objective: g.objective ?? null,
          targetings: (g.targetings ?? null) as Prisma.InputJsonValue,
          budget: this.toDecimal(g.budget_limit_day ?? g.budget_limit),
          maxPrice: this.toDecimal(g.max_price),
          raw: g as Prisma.InputJsonValue,
        },
      });

      if (g.targetings) {
        const normalized = this.normalizeTargetings(g.targetings);
        const hash = this.sha1(JSON.stringify(normalized));
        if (!profileSeen.has(hash)) {
          profileSeen.set(hash, normalized);
        }
      }
    }

    for (const [hash, profile] of profileSeen) {
      await this.prisma.aiAudienceProfile.upsert({
        where: { vkAccountId_profileHash: { vkAccountId, profileHash: hash } },
        update: { usageCount: { increment: 1 } },
        create: {
          vkAccountId,
          profileHash: hash,
          profile: profile as Prisma.InputJsonValue,
          usageCount: 1,
        },
      });
    }

    return { adGroups: items.length, audienceProfiles: profileSeen.size };
  }

  private async syncBanners(
    client: VkInventoryClient,
    vkAccountId: number,
  ): Promise<{ banners: number; textAtoms: number; creativeAssets: number; communityRefs: number }> {
    const items = await client.banners();
    const textAtomKeys = new Set<string>();
    const creativeAssetIds = new Set<bigint>();
    const communityUrlIds = new Set<bigint>();

    for (const b of items) {
      const vkBannerId = BigInt(b.id);

      await this.prisma.aiBannerIndex.upsert({
        where: { vkAccountId_vkBannerId: { vkAccountId, vkBannerId } },
        update: {
          vkAdGroupId: b.ad_group_id ? BigInt(b.ad_group_id) : null,
          status: b.status ?? null,
          moderationStatus: b.moderation_status ?? null,
          delivery: b.delivery ?? null,
          content: (b.content ?? null) as Prisma.InputJsonValue,
          textblocks: (b.textblocks ?? null) as Prisma.InputJsonValue,
          urls: (b.urls ?? null) as Prisma.InputJsonValue,
          raw: b as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkBannerId,
          vkAdGroupId: b.ad_group_id ? BigInt(b.ad_group_id) : null,
          status: b.status ?? null,
          moderationStatus: b.moderation_status ?? null,
          delivery: b.delivery ?? null,
          content: (b.content ?? null) as Prisma.InputJsonValue,
          textblocks: (b.textblocks ?? null) as Prisma.InputJsonValue,
          urls: (b.urls ?? null) as Prisma.InputJsonValue,
          raw: b as Prisma.InputJsonValue,
        },
      });

      // textblocks → text atoms
      if (b.textblocks && typeof b.textblocks === 'object') {
        for (const [role, raw] of Object.entries<any>(b.textblocks)) {
          const text = this.extractText(raw);
          if (!text) continue;
          const isCta = role.startsWith('cta_');
          const bodyHash = this.sha1(text);
          const key = `${role}|${bodyHash}`;
          if (textAtomKeys.has(key)) {
            await this.prisma.aiTextAtom.update({
              where: { vkAccountId_role_bodyHash: { vkAccountId, role, bodyHash } },
              data: { usageCount: { increment: 1 } },
            });
          } else {
            await this.prisma.aiTextAtom.upsert({
              where: { vkAccountId_role_bodyHash: { vkAccountId, role, bodyHash } },
              update: { usageCount: { increment: 1 } },
              create: {
                vkAccountId,
                role,
                body: text.slice(0, 5000),
                cta: isCta ? text : null,
                bodyHash,
                sourceBannerId: vkBannerId,
                usageCount: 1,
              },
            });
            textAtomKeys.add(key);
          }
        }
      }

      // content → creative assets
      if (b.content && typeof b.content === 'object') {
        for (const [contentKey, raw] of Object.entries<any>(b.content)) {
          if (!raw || typeof raw !== 'object' || !raw.id) continue;
          const vkContentId = BigInt(raw.id);
          if (creativeAssetIds.has(vkContentId)) {
            await this.prisma.aiCreativeAsset.update({
              where: { vkAccountId_vkContentId: { vkAccountId, vkContentId } },
              data: { usageCount: { increment: 1 } },
            });
            continue;
          }
          const variants = raw.variants || {};
          const original = variants.original || variants.uploaded || variants.high || {};
          const preview =
            original.url ||
            variants['high-first_frame']?.url ||
            variants['medium-first_frame']?.url ||
            variants.low?.url ||
            null;
          await this.prisma.aiCreativeAsset.upsert({
            where: { vkAccountId_vkContentId: { vkAccountId, vkContentId } },
            update: { usageCount: { increment: 1 } },
            create: {
              vkAccountId,
              vkContentId,
              type: raw.type ?? 'static',
              contentKey,
              previewUrl: preview,
              width: original.width ?? null,
              height: original.height ?? null,
              raw: raw as Prisma.InputJsonValue,
            },
          });
          creativeAssetIds.add(vkContentId);
        }
      }

      // urls → community refs (vk_group / vk_post / external)
      if (b.urls && typeof b.urls === 'object') {
        for (const slot of Object.values<any>(b.urls)) {
          if (!slot || typeof slot !== 'object') continue;
          const vkUrlId =
            slot.id != null ? BigInt(slot.id) : slot.url_object_id != null ? BigInt(slot.url_object_id) : null;
          if (vkUrlId == null) continue;
          const url = slot.url || '';
          const urlTypes: string[] = Array.isArray(slot.url_types) ? slot.url_types : [];
          const urlType = urlTypes[0] || slot.type || 'unknown';
          const shortname = this.extractVkShortname(url);
          if (communityUrlIds.has(vkUrlId)) {
            await this.prisma.aiCommunityRef.update({
              where: { vkAccountId_vkUrlId: { vkAccountId, vkUrlId } },
              data: { usageCount: { increment: 1 } },
            });
            continue;
          }
          await this.prisma.aiCommunityRef.upsert({
            where: { vkAccountId_vkUrlId: { vkAccountId, vkUrlId } },
            update: { usageCount: { increment: 1 } },
            create: {
              vkAccountId,
              vkUrlId,
              url: url.slice(0, 2000),
              urlType,
              groupShortname: shortname,
            },
          });
          communityUrlIds.add(vkUrlId);
        }
      }
    }

    return {
      banners: items.length,
      textAtoms: textAtomKeys.size,
      creativeAssets: creativeAssetIds.size,
      communityRefs: communityUrlIds.size,
    };
  }

  private async syncLeadForms(client: VkInventoryClient, vkAccountId: number): Promise<number> {
    const items = await client.leadForms().catch(() => [] as any[]);
    for (const f of items) {
      const vkLeadFormId = BigInt(f.id);
      await this.prisma.aiLeadForm.upsert({
        where: { vkAccountId_vkLeadFormId: { vkAccountId, vkLeadFormId } },
        update: {
          name: f.name ?? null,
          leadsCount: typeof f.leads_count === 'number' ? f.leads_count : 0,
          raw: f as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkLeadFormId,
          name: f.name ?? null,
          leadsCount: typeof f.leads_count === 'number' ? f.leads_count : 0,
          raw: f as Prisma.InputJsonValue,
        },
      });
    }
    return items.length;
  }

  private async syncMobileApps(client: VkInventoryClient, vkAccountId: number): Promise<number> {
    const items = await client.mobileApps().catch(() => [] as any[]);
    for (const a of items) {
      const vkMobileAppId = BigInt(a.id ?? a.rb_mobile_app_id ?? 0);
      if (vkMobileAppId === 0n) continue;
      await this.prisma.aiMobileApp.upsert({
        where: { vkAccountId_vkMobileAppId: { vkAccountId, vkMobileAppId } },
        update: {
          platform: a.platform ?? null,
          name: a.name ?? null,
          storeUrl: a.store_url ?? null,
          categoryId: a.category_id ?? null,
          raw: a as Prisma.InputJsonValue,
          syncedAt: new Date(),
        },
        create: {
          vkAccountId,
          vkMobileAppId,
          platform: a.platform ?? null,
          name: a.name ?? null,
          storeUrl: a.store_url ?? null,
          categoryId: a.category_id ?? null,
          raw: a as Prisma.InputJsonValue,
        },
      });
    }
    return items.length;
  }

  // ---- helpers ---------------------------------------------------------

  private extractText(raw: any): string | null {
    if (raw == null) return null;
    if (typeof raw === 'string') return raw.trim() || null;
    if (typeof raw === 'object') {
      if (typeof raw.text === 'string') return raw.text.trim() || null;
      if (typeof raw.value === 'string') return raw.value.trim() || null;
    }
    return null;
  }

  private toDecimal(v: any): Prisma.Decimal | null {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isFinite(n)) return null;
    return new Prisma.Decimal(n);
  }

  private sha1(s: string): string {
    return crypto.createHash('sha1').update(s).digest('hex');
  }

  // Нормализация таргетингов под dedupe-ключ: сортируем массивы, выбрасываем null'ы.
  private normalizeTargetings(t: any): any {
    if (!t || typeof t !== 'object') return {};
    const sorted = (arr: any[]) =>
      [...arr].sort((a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
    const keys = [
      'sex',
      'age_list',
      'ages',
      'geo_locations',
      'geo',
      'regions',
      'cities',
      'segments',
      'remarketing',
      'interests',
      'interests_soc_dem',
      'pads',
      'mobile_operating_systems',
      'auditory',
      'languages',
    ];
    const out: Record<string, any> = {};
    for (const k of keys) {
      const v = t[k];
      if (v == null) continue;
      if (Array.isArray(v)) out[k] = sorted(v);
      else if (typeof v === 'object') out[k] = v;
      else out[k] = v;
    }
    return out;
  }

  private extractVkShortname(url: string): string | null {
    if (!url) return null;
    const m = url.match(/vk\.com\/([A-Za-z0-9_.]+)/);
    return m ? m[1] : null;
  }
}
