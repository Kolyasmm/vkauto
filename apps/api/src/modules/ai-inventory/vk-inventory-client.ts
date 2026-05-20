import { Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface VkPage<T> {
  items: T[];
  count?: number;
}

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
    this.client.interceptors.request.use(async (cfg) => {
      await new Promise((r) => setTimeout(r, 220));
      return cfg;
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
    });
  }

  async adGroups() {
    return this.listPaged('/api/v2/ad_groups.json', {
      fields: 'id,ad_plan_id,name,status,package_id,objective,targetings,budget_limit,budget_limit_day,max_price',
    });
  }

  async banners() {
    return this.listPaged('/api/v2/banners.json', {
      fields: 'id,ad_group_id,status,moderation_status,delivery,content,textblocks,urls',
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
}
