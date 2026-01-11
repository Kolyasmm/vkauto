import { Injectable, Logger } from '@nestjs/common';
import { VkService } from '../vk/vk.service';
import { VkAccountsService } from '../vk-accounts/vk-accounts.service';
import { LeadsTechService, SubIdStats } from '../leadstech/leadstech.service';

export interface BannerProfitability {
  bannerId: number;
  bannerName?: string;
  adGroupId: number;
  campaignId: number;
  status: string;
  // VK Ads данные
  spent: number; // Расход в рублях
  clicks: number;
  shows: number;
  goals: number;
  // LeadsTech данные
  income: number; // Доход (sumwebmaster)
  conversions: number;
  approved: number;
  cr: number; // Conversion Rate %
  ar: number; // Approval Rate %
  // Расчётные метрики
  profit: number; // income - spent
  roi: number; // (income / spent) * 100
  isProfitable: boolean;
}

export interface ProfitabilityResult {
  profitable: BannerProfitability[];
  unprofitable: BannerProfitability[];
  noData: BannerProfitability[]; // Баннеры без данных в LeadsTech
  summary: {
    totalBanners: number;
    profitableBanners: number;
    unprofitableBanners: number;
    noDataBanners: number;
    totalSpent: number;
    totalIncome: number;
    totalProfit: number;
    overallROI: number;
  };
  period: {
    days: number;
    dateStart: string;
    dateEnd: string;
  };
}

@Injectable()
export class ProfitabilityService {
  private readonly logger = new Logger(ProfitabilityService.name);

  constructor(
    private vkService: VkService,
    private vkAccountsService: VkAccountsService,
    private leadsTechService: LeadsTechService,
  ) {}

