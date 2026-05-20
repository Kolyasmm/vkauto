import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface AdPlanCreatedResponse {
  adPlanId: bigint;
  adGroupIds: bigint[];
  bannerIds: bigint[];
  raw: any;
}

export class VkLauncherClient {
  private readonly logger = new Logger(VkLauncherClient.name);
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
    this.client.interceptors.request.use(async (cfg) => {
      await new Promise((r) => setTimeout(r, 220));
      return cfg;
    });
  }

  async createUrl(url: string): Promise<number> {
    const resp = await this.client.post('/api/v2/urls.json', { url });
    if (resp.data?.error) {
      throw new Error(`VK urls.json: ${JSON.stringify(resp.data.error)}`);
    }
    const id = resp.data?.id;
    if (!id) throw new Error('VK urls.json вернул пустой id');
    return Number(id);
  }

  async createAdPlan(payload: Record<string, any>): Promise<AdPlanCreatedResponse> {
    const resp = await this.client.post('/api/v2/ad_plans.json', payload);
    if (resp.data?.error) {
      throw new Error(`VK ad_plans.json: ${JSON.stringify(resp.data.error)}`);
    }
    const adPlanId = BigInt(resp.data?.id ?? 0);
    if (adPlanId === 0n) throw new Error('VK ad_plans.json вернул пустой id');

    let adGroupIds: bigint[] = [];
    let bannerIds: bigint[] = [];

    if (Array.isArray(resp.data?.ad_groups) && resp.data.ad_groups.length) {
      adGroupIds = resp.data.ad_groups.map((g: any) => BigInt(g.id));
      bannerIds = resp.data.ad_groups.flatMap((g: any) =>
        Array.isArray(g.banners) ? g.banners.map((b: any) => BigInt(b.id)) : [],
      );
    } else if (Array.isArray(resp.data?.ad_group_ids)) {
      adGroupIds = resp.data.ad_group_ids.map((x: any) => BigInt(x));
    }

    if (adGroupIds.length === 0) {
      const groups = await this.client.get('/api/v2/ad_groups.json', {
        params: { _ad_plan_id: String(adPlanId), limit: 20, fields: 'id,banners' },
      });
      if (Array.isArray(groups.data?.items)) {
        adGroupIds = groups.data.items.map((g: any) => BigInt(g.id));
        bannerIds = groups.data.items.flatMap((g: any) =>
          Array.isArray(g.banners) ? g.banners.map((b: any) => BigInt(b.id)) : [],
        );
      }
    }

    return { adPlanId, adGroupIds, bannerIds, raw: resp.data };
  }
}
