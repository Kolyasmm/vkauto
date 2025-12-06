import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface VkAdsApiResponse<T> {
  items?: T[];
  count?: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface AdStatisticsBase {
  shows: number;
  clicks: number;
  spent: string;
  goals: number;
  cpm: string;
  cpc: string;
  cpa: string;
}

export interface AdStatistics {
  id: number;
  total: {
    base: AdStatisticsBase;
  };
  rows: Array<{
    date: string;
    base: AdStatisticsBase;
  }>;
}

export interface AdGroup {
  id: number;
  campaign_id: number;
  ad_plan_id: number;
  name: string;
  status: string;
  issue?: {
    code: string;
    message: string;
  };
}

export interface Banner {
  id: number;
  ad_group_id: number;
  campaign_id: number;
  moderation_status: string;
}

export interface AdPlan {
  id: number;
  name: string;
  status?: string;
}

@Injectable()
export class VkService {
  private readonly logger = new Logger(VkService.name);
  private readonly defaultToken: string;
  private currentToken: string;

  constructor(private configService: ConfigService) {
    this.defaultToken = this.configService.get<string>('VK_ACCESS_TOKEN');
    this.currentToken = this.defaultToken;
  }

  /**
   * Установить токен для текущих операций
   */
  setAccessToken(token: string): void {
    this.currentToken = token;
  }

  /**
   * Сбросить токен к дефолтному из .env
   */
  resetAccessToken(): void {
    this.currentToken = this.defaultToken;
  }

  /**
   * Создать API клиент с указанным токеном
   */
  private createApiClient(token?: string): AxiosInstance {
    const accessToken = token || this.currentToken;
    const client = axios.create({
      baseURL: 'https://ads.vk.com/api/v2/',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Rate limiting - 5 запросов в секунду для VK Ads API
    client.interceptors.request.use(async (config) => {
      await this.sleep(200);
      return config;
    });

    return client;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async callApi<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    try {
      const client = this.createApiClient();
      const response = await client.get<T>(endpoint, { params });

      if ((response.data as any).error) {
        const error = (response.data as any).error;
        throw new Error(`VK Ads API Error: ${error.code} - ${error.message}`);
      }

      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка вызова VK Ads API ${endpoint}:`, error.message);
      throw error;
    }
  }

  private async postApi<T>(endpoint: string, data: any): Promise<T> {
    try {
      const client = this.createApiClient();
      const response = await client.post<T>(endpoint, data);

      if ((response.data as any).error) {
        const error = (response.data as any).error;
        throw new Error(`VK Ads API Error: ${error.code} - ${error.message}`);
      }

      return response.data;
    } catch (error) {
      // Логируем полную ошибку включая response body
      if (error.response?.data) {
        this.logger.error(`Ошибка POST VK Ads API ${endpoint}:`, JSON.stringify(error.response.data, null, 2));
      } else {
        this.logger.error(`Ошибка POST VK Ads API ${endpoint}:`, error.message);
      }
      throw error;
    }
  }

  /**
   * Получить информацию о пользователе
   */
  async getUser(): Promise<any> {
    this.logger.log('Получение информации о пользователе');
    return this.callApi('user.json');
  }

  /**
   * Получить список кампаний (ad_plans)
   */
  async getAdPlans(limit = 100, offset = 0): Promise<AdPlan[]> {
    this.logger.log('Получение списка кампаний');
    const response = await this.callApi<VkAdsApiResponse<AdPlan>>('ad_plans.json', {
      limit,
      offset,
    });
    return response.items || [];
  }

  /**
   * Получить список групп объявлений (одна страница)
   */
  async getAdGroups(adPlanId?: number, limit = 100, offset = 0, status?: string): Promise<AdGroup[]> {
    this.logger.log(`Получение групп объявлений${adPlanId ? ` для кампании ${adPlanId}` : ''}${status ? ` (status=${status})` : ''} (offset=${offset})`);

    const params: Record<string, any> = {
      limit,
      offset,
      fields: 'id,name,status,package_id',
    };
    if (adPlanId) {
      params._ad_plan_id = adPlanId;
    }
    if (status) {
      params._status = status;
    }

    const response = await this.callApi<VkAdsApiResponse<AdGroup>>('ad_groups.json', params);
    return response.items || [];
  }

  /**
   * Получить ВСЕ группы объявлений (с пагинацией)
   */
  async getAllAdGroups(adPlanId?: number): Promise<AdGroup[]> {
    const allGroups: AdGroup[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const groups = await this.getAdGroups(adPlanId, limit, offset);
      if (groups.length === 0) break;

      allGroups.push(...groups);
      offset += limit;

      // Безопасность: максимум 10000 групп
      if (offset >= 10000) break;
    }

    this.logger.log(`Всего загружено ${allGroups.length} групп объявлений`);
    return allGroups;
  }

  /**
   * Получить только АКТИВНЫЕ группы объявлений (с пагинацией)
   * Использует API фильтр _status=active для эффективной выборки
   */
  async getActiveAdGroups(adPlanId?: number): Promise<AdGroup[]> {
    const allGroups: AdGroup[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const groups = await this.getAdGroups(adPlanId, limit, offset, 'active');
      if (groups.length === 0) break;

      allGroups.push(...groups);
      offset += limit;

      // Безопасность: максимум 10000 групп
      if (offset >= 10000) break;
    }

    this.logger.log(`Загружено ${allGroups.length} активных групп объявлений`);
    return allGroups;
  }

  /**
   * Получить список баннеров (объявлений)
   */
  async getBanners(adGroupId?: number, limit = 100, offset = 0): Promise<Banner[]> {
    this.logger.log(`Получение баннеров${adGroupId ? ` для группы ${adGroupId}` : ''}`);

    const params: Record<string, any> = { limit, offset };
    if (adGroupId) {
      params._ad_group_id = adGroupId;
    }

    const response = await this.callApi<VkAdsApiResponse<Banner>>('banners.json', params);
    return response.items || [];
  }

  /**
   * Получить статистику по группам объявлений (с разбивкой на chunks для больших списков)
   */
  async getStatistics(
    dateFrom: string,
    dateTo: string,
    objectIds?: number[],
    objectType: 'ad_group' | 'ad_plan' | 'banner' = 'ad_group',
  ): Promise<AdStatistics[]> {
    this.logger.log(`Получение статистики за ${dateFrom} - ${dateTo}`);

    const endpoint = `statistics/${objectType}s/day.json`;

    // Если нет ID или мало - один запрос
    if (!objectIds || objectIds.length <= 200) {
      const params: Record<string, any> = {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: 'base',
      };
      if (objectIds && objectIds.length > 0) {
        params.id = objectIds.join(',');
      }
      const response = await this.callApi<VkAdsApiResponse<AdStatistics>>(endpoint, params);
      return response.items || [];
    }

    // Разбиваем на chunks по 200 ID
    const allStats: AdStatistics[] = [];
    const chunkSize = 200;

    for (let i = 0; i < objectIds.length; i += chunkSize) {
      const chunk = objectIds.slice(i, i + chunkSize);
      this.logger.log(`Загрузка статистики: ${i + chunk.length}/${objectIds.length}`);

      const params: Record<string, any> = {
        date_from: dateFrom,
        date_to: dateTo,
        metrics: 'base',
        id: chunk.join(','),
      };

      const response = await this.callApi<VkAdsApiResponse<AdStatistics>>(endpoint, params);
      if (response.items) {
        allStats.push(...response.items);
      }

      // Дополнительная задержка между chunk'ами для избежания 429
      if (i + chunkSize < objectIds.length) {
        await this.sleep(500);
      }
    }

    return allStats;
  }

  /**
   * Получить суммарную статистику
   */
  async getStatisticsSummary(
    dateFrom: string,
    dateTo: string,
    objectType: 'ad_group' | 'ad_plan' | 'banner' = 'ad_group',
  ): Promise<any> {
    this.logger.log(`Получение суммарной статистики за ${dateFrom} - ${dateTo}`);

    const endpoint = `statistics/${objectType}s/summary.json`;

    return this.callApi(endpoint, {
      date_from: dateFrom,
      date_to: dateTo,
      metrics: 'base',
    });
  }

  /**
   * Создать копию группы объявлений С БАННЕРАМИ
   * Получает ВСЕ настройки исходной группы и баннеров, создаёт новую группу с полными копиями
   * @param adGroupId - ID исходной группы
   * @param copyNumber - номер копии для названия
   * @param customBudget - кастомный дневной бюджет (если не указан - копируется с оригинала)
   */
  async createAdGroupCopy(adGroupId: number, copyNumber: number = 1, customBudget?: number): Promise<any> {
    this.logger.log(`Создание копии группы объявлений ${adGroupId} (копия ${copyNumber})${customBudget ? ` с бюджетом ${customBudget}₽` : ''}`);

    // Получаем ВСЕ настройки исходной группы (кроме read-only полей)
    const groupFields = [
      'id', 'name', 'package_id', 'ad_plan_id', 'objective',
      'autobidding_mode', 'budget_limit', 'budget_limit_day',
      'date_start', 'date_end', 'targetings', 'age_restrictions',
      'utm', 'max_price', 'enable_utm', 'priced_goal',
      'enable_offline_goals', 'enable_look_alike', 'enable_recombination',
      'language', 'banner_uniq_shows_limit', 'uniq_shows_limit',
      'uniq_shows_period', 'shows_limit', 'event_limit', 'budget_optimization_enabled',
      'enable_clickid', 'dynamic_banners_use_storelink', 'dynamic_without_remarketing',
      'mixing', 'social', 'social_quota', 'banners',
    ].join(',');

    const originalGroup = await this.callApi<any>(
      `ad_groups/${adGroupId}.json`,
      { fields: groupFields },
    );

    if (!originalGroup || !originalGroup.id) {
      throw new Error(`Не удалось получить данные группы ${adGroupId}`);
    }

    // Получаем полные данные баннеров исходной группы
    const bannerFields = 'id,name,content,textblocks,urls,call_to_action,deeplink,status';
    const bannersResponse = await this.callApi<VkAdsApiResponse<any>>(
      'banners.json',
      { _ad_group_id: adGroupId, fields: bannerFields, limit: 100 },
    );
    const originalBanners = bannersResponse.items || [];

    this.logger.log(`Найдено ${originalBanners.length} баннеров в группе ${adGroupId}`);

    // Формируем данные для новой группы - копируем ВСЕ поля
    const newGroupData: Record<string, any> = {
      name: `${originalGroup.name} (копия ${copyNumber})`,
      package_id: originalGroup.package_id,
      ad_plan_id: originalGroup.ad_plan_id,
    };

    // Копируем ВСЕ важные поля группы (исключая read-only поля: price, pricelist_id, budget_optimization_enabled)
    const fieldsToCopy = [
      'objective', 'autobidding_mode', 'budget_limit_day', 'budget_limit',
      'age_restrictions', 'enable_utm', 'utm', 'targetings', 'max_price',
      'priced_goal', 'enable_offline_goals', 'enable_look_alike', 'enable_recombination',
      'language', 'banner_uniq_shows_limit',
      'uniq_shows_limit', 'uniq_shows_period', 'shows_limit', 'event_limit',
      'enable_clickid', 'mixing',
    ];

    for (const field of fieldsToCopy) {
      if (originalGroup[field] !== undefined && originalGroup[field] !== null) {
        // Особая обработка для max_price - не копируем если 0.00
        if (field === 'max_price' && originalGroup[field] === '0.00') {
          continue;
        }
        newGroupData[field] = originalGroup[field];
      }
    }

    // Если указан кастомный бюджет - перезаписываем
    if (customBudget !== undefined) {
      newGroupData.budget_limit_day = customBudget;
      this.logger.log(`Установлен кастомный дневной бюджет: ${customBudget}₽`);
    }

    // Формируем баннеры для копирования с ПОЛНЫМИ данными
    if (originalBanners.length > 0) {
      newGroupData.banners = originalBanners.map((banner: any) => {
        const newBanner: Record<string, any> = {};

        // Копируем имя баннера с суффиксом (копия N)
        if (banner.name) {
          newBanner.name = `${banner.name} (копия ${copyNumber})`;
        }

        // Копируем content (медиа файлы) по ID - ВСЕ ключи
        if (banner.content) {
          newBanner.content = {};
          for (const [key, value] of Object.entries(banner.content)) {
            if (value && typeof value === 'object' && (value as any).id) {
              newBanner.content[key] = { id: (value as any).id };
            }
          }
        }

        // Копируем textblocks (тексты) - ВСЕ поля включая title
        if (banner.textblocks) {
          newBanner.textblocks = {};
          for (const [key, value] of Object.entries(banner.textblocks)) {
            if (value && typeof value === 'object') {
              const textBlock: Record<string, string> = {};
              if ((value as any).text !== undefined) {
                textBlock.text = (value as any).text;
              }
              if ((value as any).title !== undefined) {
                textBlock.title = (value as any).title;
              }
              if (Object.keys(textBlock).length > 0) {
                newBanner.textblocks[key] = textBlock;
              }
            }
          }
        }

        // Копируем urls по ID
        if (banner.urls) {
          newBanner.urls = {};
          for (const [key, value] of Object.entries(banner.urls)) {
            if (value && typeof value === 'object' && (value as any).id) {
              newBanner.urls[key] = { id: (value as any).id };
            }
          }
        }

        // Копируем call_to_action если есть
        if (banner.call_to_action) {
          newBanner.call_to_action = banner.call_to_action;
        }

        // Копируем deeplink если есть
        if (banner.deeplink) {
          newBanner.deeplink = banner.deeplink;
        }

        return newBanner;
      });
    }

    this.logger.debug(`Отправляем данные для создания группы: ${JSON.stringify(newGroupData, null, 2)}`);

    // Создаём новую группу с баннерами
    const result = await this.postApi<{ id: number; banners?: Array<{ id: number }> }>(
      'ad_groups.json',
      newGroupData,
    );

    this.logger.log(
      `✅ Создана копия группы ${adGroupId} -> ${result.id} (копия ${copyNumber}) с ${result.banners?.length || 0} баннерами`,
    );
    return result;
  }

  /**
   * Создать несколько копий группы объявлений с последовательной нумерацией
   * @param adGroupId - ID исходной группы
   * @param count - количество копий
   * @param customBudget - кастомный дневной бюджет (если не указан - копируется с оригинала)
   */
  async createAdGroupCopies(adGroupId: number, count: number, customBudget?: number): Promise<number[]> {
    this.logger.log(`Создание ${count} копий группы объявлений ${adGroupId}${customBudget ? ` с бюджетом ${customBudget}₽` : ''}`);

    const copiedIds: number[] = [];

    for (let i = 0; i < count; i++) {
      const copyNumber = i + 1; // Последовательная нумерация: 1, 2, 3...
      try {
        const result = await this.createAdGroupCopy(adGroupId, copyNumber, customBudget);
        if (result && result.id) {
          copiedIds.push(result.id);
          this.logger.log(`✅ Создана копия ${copyNumber}/${count}, ID: ${result.id}`);
        }
      } catch (error) {
        this.logger.error(`Ошибка создания копии ${copyNumber}:`, error.message);
      }
    }

    return copiedIds;
  }

  /**
   * Обновить статус группы объявлений
   */
  async updateAdGroupStatus(adGroupId: number, status: 'active' | 'blocked'): Promise<any> {
    this.logger.log(`Обновление статуса группы ${adGroupId} на ${status}`);

    return this.postApi(`ad_groups/${adGroupId}.json`, { status });
  }

  /**
   * Запустить группу объявлений
   */
  async startAdGroup(adGroupId: number): Promise<void> {
    await this.updateAdGroupStatus(adGroupId, 'active');
  }

  /**
   * Остановить группу объявлений
   */
  async stopAdGroup(adGroupId: number): Promise<void> {
    await this.updateAdGroupStatus(adGroupId, 'blocked');
  }

  /**
   * Рассчитать CPL (Cost Per Lead / Goal)
   */
  calculateCPL(spent: number, goals: number): number {
    if (goals === 0) return Infinity;
    return spent / goals;
  }

  /**
   * Получить вчерашнюю дату в формате YYYY-MM-DD
   */
  getYesterdayDate(): string {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  }

  /**
   * Получить сегодняшнюю дату в формате YYYY-MM-DD
   */
  getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }
}
