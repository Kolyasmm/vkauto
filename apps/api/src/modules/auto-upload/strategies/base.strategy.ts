import { Logger, BadRequestException } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface CampaignResult {
  campaignId: number;
  adGroupIds: number[];
  bannerIds: number[];
}

export interface BaseStrategyConfig {
  token: string;
  packageId: number;
  vkObjective: string;
  geoRegions: number[];
}

export abstract class BaseCampaignStrategy {
  protected readonly logger: Logger;
  protected client: AxiosInstance;
  protected config: BaseStrategyConfig;

  constructor(loggerContext: string) {
    this.logger = new Logger(loggerContext);
  }

  /**
   * Инициализация API клиента
   */
  init(token: string, config: Partial<BaseStrategyConfig> = {}) {
    this.client = axios.create({
      baseURL: 'https://ads.vk.com/api/v2/',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    this.config = {
      token,
      packageId: config.packageId || 0,
      vkObjective: config.vkObjective || '',
      geoRegions: config.geoRegions || [1],
    };
  }

  /**
   * Абстрактный метод создания кампании - реализуется в каждой стратегии
   */
  abstract createCampaign(dto: any): Promise<CampaignResult>;

  /**
   * Генерация списка возрастов
   */
  protected generateAgeList(from: number, to: number): number[] {
    const ages: number[] = [];
    for (let age = from; age <= to; age++) {
      ages.push(age);
    }
    return ages;
  }

  /**
   * Генерация расписания показов (каждый день с fromHour до toHour)
   */
  protected generateFulltime(fromHour: number, toHour: number): Record<string, any> {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const hours: number[] = [];
    for (let h = fromHour; h <= toHour; h++) {
      hours.push(h);
    }
    const fulltime: Record<string, any> = {
      flags: ['cross_timezone', 'use_holidays_moving'],
    };
    for (const day of days) {
      fulltime[day] = hours;
    }
    return fulltime;
  }

  /**
   * Создать URL объект в VK Ads
   */
  protected async createUrl(url: string): Promise<number> {
    try {
      const response = await this.client.post('urls.json', { url });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message || JSON.stringify(response.data.error));
      }

      const urlId = response.data.id;
      if (!urlId) {
        throw new BadRequestException('Не удалось получить ID URL');
      }

      this.logger.log(`URL создан/найден: ${urlId}`);
      return urlId;
    } catch (error) {
      this.logger.error('Ошибка создания URL:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка создания URL: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  /**
   * Отправить запрос на создание кампании
   */
  protected async sendCreateCampaignRequest(requestData: Record<string, any>): Promise<CampaignResult> {
    this.logger.log(`Отправляем запрос: ${JSON.stringify(requestData, null, 2)}`);

    let response;
    try {
      response = await this.client.post('ad_plans.json', requestData);
    } catch (error) {
      this.logger.error(`VK API Error: ${JSON.stringify(error.response?.data, null, 2)}`);
      const vkError = error.response?.data?.error;
      if (vkError) {
        throw new BadRequestException(JSON.stringify(vkError));
      }
      throw error;
    }

    this.logger.log(`VK API Response: ${JSON.stringify(response.data, null, 2)}`);

    if (response.data.error) {
      throw new BadRequestException(JSON.stringify(response.data.error));
    }

    const campaignId = response.data.id;
    if (!campaignId) {
      throw new BadRequestException('Не удалось получить ID созданной кампании');
    }

    // Получаем ID созданных групп и баннеров
    let adGroupIds: number[] = [];
    let bannerIds: number[] = [];

    if (response.data.ad_groups?.length > 0) {
      adGroupIds = response.data.ad_groups.map((g: any) => g.id);
      bannerIds = response.data.ad_groups.flatMap((g: any) => g.banners?.map((b: any) => b.id) || []);
    } else if (response.data.ad_group_ids?.length > 0) {
      adGroupIds = response.data.ad_group_ids;
    }

    // Если ID групп не вернулись - получаем отдельным запросом
    if (adGroupIds.length === 0) {
      const groupsResponse = await this.client.get('ad_groups.json', {
        params: { _ad_plan_id: campaignId, limit: 20, fields: 'id,banners' },
      });
      if (groupsResponse.data.items?.length > 0) {
        adGroupIds = groupsResponse.data.items.map((g: any) => g.id);
        bannerIds = groupsResponse.data.items.flatMap((g: any) => g.banners?.map((b: any) => b.id) || []);
      }
    }

    this.logger.log(`Кампания создана: ID ${campaignId}, групп: ${adGroupIds.length}, баннеров: ${bannerIds.length}`);
    return { campaignId, adGroupIds, bannerIds };
  }
}
