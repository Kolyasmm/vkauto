import { Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface VkPage<T> {
  items: T[];
  count?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class VkInventoryClient {
  private readonly logger = new Logger(VkInventoryClient.name);
  private readonly client: AxiosInstance;

  constructor(token: string) {
    this.client = axios.create({
      baseURL: 'https://ads.vk.com',
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    // Базовая задержка между запросами — 350ms (≈3 RPS) чтобы не упираться в VK 4 RPS.
    this.client.interceptors.request.use(async (cfg) => {
      await sleep(350);
      return cfg;
    });
    // Retry на 429: ждём Retry-After или экспоненциальный backoff (3,6,12,24,48 сек).
    this.client.interceptors.response.use(undefined, async (err: AxiosError) => {
      const cfg = err.config as any;
      if (!cfg) throw err;
      if (err.response?.status !== 429) throw err;
      cfg.__retryCount = (cfg.__retryCount || 0) + 1;
      if (cfg.__retryCount > 6) {
        this.logger.error(`VK 429 retry exhausted on ${cfg.url}`);
        throw err;
      }
      const retryAfter = Number(err.response.headers?.['retry-after']);
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(48_000, 3000 * 2 ** (cfg.__retryCount - 1));
      this.logger.warn(`VK 429 on ${cfg.url}, sleep ${wait}ms (try ${cfg.__retryCount}/6)`);
      await sleep(wait);
      return this.client.request(cfg);
    });
  }

  async listPaged<T = any>(
    path: string,
    params: Record<string, any> = {},
    pageLimit = 250,
    hardCap = 100_000,
  ): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    while (out.length < hardCap) {
      const resp = await this.client.get<VkPage<T>>(path, {
        params: { ...params, limit: pageLimit, offset },
      });
      const items = resp.data.items || [];
      out.push(...items);
      if (items.length < pageLimit) break;
      offset += pageLimit;
    }
    return out;
  }

  async user() {
    const r = await this.client.get('/api/v2/user.json');
    return r.data;
  }

  async adPlans() {
    return this.listPaged('/api/v2/ad_plans.json', {
      fields: 'id,name,status,objective,ad_object_type,ad_object_id,budget_limit,budget_limit_day,date_start,date_end',
      _status: 'active',
    });
  }

  async adGroups() {
    return this.listPaged('/api/v2/ad_groups.json', {
      fields: 'id,ad_plan_id,name,status,package_id,objective,targetings,budget_limit,budget_limit_day,max_price',
      _status: 'active',
    });
  }

  async banners() {
    return this.listPaged('/api/v2/banners.json', {
      fields: 'id,ad_group_id,status,moderation_status,delivery,content,textblocks,urls',
      _status: 'active',
    });
  }

  async leadForms() {
    return this.listPaged('/api/v1/lead_ads/lead_forms.json', {
      get_active_form_ad_plans: 1,
    });
  }

  async mobileApps() {
    return this.listPaged('/api/v1/mobile_app_users.json', {});
  }

  async packages() {
    return this.listPaged('/api/v2/packages.json', {});
  }

  async remarketingSegments() {
    return this.listPaged('/api/v2/remarketing/segments.json', {});
  }

  async interestsTree(): Promise<any[]> {
    const r = await this.client.get('/api/v2/targetings_tree.json', {
      params: { targetings: 'interests' },
    });
    return r.data?.interests || [];
  }

  async interestsSocDemTree(): Promise<any[]> {
    const r = await this.client.get('/api/v2/targetings_tree.json', {
      params: { targetings: 'interests_soc_dem' },
    });
    return r.data?.interests_soc_dem || [];
  }

  // Стата по баннерам за период. Chunk-ит по 200 ID, как и VkService.
  async bannerStats(
    bannerIds: bigint[],
    dateFrom: string,
    dateTo: string,
  ): Promise<Array<{ id: number; total: any; rows: any[] }>> {
    const chunkSize = 200;
    const out: any[] = [];
    for (let i = 0; i < bannerIds.length; i += chunkSize) {
      const chunk = bannerIds.slice(i, i + chunkSize);
      const r = await this.client.get('/api/v2/statistics/banners/day.json', {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
          metrics: 'base',
          id: chunk.map((x) => String(x)).join(','),
        },
      });
      if (Array.isArray(r.data?.items)) out.push(...r.data.items);
      await new Promise((res) => setTimeout(res, 400));
    }
    return out;
  }
}
