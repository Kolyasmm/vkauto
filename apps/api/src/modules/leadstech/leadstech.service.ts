import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface AuthTokens {
  jsonAccessWebToken: string;
  jsonRefreshWebToken: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: Record<string, string[]>;
}

export interface OfferStats {
  offerId: number;
  offerTitle: string;
  clicks: number;
  uniques: number;
  hosts: number;
  conversions: number;
  approved: number;
  hold: number;
  rejected: number;
  inprogress: number;
  sumwebmaster: number; // Доход вебмастера
  CR: number;
  AR: number;
  EPL: number;
  EPC: number;
  EPCHosts: number;
}

export interface SubIdStats {
  sub1?: string;
  sub2?: string;
  sub3?: string;
  sub4?: string;
  sub5?: string;
  sub6?: string;
  sub7?: string;
  sub8?: string;
  sub9?: string;
  sub10?: string;
  clicks: number;
  uniques: number;
  hosts: number;
  conversions: number;
  approved: number;
  hold: number;
  rejected: number;
  inprogress: number;
  sumwebmaster: number;
  CR: number;
  AR: number;
  EPL: number;
  EPC: number;
  EPCHosts: number;
}

interface StatsResponse<T> {
  allItemsCount: string | number;
  items: T[];
  summary?: Omit<OfferStats, 'offerId' | 'offerTitle'>;
}