  /**
   * Получить прибыльность баннеров
   * @param userId - ID пользователя
   * @param vkAccountId - ID VK аккаунта
   * @param days - количество дней для анализа (по умолчанию 7)
   */
  async getProfitability(
    userId: number,
    vkAccountId: number,
    days: number = 7,
  ): Promise<ProfitabilityResult> {
    this.logger.log(`Анализ прибыльности для пользователя ${userId}, аккаунт ${vkAccountId}, период ${days} дней`);

    // 1. Получаем VK аккаунт с токеном
    const vkAccount = await this.vkAccountsService.findOneWithToken(vkAccountId);
    if (!vkAccount) {
      throw new Error('VK аккаунт не найден');
    }

    this.vkService.setAccessToken(vkAccount.accessToken);

    try {
      // 2. Получаем все активные баннеры
      this.logger.log('Загрузка активных баннеров из VK Ads...');
      const activeBanners = await this.vkService.getAllActiveBanners();
      this.logger.log(`Найдено ${activeBanners.length} активных баннеров`);

      if (activeBanners.length === 0) {
        return this.emptyResult(days);
      }

      // 3. Получаем статистику расходов по баннерам из VK Ads
      const bannerIds = activeBanners.map(b => b.id);
      const { dateFrom, dateTo } = this.getVkDateRange(days);

      this.logger.log(`Загрузка статистики VK Ads за ${dateFrom} - ${dateTo}...`);
      const vkStats = await this.vkService.getStatistics(dateFrom, dateTo, bannerIds, 'banner');
      this.logger.log(`Получена статистика для ${vkStats.length} баннеров`);

      // Создаём Map для быстрого доступа к статистике VK
      const vkStatsMap = new Map<number, { spent: number; clicks: number; shows: number; goals: number }>();
      for (const stat of vkStats) {
        const spent = parseFloat(stat.total?.base?.spent || '0');
        vkStatsMap.set(stat.id, {
          spent,
          clicks: stat.total?.base?.clicks || 0,
          shows: stat.total?.base?.shows || 0,
          goals: stat.total?.base?.goals || 0,
        });
      }

      // 4. Получаем статистику доходов из LeadsTech по sub5 для конкретных ID баннеров
      this.logger.log('Загрузка статистики LeadsTech по sub5 для каждого ID баннера...');
      const bannerIdStrings = bannerIds.map(id => String(id));
      const leadsTechStats = await this.leadsTechService.getStatsForBanners(bannerIdStrings, days);
      this.logger.log(`Получено ${leadsTechStats.size} записей из LeadsTech`);

      // 5. Сопоставляем данные и рассчитываем прибыльность
      const profitable: BannerProfitability[] = [];
      const unprofitable: BannerProfitability[] = [];
      const noData: BannerProfitability[] = [];

      let totalSpent = 0;
      let totalIncome = 0;

      for (const banner of activeBanners) {
        const vkStat = vkStatsMap.get(banner.id);
        const spent = vkStat?.spent || 0;

        // Ищем по sub5 = bannerId (строка)
        const ltStat = leadsTechStats.get(String(banner.id));
        const income = ltStat?.sumwebmaster || 0;

        const profit = income - spent;
        const roi = spent > 0 ? ((income / spent) * 100) : (income > 0 ? 100 : 0);

        const bannerData: BannerProfitability = {
          bannerId: banner.id,
          bannerName: (banner as any).name,
          adGroupId: banner.ad_group_id,
          campaignId: banner.campaign_id,
          status: (banner as any).status || banner.moderation_status,
          spent,
          clicks: vkStat?.clicks || 0,
          shows: vkStat?.shows || 0,
          goals: vkStat?.goals || 0,
          income,
          conversions: ltStat?.conversions || 0,
          approved: ltStat?.approved || 0,
          cr: ltStat?.CR || 0,
          ar: ltStat?.AR || 0,
          profit,
          roi,
          isProfitable: profit > 0,
        };

        totalSpent += spent;
        totalIncome += income;

        // Распределяем по категориям
        if (!ltStat) {
          // Нет данных в LeadsTech по sub5 - ID баннера не прокидывается
          noData.push(bannerData);
        } else if (profit > 0) {
          // Есть данные и прибыль положительная
          profitable.push(bannerData);
        } else {
          // Есть данные, но убыточное (доход <= расход)
          unprofitable.push(bannerData);
        }
      }

      // Сортируем по прибыли
      profitable.sort((a, b) => b.profit - a.profit);
      unprofitable.sort((a, b) => b.profit - a.profit);

      const totalProfit = totalIncome - totalSpent;
      const overallROI = totalSpent > 0 ? ((totalIncome / totalSpent) * 100) : 0;

      const { dateStart, dateEnd } = this.leadsTechService.getDateRange(days);

      return {
        profitable,
        unprofitable,
        noData,
        summary: {
          totalBanners: activeBanners.length,
          profitableBanners: profitable.length,
          unprofitableBanners: unprofitable.length,
          noDataBanners: noData.length,
          totalSpent: Math.round(totalSpent * 100) / 100,
          totalIncome: Math.round(totalIncome * 100) / 100,
          totalProfit: Math.round(totalProfit * 100) / 100,
          overallROI: Math.round(overallROI * 100) / 100,
        },
        period: {
          days,
          dateStart,
          dateEnd,
        },
      };
    } finally {
      this.vkService.resetAccessToken();
    }
  }

  /**
   * Получить только прибыльные баннеры
   */
  async getProfitableBanners(
    userId: number,
    vkAccountId: number,
    days: number = 7,
  ): Promise<BannerProfitability[]> {
    const result = await this.getProfitability(userId, vkAccountId, days);
    return result.profitable;
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
   * Форматировать дату в YYYY-MM-DD
   */
  private formatDateYMD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Получить даты для VK API (формат YYYY-MM-DD) по московскому времени
   * Используем до ВЧЕРА, т.к. данные LeadsTech появляются с задержкой
   */
  private getVkDateRange(days: number): { dateFrom: string; dateTo: string } {
    const today = this.getMoscowDate();
    // endDate = вчера
    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 1);

    // startDate = endDate - (days - 1)
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));

    return {
      dateFrom: this.formatDateYMD(startDate),
      dateTo: this.formatDateYMD(endDate),
    };
  }

  /**
   * Пустой результат
   */
  private emptyResult(days: number): ProfitabilityResult {
    const { dateStart, dateEnd } = this.leadsTechService.getDateRange(days);
    return {
      profitable: [],
      unprofitable: [],
      noData: [],
      summary: {
        totalBanners: 0,
        profitableBanners: 0,
        unprofitableBanners: 0,
        noDataBanners: 0,
        totalSpent: 0,
        totalIncome: 0,
        totalProfit: 0,
        overallROI: 0,
      },
      period: {
        days,
        dateStart,
        dateEnd,
      },
    };
  }
}
