import { BadRequestException } from '@nestjs/common';
import { BaseCampaignStrategy, CampaignResult } from './base.strategy';

// Маппинг CTA для сообщений в сообщество VK
const CTA_MAPPING: Record<string, string> = {
  'read_more': 'learnMore',
  'write': 'contactUs',
  'apply': 'enroll',
  'register': 'signUp',
  'get': 'getoffer',
  'download': 'learnMore',
  'install': 'learnMore',
  'open': 'visitSite',
  'buy': 'buy',
  'order': 'book',
};

export interface SocialActivityDto {
  campaignName: string;
  dailyBudget: number;

  // Группа VK - URL или shortname (например https://vk.com/zaymptichka или zaymptichka)
  vkGroupUrl: string;

  // Креативы
  creativeIds: number[];
  creativeContentKeys?: string[];

  // Текст баннера
  title: string;           // до 40 символов
  description: string;     // до 2000 символов
  callToAction: string;    // write, read_more, apply, etc.

  // Опционально - логотип
  logoCreativeId?: number;

  // Таргетинги
  geoRegions?: number[];
  ageFrom?: number;
  ageTo?: number;
  segmentIds?: number[];
  interestIds?: number[];

  // Рекламодатель
  advertiserName?: string;
  advertiserInn?: string;

  // Дополнительно
  adGroupName?: string;
  bannerNames?: string[];
  dateStart?: string;
}

export class SocialActivityStrategy extends BaseCampaignStrategy {
  // Package ID для "Написать в сообщество"
  private readonly PACKAGE_ID = 3127;
  private readonly OBJECTIVE = 'socialengagement';

  constructor() {
    super('SocialActivityStrategy');
  }

  async createCampaign(dto: SocialActivityDto): Promise<CampaignResult> {
    if (!dto.vkGroupUrl) {
      throw new BadRequestException('Необходимо указать URL группы VK (vkGroupUrl)');
    }

    if (!dto.creativeIds || dto.creativeIds.length === 0) {
      throw new BadRequestException('Необходимо выбрать хотя бы один креатив');
    }

    if (dto.creativeIds.length > 10) {
      throw new BadRequestException('Максимум 10 креативов за раз');
    }

    this.logger.log(`Создание кампании socialactivity: ${dto.campaignName}, креативов: ${dto.creativeIds.length}`);

    // 1. Создаём URL для группы VK
    const normalizedUrl = this.normalizeVkGroupUrl(dto.vkGroupUrl);
    const urlId = await this.createUrl(normalizedUrl);
    this.logger.log(`URL группы VK создан: ${urlId}`);

    // 2. Формируем группы объявлений
    const adGroups = this.buildAdGroups(dto, urlId);

    // 3. Формируем запрос
    const requestData: Record<string, any> = {
      name: dto.campaignName,
      status: 'active',
      objective: this.OBJECTIVE,
      ad_object_id: String(urlId),
      ad_object_type: 'url',
      ad_groups: adGroups,
    };

    if (dto.dateStart) {
      requestData.date_start = dto.dateStart;
    }

    // 4. Отправляем запрос
    return this.sendCreateCampaignRequest(requestData);
  }

  private normalizeVkGroupUrl(groupUrl: string): string {
    const url = groupUrl.trim();
    if (!url.startsWith('http')) {
      return `https://vk.com/${url}`;
    }
    return url;
  }

  private buildAdGroups(dto: SocialActivityDto, urlId: number): Record<string, any>[] {
    const adGroups: Record<string, any>[] = [];
    const vkCtaValue = CTA_MAPPING[dto.callToAction] || 'learnMore';

    for (let i = 0; i < dto.creativeIds.length; i++) {
      const creativeId = dto.creativeIds[i];
      const contentKey = dto.creativeContentKeys?.[i] || 'video_portrait_9_16_30s';
      const isVideo = contentKey.includes('video');

      // Формируем content
      const content: Record<string, any> = {};

      // Логотип
      if (dto.logoCreativeId) {
        content.icon_256x256 = { id: dto.logoCreativeId };
      } else {
        content.icon_256x256 = { id: creativeId };
      }

      // Основной креатив
      if (isVideo) {
        content.video_portrait_9_16_30s = { id: creativeId };
        content.video_portrait_9_16_180s = { id: creativeId };
      } else {
        content[contentKey] = { id: creativeId };
      }

      // Формируем textblocks
      const textblocks: Record<string, any> = {
        title_40_vkads: { text: dto.title },
        text_2000: { text: dto.description },
        cta_community_vk: { text: vkCtaValue },
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
        enable_utm: true,
        utm: 'ref_source={{banner_id}}&ref=vkads',
      });
    }

    return adGroups;
  }
}
