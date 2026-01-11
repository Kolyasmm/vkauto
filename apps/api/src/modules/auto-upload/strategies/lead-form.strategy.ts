import { BadRequestException } from '@nestjs/common';
import { BaseCampaignStrategy, CampaignResult } from './base.strategy';

// Маппинг CTA для лид-форм
const CTA_LEADADS_MAPPING: Record<string, string> = {
  'read_more': 'learnMore',
  'apply': 'apply',
  'register': 'register',
  'get': 'get',
  'download': 'download',
  'buy': 'buy',
  'order': 'order',
  'write': 'askQuestion',
};

export interface LeadFormDto {
  campaignName: string;
  dailyBudget: number;

  // ID лид-формы из VK Ads
  leadFormId: string;

  // Креативы
  creativeIds: number[];
  creativeContentKeys?: string[];

  // Тексты
  title: string;              // до 40 символов
  shortDescription: string;   // до 90 символов
  longDescription: string;    // до 220 символов
  buttonText?: string;        // текст кнопки, до 30 символов
  callToAction: string;

  // Опционально - логотип и изображение
  logoCreativeId?: number;
  imageCreativeId?: number;

  // Таргетинги
  geoRegions?: number[];
  ageFrom?: number;
  ageTo?: number;
  segmentIds?: number[];
  interestIds?: number[];
  pads?: number[];

  // Рекламодатель
  advertiserName?: string;
  advertiserInn?: string;

  // Дополнительно
  adGroupName?: string;
  bannerNames?: string[];
  dateStart?: string;
}

export class LeadFormStrategy extends BaseCampaignStrategy {
  // Package ID для лид-форм
  private readonly PACKAGE_ID = 3215;
  private readonly OBJECTIVE = 'leadads';
  private readonly DEFAULT_PADS = [1342048, 1480820];

  constructor() {
    super('LeadFormStrategy');
  }

  async createCampaign(dto: LeadFormDto): Promise<CampaignResult> {
    if (!dto.leadFormId) {
      throw new BadRequestException('Необходимо указать ID лид-формы');
    }

    if (!dto.creativeIds || dto.creativeIds.length === 0) {
      throw new BadRequestException('Необходимо выбрать хотя бы один креатив');
    }

    if (dto.creativeIds.length > 10) {
      throw new BadRequestException('Максимум 10 креативов за раз');
    }

    this.logger.log(`Создание кампании leadads: ${dto.campaignName}, leadFormId: ${dto.leadFormId}`);

    // Формируем группы объявлений
    const adGroups = this.buildAdGroups(dto);

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

  private buildAdGroups(dto: LeadFormDto): Record<string, any>[] {
    const adGroups: Record<string, any>[] = [];
    const vkCtaValue = CTA_LEADADS_MAPPING[dto.callToAction] || 'learnMore';

    for (let i = 0; i < dto.creativeIds.length; i++) {
      const creativeId = dto.creativeIds[i];
      const contentKey = dto.creativeContentKeys?.[i] || 'image_600x600';

      // Формируем content для лид-формы
      const content: Record<string, any> = {};

      // Логотип
      if (dto.logoCreativeId) {
        content.icon_256x256 = { id: dto.logoCreativeId };
      }

      // Изображение
      if (dto.imageCreativeId) {
        content.image_600x600 = { id: dto.imageCreativeId };
      } else if (contentKey === 'image_600x600' || contentKey === 'image_1080x1080') {
        content.image_600x600 = { id: creativeId };
      } else if (!dto.logoCreativeId && creativeId) {
        content.icon_256x256 = { id: creativeId };
      }

      // Формируем textblocks
      const textblocks: Record<string, any> = {
        title_40_vkads: { text: dto.title },
        text_90: { text: dto.shortDescription },
        text_220: { text: dto.longDescription },
        title_30_additional: { text: dto.buttonText || 'Получить' },
        cta_leadads: { text: vkCtaValue },
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
          primary: {
            url: `leadads://${dto.leadFormId}/`,
            url_object_id: dto.leadFormId,
            url_object_type: 'lead_form',
          },
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
        pads: dto.pads || this.DEFAULT_PADS,
        sex: ['female', 'male'],
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