@Injectable()
export class LeadsTechService {
  private readonly logger = new Logger(LeadsTechService.name);
  private readonly apiUrl: string;
  private readonly login: string;
  private readonly password: string;
  private tokens: AuthTokens | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('LEADSTECH_API_URL') || 'https://api.leads.tech';
    this.login = this.configService.get<string>('LEADSTECH_LOGIN') || '';
    this.password = this.configService.get<string>('LEADSTECH_PASSWORD') || '';
  }

  /**
   * Авторизация в LeadsTech API
   */
  async authenticate(): Promise<AuthTokens> {
    try {
      this.logger.log('Авторизация в LeadsTech API...');

      const response = await axios.post<ApiResponse<AuthTokens>>(
        `${this.apiUrl}/v1/front/authorization/login`,
        {
          login: this.login,
          password: this.password,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data.success) {
        throw new Error('Ошибка авторизации LeadsTech');
      }

      this.tokens = response.data.data;
      // Токен живёт ~30 дней, но обновляем каждые 24 часа
      this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      this.logger.log('✅ Успешная авторизация в LeadsTech');
      return this.tokens;
    } catch (error) {
      this.logger.error('Ошибка авторизации LeadsTech:', error.message);
      throw error;
    }
  }

  /**
   * Обновление токена
   */
  async refreshToken(): Promise<AuthTokens> {
    if (!this.tokens) {
      return this.authenticate();
    }

    try {
      const response = await axios.post<ApiResponse<AuthTokens>>(
        `${this.apiUrl}/v1/front/authorization/refresh`,
        null,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          params: {
            jsonAccessWebToken: this.tokens.jsonAccessWebToken,
            jsonRefreshWebToken: this.tokens.jsonRefreshWebToken,
          },
        }
      );

      if (!response.data.success) {
        return this.authenticate();
      }

      this.tokens = response.data.data;
      this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

      this.logger.log('✅ Токен LeadsTech обновлён');
      return this.tokens;
    } catch (error) {
      this.logger.warn('Не удалось обновить токен, повторная авторизация...');
      return this.authenticate();
    }
  }

  /**
   * Получить валидный токен
   */
  async getValidToken(): Promise<string> {
    if (!this.tokens || !this.tokenExpiry || new Date() > this.tokenExpiry) {
      if (this.tokens) {
        await this.refreshToken();
      } else {
        await this.authenticate();
      }
    }

    if (!this.tokens) {
      throw new Error('Не удалось получить токен LeadsTech');
    }

    return this.tokens.jsonAccessWebToken;
  }

  /**
   * Создать авторизованный API клиент
   */
  private async createClient(): Promise<AxiosInstance> {
    const token = await this.getValidToken();

    const client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': token,
      },
      timeout: 30000,
    });

    return client;
  }

  /**
   * Получить текущую дату по московскому времени (UTC+3)
   */
  private getMoscowDate(): Date {
    const now = new Date();
    // Создаём дату в московском времени
    const moscowOffset = 3 * 60; // UTC+3 в минутах
    const localOffset = now.getTimezoneOffset(); // отрицательное для UTC+
    return new Date(now.getTime() + (moscowOffset + localOffset) * 60 * 1000);
  }

  /**
   * Форматировать дату в формат YYYYMMDD (по московскому времени)
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Получить диапазон дат (последние N дней до ВЧЕРА) по московскому времени
   * Вчера используется потому что данные в LeadsTech появляются с задержкой
   */
  getDateRange(days: number): { dateStart: string; dateEnd: string } {
    const today = this.getMoscowDate();
    // endDate = вчера (сегодня - 1 день)
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 1);

    // startDate = endDate - (days - 1)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));

    return {
      dateStart: this.formatDate(startDate),
      dateEnd: this.formatDate(endDate),
    };
  }

  /**
   * Получить статистику по sub5 (ID баннеров из VK)
   * @param sub5Values - массив ID баннеров для поиска
   * @param days - количество дней (по умолчанию 7)
   */
  async getStatsBySub5(sub5Values: string[], days: number = 7): Promise<Map<string, SubIdStats>> {
    this.logger.log(`Получение статистики LeadsTech по ${sub5Values.length} sub5 за ${days} дней...`);

    const client = await this.createClient();
    const { dateStart, dateEnd } = this.getDateRange(days);
    const statsMap = new Map<string, SubIdStats>();

    try {
      // Запрашиваем статистику по subid с указанием subs[]=sub5
      const response = await client.get<ApiResponse<StatsResponse<SubIdStats>>>(
        '/v1/front/stat/by-subid',
        {
          params: {
            dateStart,
            dateEnd,
            page: 1,
            pageSize: 500,
            'subs[]': 'sub5', // Группировка по sub5
          },
        }
      );

      if (!response.data.success) {
        throw new Error('Ошибка получения статистики LeadsTech');
      }

      const items = response.data.data.items || [];
      this.logger.log(`Получено ${items.length} записей из LeadsTech`);

      // Фильтруем только нужные sub5 (ID баннеров)
      for (const item of items) {
        if (item.sub5 && sub5Values.includes(item.sub5)) {
          statsMap.set(item.sub5, item);
        }
      }

      this.logger.log(`Найдено ${statsMap.size} совпадений по sub5`);
      return statsMap;
    } catch (error) {
      this.logger.error('Ошибка получения статистики LeadsTech:', error.message);
      throw error;
    }
  }

  /**
   * Получить всю статистику по sub5 за период
   * Возвращает Map где ключ - значение sub5, значение - статистика
   */
  async getAllStatsBySub5(days: number = 7): Promise<Map<string, SubIdStats>> {
    this.logger.log(`Получение всей статистики LeadsTech по sub5 за ${days} дней...`);

    const client = await this.createClient();
    const { dateStart, dateEnd } = this.getDateRange(days);
    const statsMap = new Map<string, SubIdStats>();

    let page = 1;
    const pageSize = 500;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await client.get<ApiResponse<StatsResponse<SubIdStats>>>(
          '/v1/front/stat/by-subid',
          {
            params: {
              dateStart,
              dateEnd,
              page,
              pageSize,
              'subs[]': 'sub5',
            },
          }
        );

        if (!response.data.success) {
          throw new Error('Ошибка получения статистики LeadsTech');
        }

        const items = response.data.data.items || [];

        this.logger.log(`LeadsTech страница ${page}: получено ${items.length} записей`);

        // Логируем первые 5 записей для отладки
        if (page === 1 && items.length > 0) {
          this.logger.log(`Примеры записей LeadsTech: ${JSON.stringify(items.slice(0, 5), null, 2)}`);
        }

        for (const item of items) {
          if (item.sub5) {
            // Если уже есть запись - суммируем (на случай дублей)
            const existing = statsMap.get(item.sub5);
            if (existing) {
              existing.sumwebmaster += item.sumwebmaster;
              existing.clicks += item.clicks;
              existing.conversions += item.conversions;
              existing.approved += item.approved;
            } else {
              statsMap.set(item.sub5, item);
            }
          }
        }

        hasMore = items.length === pageSize;
        page++;

        // Защита от бесконечного цикла
        if (page > 20) break;
      }

      this.logger.log(`✅ Загружено ${statsMap.size} записей статистики по sub5`);
      return statsMap;
    } catch (error) {
      this.logger.error('Ошибка получения статистики LeadsTech:', error.message);
      throw error;
    }
  }

  /**
   * Получить статистику для конкретных ID баннеров через фильтр sub5
   * @param bannerIds - массив ID баннеров
   * @param days - количество дней
   */
  async getStatsForBanners(bannerIds: string[], days: number = 7): Promise<Map<string, SubIdStats>> {
    this.logger.log(`Получение статистики LeadsTech для ${bannerIds.length} баннеров за ${days} дней...`);

    const client = await this.createClient();
    const { dateStart, dateEnd } = this.getDateRange(days);
    const statsMap = new Map<string, SubIdStats>();

    // Запрашиваем статистику параллельно пакетами по 10
    const batchSize = 10;
    const batches: string[][] = [];
    for (let i = 0; i < bannerIds.length; i += batchSize) {
      batches.push(bannerIds.slice(i, i + batchSize));
    }

    try {
      for (const batch of batches) {
        const promises = batch.map(async (bannerId) => {
          try {
            const response = await client.get<ApiResponse<StatsResponse<SubIdStats>>>(
              '/v1/front/stat/by-subid',
              {
                params: {
                  dateStart,
                  dateEnd,
                  page: 1,
                  pageSize: 100,
                  'subs[]': 'sub5',
                  sub5: bannerId, // Фильтр по конкретному значению sub5
                },
              }
            );

            if (response.data.success && response.data.data.items?.length > 0) {
              const item = response.data.data.items[0];
              statsMap.set(bannerId, item);
              if (item.sumwebmaster > 0) {
                this.logger.log(`✅ Баннер ${bannerId}: доход ${item.sumwebmaster}₽`);
              }
            }
          } catch (err) {
            this.logger.warn(`Ошибка получения данных для баннера ${bannerId}`);
          }
        });

        await Promise.all(promises);
      }

      this.logger.log(`✅ Найдено ${statsMap.size} баннеров с данными в LeadsTech`);
      return statsMap;
    } catch (error) {
      this.logger.error('Ошибка получения статистики через фильтр:', error.message);
      throw error;
    }
  }

  /**
   * Получить статистику по офферам
   */
  async getStatsByOffer(days: number = 7): Promise<OfferStats[]> {
    this.logger.log(`Получение статистики по офферам за ${days} дней...`);

    const client = await this.createClient();
    const { dateStart, dateEnd } = this.getDateRange(days);

    try {
      const response = await client.get<ApiResponse<StatsResponse<OfferStats>>>(
        '/v1/front/stat/by-offer',
        {
          params: {
            dateStart,
            dateEnd,
            page: 1,
            pageSize: 500,
          },
        }
      );

      if (!response.data.success) {
        throw new Error('Ошибка получения статистики по офферам');
      }

      const items = response.data.data.items || [];
      this.logger.log(`✅ Получено ${items.length} офферов`);
      return items;
    } catch (error) {
      this.logger.error('Ошибка получения статистики по офферам:', error.message);
      throw error;
    }
  }

  /**
   * Проверить доступность API
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getValidToken();
      return true;
    } catch {
      return false;
    }
  }
}
