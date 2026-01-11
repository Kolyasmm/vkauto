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
   * Получить группу объявлений по ID напрямую
   */
  async getAdGroupById(adGroupId: number): Promise<AdGroup | null> {
    this.logger.log(`Получение группы объявлений по ID ${adGroupId}`);

    try {
      const response = await this.callApi<AdGroup>(
        `ad_groups/${adGroupId}.json`,
        { fields: 'id,name,status,package_id,ad_plan_id' },
      );

      return response;
    } catch (error) {
      // Если группа не найдена (404) - возвращаем null
      // Проверяем разные варианты как axios может передать 404
      if (
        error.response?.status === 404 ||
        error.status === 404 ||
        error.message?.includes('404') ||
        error.message?.includes('Not Found')
      ) {
        this.logger.warn(`Группа ${adGroupId} не найдена (404)`);
        return null;
      }
      throw error;
    }
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
   * Получить все группы объявлений с указанным токеном
   * @param token - токен VK API
   * @param adPlanId - фильтр по кампании (опционально)
   * @param statusFilter - фильтр по статусу: 'active', 'blocked' и т.д. (опционально)
   */
  async getAllAdGroupsWithToken(token: string, adPlanId?: number, statusFilter?: string): Promise<any[]> {
    const client = this.createApiClient(token);
    const allGroups: any[] = [];
    const limit = 100;
    let offset = 0;

    const fields = [
      'id', 'name', 'status', 'package_id', 'ad_plan_id', 'objective',
      'autobidding_mode', 'budget_limit', 'budget_limit_day',
      'date_start', 'date_end', 'targetings', 'age_restrictions',
      'utm', 'max_price', 'enable_utm', 'priced_goal',
    ].join(',');

    while (true) {
      const params: Record<string, any> = { limit, offset, fields };
      if (adPlanId) {
        params._ad_plan_id = adPlanId;
      }
      if (statusFilter) {
        params._status = statusFilter;
      }

      const response = await client.get('ad_groups.json', { params });
      const groups = response.data.items || [];

      if (groups.length === 0) break;
      allGroups.push(...groups);
      offset += limit;

      if (offset >= 10000) break;
      await this.sleep(200);
    }

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
   * Получить ВСЕ активные баннеры (объявления) с пагинацией
   * Для автоотключения нужны баннеры, а не группы объявлений
   */
  async getAllActiveBanners(): Promise<Banner[]> {
    const allBanners: Banner[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      this.logger.log(`Получение баннеров (offset=${offset}, status=active)`);
      const params: Record<string, any> = {
        limit,
        offset,
        _status: 'active', // Только активные баннеры
        fields: 'id,ad_group_id,campaign_id,moderation_status,status,name',
      };

      const response = await this.callApi<VkAdsApiResponse<any>>('banners.json', params);
      const banners = response.items || [];

      if (banners.length === 0) break;
      allBanners.push(...banners);
      offset += limit;

      // Безопасность: максимум 10000 баннеров
      if (offset >= 10000) break;
    }

    this.logger.log(`Загружено ${allBanners.length} активных баннеров`);
    return allBanners;
  }

  /**
   * Обновить статус баннера (объявления)
   */
  async updateBannerStatus(bannerId: number, status: 'active' | 'blocked'): Promise<any> {
    this.logger.log(`Обновление статуса баннера ${bannerId} на ${status}`);
    return this.postApi(`banners/${bannerId}.json`, { status });
  }

  /**
   * Остановить баннер (объявление)
   */
  async stopBanner(bannerId: number): Promise<void> {
    await this.updateBannerStatus(bannerId, 'blocked');
  }

  /**
   * Получить все баннеры с textblocks (для массового редактирования)
   */
  async getAllBannersWithTextblocks(token: string, statusFilter?: string): Promise<any[]> {
    this.logger.log(`getAllBannersWithTextblocks: начало загрузки, statusFilter=${statusFilter}`);
    const client = this.createApiClient(token);
    const allBanners: any[] = [];
    const limit = 100;
    let offset = 0;

    while (true) {
      const params: Record<string, any> = {
        limit,
        offset,
        fields: 'id,name,ad_group_id,campaign_id,status,textblocks,moderation_status',
      };
      if (statusFilter) {
        params._status = statusFilter;
      }

      this.logger.log(`getAllBannersWithTextblocks: запрос offset=${offset}, params=${JSON.stringify(params)}`);

      try {
        const response = await client.get<any>('banners.json', { params });
        this.logger.log(`getAllBannersWithTextblocks: ответ получен, items=${response.data?.items?.length || 0}`);

        const banners = response.data?.items || [];

        if (banners.length === 0) {
          this.logger.log(`getAllBannersWithTextblocks: пустой ответ, завершаем`);
          break;
        }
        allBanners.push(...banners);
        offset += limit;

        if (offset >= 10000) break;
      } catch (error) {
        this.logger.error(`getAllBannersWithTextblocks: ошибка запроса: ${error.message}`);
        throw error;
      }
    }

    this.logger.log(`getAllBannersWithTextblocks: всего загружено ${allBanners.length} баннеров`);
    return allBanners;
  }

  /**
   * Получить детальную информацию о баннере (включая textblocks)
   * VK API возвращает textblocks только при запросе конкретного баннера
   */
  async getBannerDetails(token: string, bannerId: number): Promise<any> {
    const client = this.createApiClient(token);

    try {
      const response = await client.get(`banners/${bannerId}.json`, {
        params: {
          fields: 'id,name,status,textblocks,package_id,ad_group_id',
        },
      });

      this.logger.log(`getBannerDetails ${bannerId}: textblocks=${JSON.stringify(response.data?.textblocks || {})}`);
      return response.data;
    } catch (error) {
      this.logger.error(`getBannerDetails ${bannerId}: ошибка: ${error.message}`);
      throw error;
    }
  }

  /**
   * Обновить баннер (объявление) - название и/или textblocks
   * ВАЖНО: VK API требует структуру textblocks с текстовыми полями
   * Поддерживаемые ключи зависят от формата баннера (package)
   */
  async updateBanner(token: string, bannerId: number, data: {
    name?: string;
    textblocks?: Record<string, { text: string; title?: string }>;
  }): Promise<any> {
    this.logger.log(`updateBanner ${bannerId}: входные данные:`, JSON.stringify(data, null, 2));
    const client = this.createApiClient(token);

    try {
      const response = await client.post(`banners/${bannerId}.json`, data);

      // Проверяем на ошибку в теле ответа
      if (response.data?.error) {
        this.logger.error(`updateBanner ${bannerId}: VK API вернул ошибку:`, JSON.stringify(response.data.error, null, 2));
        throw new Error(response.data.error.description || response.data.error.message || JSON.stringify(response.data.error));
      }

      this.logger.log(`updateBanner ${bannerId}: успешно обновлён`);
      return response.data;
    } catch (error) {
      // Подробное логирование ошибки
      if (error.response?.data) {
        this.logger.error(`updateBanner ${bannerId}: HTTP ошибка:`, JSON.stringify(error.response.data, null, 2));
        // Извлекаем сообщение об ошибке из VK API
        const vkError = error.response.data.error;
        if (vkError) {
          const errorMsg = vkError.description || vkError.message || JSON.stringify(vkError);
          throw new Error(errorMsg);
        }
      } else {
        this.logger.error(`updateBanner ${bannerId}: ошибка:`, error.message);
      }
      throw error;
    }
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
   * Загрузить данные группы и баннеров для кэширования
   * Используется для массового копирования - загружаем один раз, копируем много раз
   */
  async loadAdGroupDataForCopy(adGroupId: number): Promise<{ group: any; banners: any[] }> {
    this.logger.log(`Загрузка данных группы ${adGroupId} для копирования...`);

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

    let originalGroup: any;
    try {
      originalGroup = await this.callApi<any>(
        `ad_groups/${adGroupId}.json`,
        { fields: groupFields },
      );
    } catch (error) {
      if (error.response?.status === 404 || error.message?.includes('404')) {
        throw new Error(`Группа ${adGroupId} не найдена (возможно удалена)`);
      }
      throw error;
    }

    if (!originalGroup || !originalGroup.id) {
      throw new Error(`Не удалось получить данные группы ${adGroupId}`);
    }

    const bannerFields = 'id,name,content,textblocks,urls,call_to_action,deeplink,status';
    const bannersResponse = await this.callApi<VkAdsApiResponse<any>>(
      'banners.json',
      { _ad_group_id: adGroupId, fields: bannerFields, limit: 100 },
    );
    const originalBanners = bannersResponse.items || [];

    this.logger.log(`✅ Загружены данные группы ${adGroupId}: ${originalBanners.length} баннеров`);
    return { group: originalGroup, banners: originalBanners };
  }

  /**
   * Создать копию группы объявлений С БАННЕРАМИ
   * Получает ВСЕ настройки исходной группы и баннеров, создаёт новую группу с полными копиями
   * @param adGroupId - ID исходной группы
   * @param copyNumber - номер копии для названия
   * @param customBudget - кастомный дневной бюджет (если не указан - копируется с оригинала)
   * @param cachedData - кэшированные данные группы и баннеров (для массового копирования)
   */
  async createAdGroupCopy(
    adGroupId: number,
    copyNumber: number = 1,
    customBudget?: number,
    cachedData?: { group: any; banners: any[] },
  ): Promise<any> {
    this.logger.log(`Создание копии группы объявлений ${adGroupId} (копия ${copyNumber})${customBudget ? ` с бюджетом ${customBudget}₽` : ''}`);

    let originalGroup: any;
    let originalBanners: any[];

    // Если есть кэшированные данные - используем их, иначе загружаем
    if (cachedData) {
      originalGroup = cachedData.group;
      originalBanners = cachedData.banners;
      this.logger.log(`Используем кэшированные данные (${originalBanners.length} баннеров)`);
    } else {
      // Загружаем данные (для единичного копирования)
      const data = await this.loadAdGroupDataForCopy(adGroupId);
      originalGroup = data.group;
      originalBanners = data.banners;
    }

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

    // ВАЖНО: Загружаем данные группы ОДИН раз перед циклом
    // Это предотвращает 404 ошибки от VK API при повторных запросах
    let cachedData: { group: any; banners: any[] } | undefined;
    try {
      cachedData = await this.loadAdGroupDataForCopy(adGroupId);
      this.logger.log(`Данные группы ${adGroupId} закэшированы: ${cachedData.banners.length} баннеров`);
    } catch (error) {
      this.logger.error(`Не удалось загрузить данные группы ${adGroupId}: ${error.message}`);
      return copiedIds; // Возвращаем пустой массив
    }

    for (let i = 0; i < count; i++) {
      const copyNumber = i + 1; // Последовательная нумерация: 1, 2, 3...
      try {
        const result = await this.createAdGroupCopy(adGroupId, copyNumber, customBudget, cachedData);
        if (result && result.id) {
          copiedIds.push(result.id);
          this.logger.log(`✅ Создана копия ${copyNumber}/${count}, ID: ${result.id}`);
        }
        // Задержка между копиями чтобы VK API успевал обработать запросы
        if (i < count - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      } catch (error) {
        this.logger.error(`Ошибка создания копии ${copyNumber}:`, error.message);
        // Увеличиваем задержку после ошибки
        await new Promise(resolve => setTimeout(resolve, 2000));
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
   * Обновить группу объявлений (универсальный метод)
   * Поддерживает: targetings, budget_limit_day, name и другие поля
   */
  async updateAdGroup(token: string, adGroupId: number, data: {
    name?: string;              // Название группы объявлений
    targetings?: {
      age?: { age_list: number[] };
      geo?: { regions: number[] };
      interests?: number[];
      interests_soc_dem?: number[];
      segments?: number[];      // ID сегментов ретаргетинга (аудитории)
      pads?: number[];          // Площадки
      fulltime?: Record<string, number[]>;
    };
    budget_limit_day?: string;  // Дневной бюджет в рублях (строка)
    budget_limit?: string;      // Общий бюджет
    max_price?: string;         // Максимальная цена
  }): Promise<any> {
    this.logger.log(`Обновление группы ${adGroupId}:`, JSON.stringify(data));
    const client = this.createApiClient(token);

    try {
      // VK API использует POST для обновления группы
      const response = await client.post(`ad_groups/${adGroupId}.json`, data);

      if (response.data.error) {
        throw new Error(response.data.error.description || JSON.stringify(response.data.error));
      }

      this.logger.log(`✅ Группа ${adGroupId} обновлена успешно`);
      return response.data;
    } catch (error) {
      this.logger.error(`Ошибка обновления группы ${adGroupId}:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получить список сегментов (аудиторий) напрямую из VK Ads API
   * Использует эндпоинт /api/v2/remarketing/segments.json
   */
  async getSegmentsFromAdGroups(token: string): Promise<any[]> {
    this.logger.log('Получение сегментов через VK Ads API /remarketing/segments.json');
    const client = this.createApiClient(token);

    try {
      const allSegments: any[] = [];
      const limit = 100;
      let offset = 0;

      while (true) {
        const response = await client.get('remarketing/segments.json', {
          params: { limit, offset },
        });

        const segments = response.data?.items || [];
        if (segments.length === 0) break;

        allSegments.push(...segments);
        offset += limit;

        // Безопасность: максимум 1000 сегментов
        if (offset >= 1000) break;
        await this.sleep(200);
      }

      const result = allSegments.map((s: any) => ({
        id: s.id,
        name: s.name || `Сегмент ${s.id}`,
        created: s.created,
        updated: s.updated,
      }));

      this.logger.log(`Загружено ${result.length} сегментов из VK Ads API`);
      return result;
    } catch (error) {
      this.logger.error('Ошибка получения сегментов:', error.message);
      return [];
    }
  }

  /**
   * Получить обычные интересы из VK Ads API (Авто, Финансы, и т.д.)
   * Использует эндпоинт /api/v2/targetings_tree.json?targetings=interests
   */
  async getInterests(token: string): Promise<any[]> {
    this.logger.log('Получение интересов через VK Ads API /targetings_tree.json?targetings=interests');
    const client = this.createApiClient(token);

    try {
      const response = await client.get('targetings_tree.json', {
        params: { targetings: 'interests' },
      });

      // API возвращает объект {"interests": [...]}
      const tree = response.data?.interests || [];
      const result: any[] = [];

      // Рекурсивно собираем все интересы из дерева
      const flattenTree = (items: any[], parentName?: string) => {
        for (const item of items) {
          const fullName = parentName ? `${parentName} > ${item.name}` : item.name;
          result.push({
            id: item.id,
            name: item.name,
            fullName,
          });
          if (item.children && item.children.length > 0) {
            flattenTree(item.children, item.name);
          }
        }
      };

      flattenTree(tree);
      this.logger.log(`Загружено ${result.length} интересов из VK Ads API`);
      return result;
    } catch (error) {
      this.logger.error('Ошибка получения интересов:', error.message);
      return [];
    }
  }

  /**
   * Получить соц-дем интересы из VK Ads API (доход, занятость, и т.д.)
   * Использует эндпоинт /api/v2/targetings_tree.json?targetings=interests_soc_dem
   */
  async getInterestsSocDem(token: string): Promise<any[]> {
    this.logger.log('Получение соц-дем интересов через VK Ads API /targetings_tree.json?targetings=interests_soc_dem');
    const client = this.createApiClient(token);

    try {
      const response = await client.get('targetings_tree.json', {
        params: { targetings: 'interests_soc_dem' },
      });

      // API возвращает объект {"interests_soc_dem": [...]}
      const tree = response.data?.interests_soc_dem || [];
      const result: any[] = [];

      // Рекурсивно собираем все интересы из дерева
      const flattenTree = (items: any[], parentName?: string) => {
        for (const item of items) {
          const fullName = parentName ? `${parentName} > ${item.name}` : item.name;
          result.push({
            id: item.id,
            name: item.name,
            fullName,
          });
          if (item.children && item.children.length > 0) {
            flattenTree(item.children, item.name);
          }
        }
      };

      flattenTree(tree);
      this.logger.log(`Загружено ${result.length} соц-дем интересов из VK Ads API`);
      return result;
    } catch (error) {
      this.logger.error('Ошибка получения соц-дем интересов:', error.message);
      return [];
    }
  }

  /**
   * Рассчитать CPL (Cost Per Lead / Goal)
   */
  calculateCPL(spent: number, goals: number): number {
    if (goals === 0) return Infinity;
    return spent / goals;
  }

  /**
   * Получить текущую дату по московскому времени (UTC+3)
   * VK Ads API работает по московскому времени
   */
  private getMoscowDate(): Date {
    const now = new Date();
    // Добавляем 3 часа к UTC для получения московского времени
    const moscowOffset = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
    return new Date(now.getTime() + moscowOffset);
  }

  /**
   * Получить вчерашнюю дату в формате YYYY-MM-DD (по московскому времени)
   */
  getYesterdayDate(): string {
    const moscow = this.getMoscowDate();
    moscow.setDate(moscow.getDate() - 1);
    return moscow.toISOString().split('T')[0];
  }

  /**
   * Получить сегодняшнюю дату в формате YYYY-MM-DD (по московскому времени)
   */
  getTodayDate(): string {
    return this.getMoscowDate().toISOString().split('T')[0];
  }

  // ============ AUTO UPLOAD METHODS ============

  /**
   * Получить аудитории ретаргетинга (сегменты)
   * VK Ads API v2 не предоставляет публичного эндпоинта для списка аудиторий,
   * поэтому используем сбор из существующих групп объявлений
   */
  async getRetargetingGroups(token: string): Promise<any[]> {
    return this.getSegmentsFromAdGroups(token);
  }

  /**
   * Получить сообщества доступные для рекламы
   */
  async getAdGroups_communities(token: string): Promise<any[]> {
    this.logger.log('Получение сообществ для рекламы');
    const client = this.createApiClient(token);

    try {
      // VK Ads API - получаем пакеты с сообществами
      const response = await client.get('packages.json', {
        params: { limit: 200 },
      });
      return response.data.items || [];
    } catch (error) {
      this.logger.error('Ошибка получения сообществ:', error.message);
      throw error;
    }
  }

  /**
   * Получить список доступных пакетов (package_id) для создания групп объявлений
   */
  async getPackages(token: string): Promise<any[]> {
    this.logger.log('Получение списка пакетов (package_id)');
    const client = this.createApiClient(token);

    try {
      const response = await client.get('packages.json', {
        params: { limit: 200 },
      });

      const packages = response.data.items || [];
      this.logger.log(`Найдено ${packages.length} пакетов:`);
      packages.forEach((pkg: any) => {
        this.logger.log(`  - ID: ${pkg.id}, Name: ${pkg.name}, Status: ${pkg.status}`);
      });

      return packages;
    } catch (error) {
      this.logger.error('Ошибка получения пакетов:', error.message);
      throw error;
    }
  }

  /**
   * Получить ID рекламного кабинета (agency_id или client_id)
   */
  async getAccountId(token: string): Promise<number> {
    this.logger.log('Получение ID рекламного кабинета');
    const client = this.createApiClient(token);

    try {
      // Получаем информацию о пользователе/кабинете
      const response = await client.get('user.json');

      // VK API возвращает agency_id для агентств или client_id для обычных аккаунтов
      const accountId = response.data.agency_id || response.data.id;
      this.logger.log(`Получен ID кабинета: ${accountId}`);
      return accountId;
    } catch (error) {
      this.logger.error('Ошибка получения ID кабинета:', error.message);
      throw error;
    }
  }

  /**
   * Получить package_id и objective из существующей группы объявлений в аккаунте
   * Если групп нет - вернёт null
   */
  async getExistingAdGroupSettings(token: string): Promise<{ packageId: number; objective: string } | null> {
    this.logger.log('Получаем package_id и objective из существующих групп объявлений...');
    const client = this.createApiClient(token);

    try {
      // Получаем первую группу объявлений с полями package_id и objective
      const response = await client.get('ad_groups.json', {
        params: { limit: 1, fields: 'id,package_id,name,objective' },
      });

      const groups = response.data.items || [];
      if (groups.length > 0 && groups[0].package_id) {
        this.logger.log(`✅ Найден package_id: ${groups[0].package_id}, objective: ${groups[0].objective} из группы "${groups[0].name}"`);
        return {
          packageId: groups[0].package_id,
          objective: groups[0].objective || 'socialactivity', // по умолчанию socialactivity
        };
      }

      this.logger.warn('Не найдено существующих групп объявлений');
      return null;
    } catch (error) {
      this.logger.error('Ошибка получения настроек группы:', error.message);
      return null;
    }
  }

  /**
   * Обновить настройки группы объявлений через PATCH
   * Используется для установки полей, которые не поддерживаются при POST создании
   * (schedule, pads_targeting)
   */
  async updateAdGroupSettings(token: string, adGroupId: number, settings: {
    schedule?: { schedule: string[] };
  }): Promise<void> {
    this.logger.log(`Обновление настроек группы ${adGroupId} через PATCH...`);
    const client = this.createApiClient(token);

    try {
      const patchData: Record<string, any> = {};

      // Добавляем расписание если указано
      if (settings.schedule) {
        patchData.schedule = settings.schedule;
      }

      if (Object.keys(patchData).length === 0) {
        this.logger.log('Нет настроек для обновления');
        return;
      }

      const response = await client.patch(`ad_groups/${adGroupId}.json`, patchData);

      if (response.data.error) {
        this.logger.error('Ошибка PATCH группы:', JSON.stringify(response.data.error));
        // Не бросаем ошибку - группа уже создана, просто логируем
      } else {
        this.logger.log(`✅ Настройки группы ${adGroupId} обновлены`);
      }
    } catch (error) {
      // Логируем но не бросаем исключение - основная группа уже создана
      this.logger.error('Ошибка PATCH обновления группы:', error.response?.data || error.message);
    }
  }

  /**
   * Создать кампанию с группой объявлений и баннером (ad_plan + ad_group + banner)
   * Согласно документации VK Ads API v2:
   * - ad_groups является ОБЯЗАТЕЛЬНЫМ полем (required)
   * - Нельзя создать кампанию без групп объявлений
   * - Баннеры создаются вместе с группой через поле "banners" (не отдельным POST!)
   *
   * POST /api/v2/ad_plans.json
   * {
   *   "name": "Моя кампания",
   *   "status": "active",
   *   "objective": "socialactivity",
   *   "ad_groups": [{
   *     ... группа ...
   *     "banners": [{ ... баннер ... }]
   *   }]
   * }
   */
  async createCampaignWithAdGroup(token: string, params: {
    name: string;
    dailyBudget?: number;
    totalBudget?: number;
    // Параметры группы объявлений
    adGroupName: string;
    adGroupBudget: number;
    targetGroupId?: number; // Опционально
    groupId: number;
    ageFrom?: number;
    ageTo?: number;
    // package_id и objective из креатива (для совместимости patterns!)
    packageId: number;
    objective: string;
    // Параметры баннера - полная структура из существующего баннера
    banner?: {
      title: string;
      text: string;
      content: Record<string, any>; // полный content из существующего баннера
      urls: Record<string, any>; // полный urls из существующего баннера
      contentKey: string; // ключ креатива (image_600x600, video_portrait_9_16_30s и т.д.)
    };
  }): Promise<{ campaignId: number; adGroupId: number; bannerId?: number }> {
    this.logger.log(`Создание кампании с группой: ${params.name}`);
    const client = this.createApiClient(token);

    try {
      // Используем package_id и objective из креатива (переданы из фронтенда)
      const packageId = params.packageId;
      const objective = params.objective;

      // Формируем данные баннера - копируем ТОЛЬКО нужный креатив по contentKey
      let bannerData: Record<string, any> | undefined;
      if (params.banner) {
        const contentKey = params.banner.contentKey;
        this.logger.log(`Копируем креатив: ${contentKey}`);

        // Копируем content - передаём ТОЛЬКО нужный ключ с id креатива
        const contentCopy: Record<string, any> = {};
        const creativeData = params.banner.content[contentKey];
        if (creativeData && typeof creativeData === 'object' && 'id' in creativeData) {
          // Передаём ТОЛЬКО id нужного креатива
          contentCopy[contentKey] = { id: creativeData.id };
        }

        // Копируем urls - передаём ТОЛЬКО id (url - read-only)
        const urlsCopy: Record<string, any> = {};
        for (const [key, value] of Object.entries(params.banner.urls || {})) {
          if (value && typeof value === 'object' && 'id' in value) {
            urlsCopy[key] = { id: value.id };
          }
        }

        bannerData = {
          content: contentCopy,
          urls: urlsCopy,
          textblocks: {
            description: { text: params.banner.text },
          },
          call_to_action: 'write',
        };

        // Добавляем title только если он не пустой
        if (params.banner.title && params.banner.title.trim()) {
          bannerData.textblocks.title = { text: params.banner.title };
        }
      }

      // Формируем группу объявлений
      const adGroupData: Record<string, any> = {
        name: params.adGroupName,
        // package_id - автоматически определённый из существующей группы
        package_id: packageId,
        // objective - цель кампании из существующей группы
        objective: objective,
        // Бюджет группы
        budget_limit_day: params.adGroupBudget,
        // Стратегия ставок - max_goals (максимум целевых действий)
        autobidding_mode: 'max_goals',
        // Таргетинг
        targetings: {
          age: {
            age_list: this.generateAgeList(params.ageFrom || 20, params.ageTo || 50),
          },
          geo: {
            regions: [1], // Россия
          },
          // Расписание показов - fulltime внутри targetings (8:00-23:00 все дни)
          fulltime: this.generateFulltime(8, 23),
        },
        // UTM метки
        enable_utm: true,
        utm: 'ref_source={{banner_id}}&ref=vkads',
        // Возрастная маркировка
        age_restrictions: '18+',
      };

      // Добавляем баннер в группу если он есть
      if (bannerData) {
        adGroupData.banners = [bannerData];
      }

      // Формируем кампанию с группой
      // БЮДЖЕТ ставится на ГРУППЕ ОБЪЯВЛЕНИЙ, не на кампании!
      // ВАЖНО: objective должен быть одинаковым на уровне кампании И группы объявлений!
      const requestData = {
        name: params.name,
        status: 'active',
        // objective КАМПАНИИ - должен совпадать с objective групп объявлений
        objective: objective,
        // ОБЯЗАТЕЛЬНО - массив групп объявлений
        ad_groups: [adGroupData],
      };

      this.logger.log(`Отправляем запрос на создание кампании: ${JSON.stringify(requestData, null, 2)}`);

      const response = await client.post('ad_plans.json', requestData);

      // Логируем полный ответ VK API
      this.logger.log(`VK API Response: ${JSON.stringify(response.data, null, 2)}`);

      if (response.data.error) {
        throw new Error(JSON.stringify(response.data.error));
      }

      // Парсим ответ
      const campaignId = response.data.id;
      let adGroupId = response.data.ad_groups?.[0]?.id;
      let bannerId = response.data.ad_groups?.[0]?.banners?.[0]?.id;

      if (!adGroupId && response.data.ad_group_ids?.length > 0) {
        adGroupId = response.data.ad_group_ids[0];
      }

      if (!campaignId) {
        this.logger.error('Неожиданный формат ответа:', JSON.stringify(response.data));
        throw new Error('Не удалось получить ID созданной кампании');
      }

      // Если adGroupId не вернулся - получаем его отдельным запросом
      if (!adGroupId) {
        this.logger.log(`adGroupId не вернулся, делаем запрос на получение групп кампании ${campaignId}...`);
        const groupsResponse = await client.get('ad_groups.json', {
          params: { _ad_plan_id: campaignId, limit: 1, fields: 'id,banners' },
        });
        if (groupsResponse.data.items?.length > 0) {
          adGroupId = groupsResponse.data.items[0].id;
          bannerId = groupsResponse.data.items[0].banners?.[0]?.id;
          this.logger.log(`✅ Получен adGroupId: ${adGroupId}, bannerId: ${bannerId}`);
        }
      }

      this.logger.log(`✅ Кампания создана: ID ${campaignId}, группа: ${adGroupId}, баннер: ${bannerId}`);
      return { campaignId, adGroupId, bannerId };
    } catch (error) {
      this.logger.error('Ошибка создания кампании:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Создать группу объявлений с баннером для автозалива
   * Баннер создаётся вместе с группой через поле "banners"
   */
  async createAdGroup(token: string, params: {
    campaignId: number;
    name: string;
    dailyBudget: number; // в рублях (700 = 700 руб)
    targetGroupId?: number; // Опционально
    groupId: number;
    ageFrom?: number;
    ageTo?: number;
    schedule?: string;
    placements?: string[];
    utmParams?: string;
    // package_id и objective из креатива (для совместимости patterns!)
    packageId: number;
    objective: string;
    // Баннер - полная структура из существующего баннера
    banner?: {
      title: string;
      text: string;
      content: Record<string, any>; // полный content из существующего баннера
      urls: Record<string, any>; // полный urls из существующего баннера
      contentKey: string; // ключ креатива (image_600x600, video_portrait_9_16_30s и т.д.)
    };
  }): Promise<{ id: number; bannerId?: number }> {
    this.logger.log(`Создание группы объявлений: ${params.name}`);
    const client = this.createApiClient(token);

    try {
      // Используем package_id и objective из креатива (переданы из фронтенда)
      const packageId = params.packageId;
      const objective = params.objective;

      // Формируем данные баннера - КОПИРУЕМ ТОЛЬКО нужный креатив по contentKey
      let bannerData: Record<string, any> | undefined;
      if (params.banner) {
        const contentKey = params.banner.contentKey;
        this.logger.log(`Копируем креатив: ${contentKey}`);

        // Копируем content - передаём ТОЛЬКО нужный ключ с id креатива
        const contentCopy: Record<string, any> = {};
        const creativeData = params.banner.content[contentKey];
        if (creativeData && typeof creativeData === 'object' && 'id' in creativeData) {
          // Передаём ТОЛЬКО id нужного креатива
          contentCopy[contentKey] = { id: creativeData.id };
        }

        // Копируем urls - передаём ТОЛЬКО id (url - read-only)
        const urlsCopy: Record<string, any> = {};
        for (const [key, value] of Object.entries(params.banner.urls || {})) {
          if (value && typeof value === 'object' && 'id' in value) {
            urlsCopy[key] = { id: value.id };
          }
        }

        bannerData = {
          content: contentCopy,
          urls: urlsCopy,
          textblocks: {
            description: { text: params.banner.text },
          },
          call_to_action: 'write',
        };

        if (params.banner.title && params.banner.title.trim()) {
          bannerData.textblocks.title = { text: params.banner.title };
        }
      }

      // Формируем данные группы объявлений
      const adGroupData: Record<string, any> = {
        name: params.name,
        ad_plan_id: params.campaignId,
        // package_id - автоматически определённый
        package_id: packageId,
        // objective - цель из существующей группы
        objective: objective,
        // Бюджет
        budget_limit_day: params.dailyBudget,
        // Стратегия - max_goals
        autobidding_mode: 'max_goals',
        // Таргетинг
        targetings: {
          age: {
            age_list: this.generateAgeList(params.ageFrom || 20, params.ageTo || 50),
          },
          geo: {
            regions: [1], // Россия
          },
          // Расписание показов - fulltime внутри targetings (8:00-23:00 все дни)
          fulltime: this.generateFulltime(8, 23),
        },
        // UTM метки
        enable_utm: true,
        utm: params.utmParams || 'ref_source={{banner_id}}&ref=vkads',
        // Возрастная маркировка 18+
        age_restrictions: '18+',
      };

      // Добавляем баннер если есть
      if (bannerData) {
        adGroupData.banners = [bannerData];
      }

      const response = await client.post('ad_groups.json', adGroupData);

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const adGroupId = response.data.id;
      const bannerId = response.data.banners?.[0]?.id;
      this.logger.log(`✅ Группа объявлений создана: ID ${adGroupId}, баннер: ${bannerId}`);

      return { id: adGroupId, bannerId };
    } catch (error) {
      this.logger.error('Ошибка создания группы объявлений:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Создать объявление (баннер)
   */
  async createAd(token: string, params: {
    adGroupId: number;
    title: string;
    text: string;
    imageUrl: string;
    groupId: number;
  }): Promise<{ id: number }> {
    this.logger.log(`Создание объявления для группы ${params.adGroupId}`);
    const client = this.createApiClient(token);

    try {
      // Сначала загружаем изображение если это URL
      let imageId: number;
      if (params.imageUrl.startsWith('http')) {
        imageId = await this.uploadImageFromUrl(token, params.imageUrl);
      } else {
        // Если это уже ID
        imageId = parseInt(params.imageUrl);
      }

      const bannerData: Record<string, any> = {
        ad_group_id: params.adGroupId,
        // Контент - изображение
        content: {
          image_240x400: { id: imageId },
        },
        // Тексты
        textblocks: {
          description: { text: params.text },
          title: { text: params.title },
        },
        // Ссылка на сообщество для сообщений
        urls: {
          primary: {
            url: `https://vk.com/im?sel=-${params.groupId}`,
          },
        },
        // CTA кнопка
        call_to_action: 'write',
      };

      const response = await client.post('banners.json', bannerData);

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      this.logger.log(`✅ Объявление создано: ID ${response.data.id}`);
      return { id: response.data.id };
    } catch (error) {
      this.logger.error('Ошибка создания объявления:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Загрузить изображение (по URL или base64)
   */
  async uploadImageFromUrl(token: string, imageData: string): Promise<number> {
    this.logger.log(`Загрузка изображения...`);

    try {
      // Если это base64 - загружаем как файл через multipart/form-data
      if (imageData.startsWith('data:')) {
        return this.uploadImageBase64(token, imageData);
      }

      // Если это URL - используем VK API загрузку по URL
      const client = this.createApiClient(token);
      const response = await client.post('static/image.json', {
        url: imageData,
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      this.logger.log(`✅ Изображение загружено по URL: ID ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      this.logger.error('Ошибка загрузки изображения:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Загрузить изображение из base64 через multipart/form-data
   */
  async uploadImageBase64(token: string, base64Data: string): Promise<number> {
    this.logger.log('Загрузка изображения из base64...');

    try {
      // Парсим base64
      const matches = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Неверный формат base64 изображения');
      }

      const imageType = matches[1]; // jpeg, png, etc.
      const base64Content = matches[2];
      const buffer = Buffer.from(base64Content, 'base64');

      // Создаём FormData
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', buffer, {
        filename: `image.${imageType}`,
        contentType: `image/${imageType}`,
      });

      // Отправляем на VK API
      const response = await axios.post(
        'https://ads.vk.com/api/v2/static.json',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders(),
          },
          timeout: 60000,
        },
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || JSON.stringify(response.data.error));
      }

      const imageId = response.data.id;
      this.logger.log(`✅ Изображение загружено из base64: ID ${imageId}`);
      return imageId;
    } catch (error) {
      this.logger.error('Ошибка загрузки base64 изображения:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Генерация списка возрастов для таргетинга
   */
  private generateAgeList(from: number, to: number): number[] {
    const ages: number[] = [];
    for (let i = from; i <= to; i++) {
      ages.push(i);
    }
    return ages;
  }

  /**
   * Генерация расписания показов в формате fulltime для targetings
   * VK API формат: объект с днями недели (mon, tue, wed, thu, fri, sat, sun)
   * Каждый день - массив часов (числа 0-23)
   * Например для 8:00-23:00: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
   */
  private generateFulltime(fromHour: number, toHour: number): {
    mon: number[];
    tue: number[];
    wed: number[];
    thu: number[];
    fri: number[];
    sat: number[];
    sun: number[];
    flags: string[];
  } {
    const hours: number[] = [];
    for (let h = fromHour; h <= toHour; h++) {
      hours.push(h);
    }
    // Одинаковое расписание для всех 7 дней недели
    return {
      mon: hours,
      tue: hours,
      wed: hours,
      thu: hours,
      fri: hours,
      sat: hours,
      sun: hours,
      flags: [], // Без дополнительных флагов
    };
  }

  /**
   * Получить уникальные креативы (изображения и видео) из существующих баннеров
   * Возвращает полную структуру content и urls для переиспользования
   * ВАЖНО: также возвращает package_id и objective из группы объявлений баннера
   */
  async getCreativesFromBanners(token: string, limit: number = 250): Promise<Array<{
    id: number;
    bannerId: number;
    url: string;
    width: number;
    height: number;
    type: string; // 'static' | 'video'
    contentKey: string; // ключ в content (image_240x400, video_portrait_9_16_30s и т.д.)
    content: Record<string, any>; // полная структура content для копирования
    urls: Record<string, any>; // полная структура urls для копирования
    packageId: number; // package_id из группы объявлений (для совместимости patterns)
    objective: string; // objective из группы объявлений
  }>> {
    this.logger.log(`Получение креативов из баннеров (limit: ${limit})...`);
    const client = this.createApiClient(token);

    try {
      // Получаем баннеры с полями content, urls и ad_group_id
      const response = await client.get('banners.json', {
        params: {
          limit: limit,
          fields: 'id,content,urls,ad_group_id',
        },
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const banners = response.data.items || [];
      const uniqueCreatives = new Map<number, any>();

      // Кэш для package_id групп объявлений
      const adGroupCache = new Map<number, { packageId: number; objective: string }>();

      // Ключи для статичных изображений
      const imageKeys = ['image_240x400', 'image_600x600', 'icon_256x256', 'image_1080x607'];
      // Ключи для видео
      const videoKeys = ['video_portrait_9_16_30s', 'video_portrait_9_16_180s', 'video_landscape_16_9_30s', 'video_landscape_16_9_180s'];

      // Собираем уникальные ad_group_id для запроса package_id
      const adGroupIds = new Set<number>();
      for (const banner of banners) {
        if (banner.ad_group_id) {
          adGroupIds.add(banner.ad_group_id);
        }
      }

      // Получаем package_id и objective для групп
      // VK API не поддерживает фильтр _id, поэтому получаем все группы и фильтруем
      if (adGroupIds.size > 0) {
        const adGroupIdsArray = Array.from(adGroupIds);

        // Получаем группы объявлений (без фильтра по id - он не поддерживается)
        // VK API максимум 250 записей за запрос
        const groupsResponse = await client.get('ad_groups.json', {
          params: {
            limit: 250, // Максимум для VK API
            fields: 'id,package_id,objective',
          },
        });

        const groups = groupsResponse.data.items || [];
        for (const group of groups) {
          // Сохраняем только те группы, которые нам нужны
          if (adGroupIdsArray.includes(group.id) && group.package_id) {
            adGroupCache.set(group.id, {
              packageId: group.package_id,
              objective: group.objective || 'socialactivity',
            });
          }
        }
        this.logger.log(`✅ Загружены настройки для ${adGroupCache.size} групп объявлений из ${adGroupIdsArray.length} запрошенных`);
      }

      // Извлекаем уникальные креативы из content
      for (const banner of banners) {
        if (!banner.content) continue;

        // Получаем package_id группы для этого баннера
        const adGroupSettings = banner.ad_group_id ? adGroupCache.get(banner.ad_group_id) : null;
        if (!adGroupSettings) {
          this.logger.warn(`Нет настроек группы для баннера ${banner.id}, пропускаем`);
          continue;
        }

        // Обрабатываем статичные изображения
        for (const key of imageKeys) {
          const image = banner.content[key];
          if (image && image.id && image.type === 'static' && !uniqueCreatives.has(image.id)) {
            const variants = image.variants || {};
            const originalUrl = variants.original?.url || variants.uploaded?.url || '';

            if (originalUrl) {
              uniqueCreatives.set(image.id, {
                id: image.id,
                bannerId: banner.id,
                url: originalUrl,
                width: variants.original?.width || 240,
                height: variants.original?.height || 400,
                type: 'static',
                contentKey: key,
                content: banner.content, // сохраняем весь content
                urls: banner.urls || {}, // сохраняем urls
                packageId: adGroupSettings.packageId, // package_id группы
                objective: adGroupSettings.objective, // objective группы
              });
            }
          }
        }

        // Обрабатываем видео
        for (const key of videoKeys) {
          const video = banner.content[key];
          if (video && video.id && video.type === 'video' && !uniqueCreatives.has(video.id)) {
            const variants = video.variants || {};
            // Для видео берём превью (first_frame) или low качество
            const previewUrl = variants['high-first_frame']?.url || variants['medium-first_frame']?.url || variants['low']?.url || '';

            if (previewUrl) {
              uniqueCreatives.set(video.id, {
                id: video.id,
                bannerId: banner.id,
                url: previewUrl,
                width: variants.high?.width || variants.medium?.width || 1080,
                height: variants.high?.height || variants.medium?.height || 1920,
                type: 'video',
                contentKey: key,
                content: banner.content, // сохраняем весь content
                urls: banner.urls || {}, // сохраняем urls
                packageId: adGroupSettings.packageId, // package_id группы
                objective: adGroupSettings.objective, // objective группы
              });
            }
          }
        }
      }

      const creatives = Array.from(uniqueCreatives.values());
      this.logger.log(`✅ Найдено ${creatives.length} уникальных креативов (статика + видео)`);
      return creatives;
    } catch (error) {
      this.logger.error('Ошибка получения креативов:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получить список кампаний с детальной информацией (группы объявлений, баннеры)
   */
  async getCampaignsWithDetails(token: string): Promise<Array<{
    id: number;
    name: string;
    status: string;
    objective?: string;
    adGroupsCount: number;
    bannersCount: number;
  }>> {
    this.logger.log('Получение списка кампаний с деталями...');
    const client = this.createApiClient(token);

    try {
      // Получаем только АКТИВНЫЕ кампании
      const campaignsResponse = await client.get('ad_plans.json', {
        params: {
          limit: 100,
          fields: 'id,name,status,objective',
          _status: 'active', // Фильтр по статусу: только активные
        },
      });

      if (campaignsResponse.data.error) {
        throw new Error(campaignsResponse.data.error.message);
      }

      const campaigns = campaignsResponse.data.items || [];
      this.logger.log(`Загружено ${campaigns.length} активных кампаний`);

      // Для каждой кампании загружаем группы с фильтром по campaign id
      const result: Array<{
        id: number;
        name: string;
        status: string;
        objective?: string;
        adGroupsCount: number;
        bannersCount: number;
      }> = [];

      for (const campaign of campaigns) {
        try {
          // Загружаем группы именно для этой кампании
          const groupsResponse = await client.get('ad_groups.json', {
            params: {
              limit: 250,
              fields: 'id,banners',
              _ad_plan_id: campaign.id, // Фильтр по кампании
            },
          });

          const groups = groupsResponse.data.items || [];
          const bannersCount = groups.reduce((sum: number, g: any) => {
            return sum + (g.banners?.length || 0);
          }, 0);

          result.push({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            adGroupsCount: groups.length,
            bannersCount,
          });
        } catch (err) {
          // Если не удалось загрузить группы, добавляем кампанию с нулями
          this.logger.warn(`Не удалось загрузить группы для кампании ${campaign.id}: ${err.message}`);
          result.push({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            adGroupsCount: 0,
            bannersCount: 0,
          });
        }
      }

      this.logger.log(`✅ Загружено ${result.length} кампаний с деталями`);
      return result;
    } catch (error) {
      this.logger.error('Ошибка получения кампаний:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Дублировать кампанию (ручное копирование)
   * VK Ads API не поддерживает прямое копирование кампаний, поэтому:
   * 1. Получаем данные исходной кампании
   * 2. Создаём новую кампанию
   * 3. Получаем все группы объявлений исходной кампании
   * 4. Копируем каждую группу в новую кампанию
   */
  async duplicateCampaign(token: string, campaignId: number, newName?: string): Promise<number> {
    this.logger.log(`Дублирование кампании ${campaignId}...`);
    const client = this.createApiClient(token);

    try {
      // 1. Получаем данные исходной кампании
      const campaignResponse = await client.get(`ad_plans/${campaignId}.json`, {
        params: {
          fields: 'id,name,status,objective,budget_limit,budget_limit_day,date_start,date_end',
        },
      });

      const originalCampaign = campaignResponse.data;
      if (!originalCampaign || !originalCampaign.id) {
        throw new Error(`Кампания ${campaignId} не найдена`);
      }

      this.logger.log(`Исходная кампания: "${originalCampaign.name}"`);

      // 2. Получаем все группы объявлений исходной кампании с полными данными
      const groupFields = [
        'id', 'name', 'status', 'package_id', 'ad_plan_id', 'objective',
        'autobidding_mode', 'budget_limit', 'budget_limit_day',
        'date_start', 'date_end', 'targetings', 'age_restrictions',
        'utm', 'max_price', 'enable_utm', 'priced_goal',
        'enable_offline_goals', 'enable_look_alike', 'enable_recombination',
        'language', 'banner_uniq_shows_limit', 'uniq_shows_limit',
        'uniq_shows_period', 'shows_limit', 'event_limit',
        'enable_clickid', 'mixing',
      ].join(',');

      const groupsResponse = await client.get('ad_groups.json', {
        params: {
          _ad_plan_id: campaignId,
          limit: 100,
          fields: groupFields,
        },
      });

      const originalGroups = groupsResponse.data.items || [];
      this.logger.log(`Найдено ${originalGroups.length} групп объявлений в кампании`);

      // 3. Формируем данные новой кампании с группами объявлений
      const campaignName = newName || `${originalCampaign.name} (копия)`;

      // Для каждой группы получаем баннеры и формируем данные для копирования
      const adGroupsWithBanners = [];

      for (const group of originalGroups) {
        // Получаем баннеры группы
        const bannerFields = 'id,name,content,textblocks,urls,call_to_action,deeplink';
        const bannersResponse = await client.get('banners.json', {
          params: {
            _ad_group_id: group.id,
            fields: bannerFields,
            limit: 100,
          },
        });
        const originalBanners = bannersResponse.data.items || [];

        // Формируем данные группы для копирования
        const newGroupData: Record<string, any> = {
          name: group.name,
          package_id: group.package_id,
        };

        // Копируем все важные поля группы
        const fieldsToCopy = [
          'status', 'objective', 'autobidding_mode', 'budget_limit_day', 'budget_limit',
          'date_start', 'date_end', 'age_restrictions', 'enable_utm', 'utm', 'targetings', 'max_price',
          'priced_goal', 'enable_offline_goals', 'enable_look_alike', 'enable_recombination',
          'language', 'banner_uniq_shows_limit',
          'uniq_shows_limit', 'uniq_shows_period', 'shows_limit', 'event_limit',
          'enable_clickid', 'mixing',
        ];

        for (const field of fieldsToCopy) {
          if (group[field] !== undefined && group[field] !== null) {
            if (field === 'max_price' && group[field] === '0.00') continue;
            newGroupData[field] = group[field];
          }
        }

        // Формируем баннеры для копирования
        if (originalBanners.length > 0) {
          newGroupData.banners = originalBanners.map((banner: any) => {
            const newBanner: Record<string, any> = {};

            if (banner.name) {
              newBanner.name = banner.name;
            }

            if (banner.content) {
              newBanner.content = {};
              for (const [key, value] of Object.entries(banner.content)) {
                if (value && typeof value === 'object' && (value as any).id) {
                  newBanner.content[key] = { id: (value as any).id };
                }
              }
            }

            if (banner.textblocks) {
              newBanner.textblocks = {};
              for (const [key, value] of Object.entries(banner.textblocks)) {
                if (value && typeof value === 'object') {
                  const textBlock: Record<string, string> = {};
                  if ((value as any).text !== undefined) textBlock.text = (value as any).text;
                  if ((value as any).title !== undefined) textBlock.title = (value as any).title;
                  if (Object.keys(textBlock).length > 0) {
                    newBanner.textblocks[key] = textBlock;
                  }
                }
              }
            }

            if (banner.urls) {
              newBanner.urls = {};
              for (const [key, value] of Object.entries(banner.urls)) {
                if (value && typeof value === 'object' && (value as any).id) {
                  newBanner.urls[key] = { id: (value as any).id };
                }
              }
            }

            if (banner.call_to_action) newBanner.call_to_action = banner.call_to_action;
            if (banner.deeplink) newBanner.deeplink = banner.deeplink;

            return newBanner;
          });
        }

        adGroupsWithBanners.push(newGroupData);
      }

      // 4. Создаём новую кампанию с группами и баннерами
      const newCampaignData: Record<string, any> = {
        name: campaignName,
        status: originalCampaign.status || 'active', // Копируем статус исходной кампании
      };

      // Копируем настройки кампании
      if (originalCampaign.objective) newCampaignData.objective = originalCampaign.objective;
      if (originalCampaign.budget_limit) newCampaignData.budget_limit = originalCampaign.budget_limit;
      if (originalCampaign.budget_limit_day) newCampaignData.budget_limit_day = originalCampaign.budget_limit_day;
      if (originalCampaign.date_start) newCampaignData.date_start = originalCampaign.date_start;
      if (originalCampaign.date_end) newCampaignData.date_end = originalCampaign.date_end;

      // Добавляем группы объявлений
      if (adGroupsWithBanners.length > 0) {
        newCampaignData.ad_groups = adGroupsWithBanners;
      }

      this.logger.log(`Создаём кампанию "${campaignName}" с ${adGroupsWithBanners.length} группами...`);

      const createResponse = await client.post('ad_plans.json', newCampaignData);

      if (createResponse.data.error) {
        throw new Error(createResponse.data.error.message || JSON.stringify(createResponse.data.error));
      }

      const newCampaignId = createResponse.data.id;
      this.logger.log(`✅ Кампания дублирована: ${campaignId} -> ${newCampaignId}`);

      return newCampaignId;
    } catch (error) {
      this.logger.error('Ошибка дублирования кампании:', error.response?.data || error.message);
      throw error;
    }
  }
}
