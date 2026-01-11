import { BadRequestException } from '@nestjs/common';
import { BaseCampaignStrategy, CampaignResult } from './base.strategy';

// Маппинг CTA для приложений
const CTA_APPS_MAPPING: Record<string, string> = {
  'install': 'install',
  'download': 'download',
  'open': 'open',
  'learnMore': 'learnMore',
  'play': 'play',
  'buy': 'buy',
  'order': 'order',
  'register': 'register',
};

// Дефолтные версии мобильных ОС для Android 8+
const DEFAULT_MOBILE_OS = [208, 207, 169, 83, 87, 48, 80, 206, 47, 199, 105, 127];

export interface AppInstallsDto {
  campaignName: string;
  dailyBudget: number;

  // URL трекера (AppsFlyer, Adjust и т.д.)
  appTrackerUrl: string;
  appBundleId?: string;

  // Креативы
  creativeIds: number[];
  creativeContentKeys?: string[];

  // Тексты
  title: string;              // до 40 символов
  shortDescription: string;   // до 90 символов
  longDescription: string;    // до 220 символов
  ctaText?: string;           // текст кнопки CTA

  // Опционально - иконка и изображение
  iconCreativeId?: number;
  imageCreativeId?: number;

  // Таргетинги
  geoRegions?: number[];
  ageFrom?: number;
  ageTo?: number;
  segmentIds?: number[];
  interestIds?: number[];
  mobileOperatingSystems?: number[];

  // Рекламодатель
  advertiserName?: string;
  advertiserInn?: string;

  // Дополнительно
  adGroupName?: string;
  bannerNames?: string[];
  dateStart?: string;
}

export class AppInstallsStrategy extends BaseCampaignStrategy {
  // Package ID для установки приложений
  private readonly PACKAGE_ID = 2861;
  private readonly OBJECTIVE = 'appinstalls';

  constructor() {
    super('AppInstallsStrategy');
  }

  async createCampaign(dto: AppInstallsDto): Promise<CampaignResult> {
    if (!dto.appTrackerUrl) {
      throw new BadRequestException('Необходимо указать URL трекера приложения');
    }

    if (!dto.creativeIds || dto.creativeIds.length === 0) {
      throw new BadRequestException('Необходимо выбрать хотя бы один креатив');
    }

    if (dto.creativeIds.length > 10) {
      throw new BadRequestException('Максимум 10 креативов за раз');
    }

    this.logger.log(`Создание кампании appinstalls: ${dto.campaignName}`);

    // Создаём URL для приложения
    const urlId = await this.createAppUrl(dto.appTrackerUrl, dto.appBundleId);
    this.logger.log(`URL приложения создан: ${urlId}`);

    // Формируем группы объявлений
    const adGroups = this.buildAdGroups(dto, urlId);

    // Формируем запрос
    const requestData: Record<string, any> = {
      name: dto.campaignName,
      status: 'active',
      objective: this.OBJECTIVE,
      ad_groups: adGroups,
    };

    if (dto.dateStart) {
      requestData.date_start = dto.dateStart;
    }

    return this.sendCreateCampaignRequest(requestData);
  }

  private async createAppUrl(trackerUrl: string, bundleId?: string): Promise<number> {
    try {
      // Проверяем существующие URL
      const existingUrls = await this.client.get('urls.json', {
        params: {
          limit: 100,
          url_object_type: 'app_shop',
        },
      });

      if (existingUrls.data.items?.length > 0) {
        for (const urlItem of existingUrls.data.items) {
          if (urlItem.url === trackerUrl || urlItem.url?.includes(bundleId || '')) {
            this.logger.log(`Найден существующий URL: ${urlItem.id}`);
            return urlItem.id;
          }
        }
      }

      // Создаём новый URL
      const urlData: Record<string, any> = {
        url: trackerUrl,
        url_object_type: 'app_shop',
      };

      if (bundleId) {
        urlData.url_object_id = bundleId;
      }

      const response = await this.client.post('urls.json', urlData);

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message || JSON.stringify(response.data.error));
      }

      return response.data.id;
    } catch (error) {
      this.logger.error('Ошибка создания URL приложения:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка создания URL приложения: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  private buildAdGroups(dto: AppInstallsDto, urlId: number): Record<string, any>[] {
    const adGroups: Record<string, any>[] = [];
    const vkCtaValue = CTA_APPS_MAPPING[dto.ctaText || 'install'] || 'install';

    for (let i = 0; i < dto.creativeIds.length; i++) {
      const creativeId = dto.creativeIds[i];

      // Формируем content для package 2861
      const content: Record<string, any> = {};

      // Иконка приложения
      if (dto.iconCreativeId) {
        content.icon_300x300_app = { id: dto.iconCreativeId };
      } else if (creativeId) {
        content.icon_300x300_app = { id: creativeId };
      }

      // Промо изображение
      if (dto.imageCreativeId) {
        content.image_1080x607 = { id: dto.imageCreativeId };
      } else if (creativeId) {
        content.image_1080x607 = { id: creativeId };
      }

      // Формируем textblocks
      const textblocks: Record<string, any> = {
        title_25: { text: dto.title.substring(0, 25) },
        text_90: { text: (dto.shortDescription || dto.longDescription || '').substring(0, 90) },
        cta_apps_full: { text: vkCtaValue },
      };

      if (dto.advertiserName || dto.advertiserInn) {
        const parts: string[] = [];
        if (dto.advertiserName) parts.push(dto.advertiserName);
        if (dto.advertiserInn) parts.push(`ИНН ${dto.advertiserInn}`);
        textblocks.about_company_115 = { text: parts.join('\n') };
      }

      // Формируем баннер
      const bannerData: Record<string, any> = {
        content,
        textblocks,
        urls: {
          primary: { id: urlId },
        },
      };

      if (dto.bannerNames?.[i]) {
        bannerData.name = dto.bannerNames[i];
      }

      // Формируем таргетинги
      const targetings: Record<string, any> = {
        age: {
          age_list: this.generateAgeList(dto.ageFrom || 21, dto.ageTo || 50),
        },
        geo: {
          regions: dto.geoRegions || this.config.geoRegions,
        },
        fulltime: this.generateFulltime(8, 23),
        mobile_apps: 'never_installed',
        mobile_types: ['smartphones'],
        mobile_operation_systems: dto.mobileOperatingSystems || DEFAULT_MOBILE_OS,
      };

      if (dto.segmentIds?.length) {
        targetings.segments = dto.segmentIds;
      }

      if (dto.interestIds?.length) {
        targetings.interests = dto.interestIds;
      }

      // Формируем название группы
      let groupName: string;
      if (dto.adGroupName) {
        groupName = dto.creativeIds.length > 1 ? `${dto.adGroupName} ${i + 1}` : dto.adGroupName;
      } else {
        groupName = dto.creativeIds.length > 1 ? `группа ${i + 1}` : 'дефолт';
      }

      adGroups.push({
        name: groupName,
        package_id: this.PACKAGE_ID,
        objective: this.OBJECTIVE,
        budget_limit_day: dto.dailyBudget,
        autobidding_mode: 'max_goals',
        targetings,
        age_restrictions: '18+',
        banners: [bannerData],
      });
    }

    return adGroups;
  }
}
