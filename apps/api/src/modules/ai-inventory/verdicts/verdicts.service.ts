import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

const sha1 = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

// Пороги для verdict.
// winner: relative_cpl < 0.6 (на 40%+ лучше среднего по кабинету) AND leads >= 5
// loser:  relative_cpl > 1.5 (на 50%+ хуже) ИЛИ (spent > 1000 AND leads == 0)
// neutral: всё остальное И когда мало данных
const VERDICT_THRESHOLDS = {
  WINNER_RELATIVE_CPL: 0.6,
  LOSER_RELATIVE_CPL: 1.5,
  WINNER_MIN_LEADS: 5,
  MIN_BANNER_COUNT: 5,
  MIN_SPENT: 1000,
  DEAD_SPENT: 1000, // потратили столько и 0 лидов = loser
  ABSOLUTE_WINNER_CPL: 200,
  ABSOLUTE_LOSER_CPL: 450,
};

export type AtomLevel = 'text_atom' | 'creative_asset' | 'audience_profile' | 'community_ref';

interface AtomAggregate {
  atomId: number; // наш PK (ai_text_atoms.id etc.)
  bannerCount: number;
  spent: number;
  goals: number;
  shows: number;
  clicks: number;
  avgCpl: number | null;
}

@Injectable()
export class VerdictsService {
  private readonly logger = new Logger(VerdictsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Запускается из InventorySyncService после syncBanners + syncStats.
  // Считает агрегаты по всем атомам и записывает verdicts.
  async recomputeAll(vkAccountId: number, periodDays = 30): Promise<{
    texts: number;
    creatives: number;
    audiences: number;
    cabinetAvgCpl: number | null;
  }> {
    this.logger.log(`[recomputeAll] start vkAccountId=${vkAccountId} period=${periodDays}d`);
    const cabinetAvgCpl = await this.computeCabinetAvgCpl(vkAccountId, periodDays);
    this.logger.log(`[recomputeAll] cabinetAvgCpl=${cabinetAvgCpl}`);

    await this.prisma.aiPerformanceVerdict.deleteMany({
      where: { vkAccountId, level: { in: ['text_atom', 'creative_asset', 'audience_profile'] } },
    });
    this.logger.log(`[recomputeAll] cleared old verdicts`);

    const texts = await this.recomputeTextAtoms(vkAccountId, periodDays, cabinetAvgCpl);
    this.logger.log(`[recomputeAll] texts done: ${texts} verdicts`);

    const creatives = await this.recomputeCreatives(vkAccountId, periodDays, cabinetAvgCpl);
    this.logger.log(`[recomputeAll] creatives done: ${creatives} verdicts`);

    const audiences = await this.recomputeAudiences(vkAccountId, periodDays, cabinetAvgCpl);
    this.logger.log(`[recomputeAll] audiences done: ${audiences} verdicts`);

    return { texts, creatives, audiences, cabinetAvgCpl };
  }

  // Средний CPL по всему кабинету за период (общий spent / общие goals).
  private async computeCabinetAvgCpl(vkAccountId: number, periodDays: number): Promise<number | null> {
    const r = await this.prisma.aiBannerStats.aggregate({
      where: { vkAccountId, periodDays },
      _sum: { spent: true, goals: true },
    });
    const spent = Number(r._sum.spent ?? 0);
    const goals = Number(r._sum.goals ?? 0);
    if (goals === 0) return null;
    return spent / goals;
  }

  // Агрегирует stats по всем баннерам где встречался каждый text_atom.
  private async recomputeTextAtoms(
    vkAccountId: number,
    periodDays: number,
    cabinetAvgCpl: number | null,
  ): Promise<number> {
    // Берём все text_atoms кабинета вместе с body_hash
    const atoms = await this.prisma.aiTextAtom.findMany({
      where: { vkAccountId },
      select: { id: true, role: true, bodyHash: true },
    });

    // Для каждого атома находим баннеры где он встречался через textblocks->role->hash.
    // Это нельзя сделать одним SQL без денормализации, поэтому стратегия:
    // - грузим все baner_index с textblocks
    // - грузим все banner_stats
    // - в JS соединяем
    const banners = await this.prisma.aiBannerIndex.findMany({
      where: { vkAccountId },
      select: { vkBannerId: true, textblocks: true },
    });
    const stats = await this.prisma.aiBannerStats.findMany({
      where: { vkAccountId, periodDays },
      select: { vkBannerId: true, spent: true, goals: true, shows: true, clicks: true, cpl: true },
    });
    const statsByBanner = new Map<string, (typeof stats)[number]>();
    for (const s of stats) statsByBanner.set(s.vkBannerId.toString(), s);

    // Карта banner_id → [{role, body_hash}]
    const bannerAtoms = new Map<string, Array<{ role: string; bodyHash: string }>>();
    // crypto импортирован наверху файла, sha1 хелпер выше
    for (const b of banners) {
      const tb = b.textblocks as any;
      if (!tb || typeof tb !== 'object') continue;
      const items: Array<{ role: string; bodyHash: string }> = [];
      for (const [role, raw] of Object.entries<any>(tb)) {
        const text =
          typeof raw === 'string' ? raw :
          typeof raw?.text === 'string' ? raw.text :
          typeof raw?.value === 'string' ? raw.value : null;
        if (!text) continue;
        const bodyHash = sha1(text.trim());
        items.push({ role, bodyHash });
      }
      bannerAtoms.set(b.vkBannerId.toString(), items);
    }

    let written = 0;
    for (const atom of atoms) {
      const agg: AtomAggregate = { atomId: atom.id, bannerCount: 0, spent: 0, goals: 0, shows: 0, clicks: 0, avgCpl: null };
      for (const [bannerId, items] of bannerAtoms) {
        if (!items.some((i) => i.role === atom.role && i.bodyHash === atom.bodyHash)) continue;
        const s = statsByBanner.get(bannerId);
        if (!s) continue;
        agg.bannerCount++;
        agg.spent += Number(s.spent);
        agg.goals += s.goals;
        agg.shows += s.shows;
        agg.clicks += s.clicks;
      }
      if (agg.goals > 0) agg.avgCpl = agg.spent / agg.goals;
      const verdict = this.computeVerdict(agg, cabinetAvgCpl);
      if (verdict) {
        await this.writeVerdict(vkAccountId, 'text_atom', atom.id, verdict, agg, cabinetAvgCpl);
        written++;
      }
    }
    return written;
  }

  private async recomputeCreatives(
    vkAccountId: number,
    periodDays: number,
    cabinetAvgCpl: number | null,
  ): Promise<number> {
    const assets = await this.prisma.aiCreativeAsset.findMany({
      where: { vkAccountId },
      select: { id: true, vkContentId: true, contentKey: true },
    });
    const banners = await this.prisma.aiBannerIndex.findMany({
      where: { vkAccountId },
      select: { vkBannerId: true, content: true },
    });
    const stats = await this.prisma.aiBannerStats.findMany({
      where: { vkAccountId, periodDays },
      select: { vkBannerId: true, spent: true, goals: true, shows: true, clicks: true },
    });
    const statsByBanner = new Map<string, (typeof stats)[number]>();
    for (const s of stats) statsByBanner.set(s.vkBannerId.toString(), s);

    // banner_id → Set<vkContentId+contentKey>
    const bannerContent = new Map<string, Set<string>>();
    for (const b of banners) {
      const c = b.content as any;
      if (!c || typeof c !== 'object') continue;
      const set = new Set<string>();
      for (const [key, raw] of Object.entries<any>(c)) {
        if (raw && typeof raw === 'object' && raw.id != null) {
          set.add(`${key}:${String(raw.id)}`);
        }
      }
      bannerContent.set(b.vkBannerId.toString(), set);
    }

    let written = 0;
    for (const a of assets) {
      const needle = `${a.contentKey}:${a.vkContentId.toString()}`;
      const agg: AtomAggregate = { atomId: a.id, bannerCount: 0, spent: 0, goals: 0, shows: 0, clicks: 0, avgCpl: null };
      for (const [bannerId, set] of bannerContent) {
        if (!set.has(needle)) continue;
        const s = statsByBanner.get(bannerId);
        if (!s) continue;
        agg.bannerCount++;
        agg.spent += Number(s.spent);
        agg.goals += s.goals;
        agg.shows += s.shows;
        agg.clicks += s.clicks;
      }
      if (agg.goals > 0) agg.avgCpl = agg.spent / agg.goals;
      const verdict = this.computeVerdict(agg, cabinetAvgCpl);
      if (verdict) {
        await this.writeVerdict(vkAccountId, 'creative_asset', a.id, verdict, agg, cabinetAvgCpl);
        written++;
      }
    }
    return written;
  }

  private async recomputeAudiences(
    vkAccountId: number,
    periodDays: number,
    cabinetAvgCpl: number | null,
  ): Promise<number> {
    // У audience_profiles нет прямой связи с баннерами — связь через ad_group_id.
    // ai_ad_group_index хранит targetings JSON. Считаем hash и матчим.
    const profiles = await this.prisma.aiAudienceProfile.findMany({
      where: { vkAccountId },
      select: { id: true, profileHash: true },
    });
    const adGroups = await this.prisma.aiAdGroupIndex.findMany({
      where: { vkAccountId },
      select: { vkAdGroupId: true, targetings: true },
    });
    const banners = await this.prisma.aiBannerIndex.findMany({
      where: { vkAccountId },
      select: { vkBannerId: true, vkAdGroupId: true },
    });
    const stats = await this.prisma.aiBannerStats.findMany({
      where: { vkAccountId, periodDays },
      select: { vkBannerId: true, spent: true, goals: true, shows: true, clicks: true },
    });
    const statsByBanner = new Map<string, (typeof stats)[number]>();
    for (const s of stats) statsByBanner.set(s.vkBannerId.toString(), s);

    // crypto импортирован наверху файла, sha1 хелпер выше
    const normalizeTargetings = (t: any): any => {
      if (!t || typeof t !== 'object') return {};
      const sorted = (arr: any[]) => [...arr].sort((a, b) => (String(a) < String(b) ? -1 : 1));
      const out: Record<string, any> = {};
      const keys = ['sex', 'age_list', 'ages', 'geo_locations', 'geo', 'regions', 'cities', 'segments', 'remarketing', 'interests', 'interests_soc_dem', 'pads', 'mobile_operating_systems', 'auditory', 'languages'];
      for (const k of keys) {
        const v = t[k];
        if (v == null) continue;
        if (Array.isArray(v)) out[k] = sorted(v);
        else out[k] = v;
      }
      return out;
    };
    const groupHash = new Map<string, string>();
    for (const g of adGroups) {
      const n = normalizeTargetings(g.targetings);
      groupHash.set(g.vkAdGroupId.toString(), sha1(JSON.stringify(n)));
    }

    let written = 0;
    for (const p of profiles) {
      const agg: AtomAggregate = { atomId: p.id, bannerCount: 0, spent: 0, goals: 0, shows: 0, clicks: 0, avgCpl: null };
      for (const b of banners) {
        if (!b.vkAdGroupId) continue;
        const h = groupHash.get(b.vkAdGroupId.toString());
        if (h !== p.profileHash) continue;
        const s = statsByBanner.get(b.vkBannerId.toString());
        if (!s) continue;
        agg.bannerCount++;
        agg.spent += Number(s.spent);
        agg.goals += s.goals;
        agg.shows += s.shows;
        agg.clicks += s.clicks;
      }
      if (agg.goals > 0) agg.avgCpl = agg.spent / agg.goals;
      const verdict = this.computeVerdict(agg, cabinetAvgCpl);
      if (verdict) {
        await this.writeVerdict(vkAccountId, 'audience_profile', p.id, verdict, agg, cabinetAvgCpl);
        written++;
      }
    }
    return written;
  }

  // Возвращает 'winner' | 'loser' | 'neutral' или null если данных недостаточно
  // (тогда verdict не записывается, picker трактует как neutral по умолчанию).
  private computeVerdict(agg: AtomAggregate, cabinetAvgCpl: number | null): 'winner' | 'loser' | 'neutral' | null {
    if (agg.bannerCount < VERDICT_THRESHOLDS.MIN_BANNER_COUNT) return null;
    if (agg.spent < VERDICT_THRESHOLDS.MIN_SPENT) return null;

    if (agg.spent >= VERDICT_THRESHOLDS.DEAD_SPENT && agg.goals === 0) return 'loser';

    if (agg.goals === 0) return null;
    const cpl = agg.spent / agg.goals;
    const relative = cabinetAvgCpl && cabinetAvgCpl > 0 ? cpl / cabinetAvgCpl : null;

    const absoluteWinner = cpl < VERDICT_THRESHOLDS.ABSOLUTE_WINNER_CPL;
    const absoluteLoser = cpl > VERDICT_THRESHOLDS.ABSOLUTE_LOSER_CPL;
    const relativeWinner = relative !== null && relative < VERDICT_THRESHOLDS.WINNER_RELATIVE_CPL;
    const relativeLoser = relative !== null && relative > VERDICT_THRESHOLDS.LOSER_RELATIVE_CPL;

    if ((absoluteWinner || relativeWinner) && agg.goals >= VERDICT_THRESHOLDS.WINNER_MIN_LEADS) return 'winner';
    if (absoluteLoser || relativeLoser) return 'loser';
    return 'neutral';
  }

  private async writeVerdict(
    vkAccountId: number,
    level: AtomLevel,
    atomId: number,
    verdict: 'winner' | 'loser' | 'neutral',
    agg: AtomAggregate,
    cabinetAvgCpl: number | null,
  ) {
    await this.prisma.aiPerformanceVerdict.create({
      data: {
        vkAccountId,
        level,
        vkObjectId: BigInt(atomId),
        verdict,
        score: agg.avgCpl ? new Prisma.Decimal(agg.avgCpl) : null,
        criteria: {
          bannerCount: agg.bannerCount,
          spent: agg.spent,
          goals: agg.goals,
          shows: agg.shows,
          clicks: agg.clicks,
          avgCpl: agg.avgCpl,
          cabinetAvgCpl,
          relative: cabinetAvgCpl && agg.avgCpl ? agg.avgCpl / cabinetAvgCpl : null,
        } as Prisma.InputJsonValue,
      },
    });
  }
}
