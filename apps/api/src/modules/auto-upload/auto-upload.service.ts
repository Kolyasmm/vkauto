import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { CreativesService } from '../creatives/creatives.service';
import { CreateCampaignDto, CampaignObjective, AppInstallsBannerDto } from './dto/create-campaign.dto';
import axios from 'axios';
import * as FormData from 'form-data';
import * as sharp from 'sharp';

// Маппинг наших CallToAction на значения VK API (cta_community_vk)
// VK API допускает: signUp, buy, contactUs, subscribe, message, write, visitSite, learnMore, getoffer, book, enroll, askQuestion, startChat, getPrice
//
// ВАЖНО для целей сообщества ВК (package_id):
// - 3122 (Вступить в сообщество) -> CTA "signUp"
// - 3127 (Написать в сообщество) -> CTA "contactUs"
const CTA_MAPPING: Record<string, string> = {
  'read_more': 'learnMore',
  'write': 'contactUs',     // Написать -> Связаться с нами (для package 3127 - "Написать в сообщество")
  'apply': 'enroll',        // Подать заявку -> Записаться
  'register': 'signUp',     // Зарегистрироваться -> Зарегистрироваться (для package 3122 - "Вступить в сообщество")
  'get': 'getoffer',        // Получить -> Получить предложение
  'download': 'learnMore',  // Скачать -> Подробнее (нет точного аналога)
  'install': 'learnMore',   // Установить -> Подробнее
  'open': 'visitSite',      // Открыть -> Перейти на сайт
  'buy': 'buy',             // Купить -> Купить
  'order': 'book',          // Заказать -> Забронировать
};

// Маппинг CTA для мобильных приложений (cta_apps_full)
// VK API допускает: install, open, learnMore, play, download, buy, book, order, register, signUp
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

// Маппинг CTA для лид-форм (cta_leadads)
// VK API допускает: learnMore, apply, register, signUp, get, download, buy, order, book, askQuestion
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

// Дефолтные версии мобильных ОС для Android 8+
const DEFAULT_MOBILE_OS = [208, 207, 169, 83, 87, 48, 80, 206, 47, 199, 105, 127];

export interface Creative {
  id: number;
  type: string;  // image, video
  contentKey: string;  // icon_256x256, image_600x600, video_portrait_9_16_30s
  previewUrl: string;
  width?: number;
  height?: number;
}

export interface ExistingAdGroupSettings {
  packageId: number;
  objective: string;
  geoRegions: number[];
  urlId?: number;
  vkGroupId?: number;
}

@Injectable()
export class AutoUploadService {
  private readonly logger = new Logger(AutoUploadService.name);

  constructor(
    private prisma: PrismaService,
    private vkService: VkService,
    private creativesService: CreativesService,
    private configService: ConfigService,
  ) {}

  /**
   * Получить токен VK аккаунта
   */
  private async getVkToken(userId: number, vkAccountId: number): Promise<string> {
    const vkAccount = await this.prisma.vkAccount.findFirst({
      where: {
        id: vkAccountId,
        OR: [
          { userId },
          { sharedWith: { some: { sharedWithUserId: userId } } },
        ],
      },
    });

    if (!vkAccount) {
      throw new NotFoundException('VK аккаунт не найден');
    }

    return vkAccount.accessToken;
  }

  /**
   * Создать API клиент
   */
  private createApiClient(token: string) {
    return axios.create({
      baseURL: 'https://ads.vk.com/api/v2/',
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Получить креативы из существующих баннеров кабинета
   * Креативы группируются по типу (icon_256x256, image_600x600, video и т.д.)
   */
  async getCreatives(userId: number, vkAccountId: number): Promise<Creative[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      // НЕ фильтруем по паттернам - показываем все креативы
      // VK API сам проверит при создании кампании

      // Получаем ВСЕ баннеры с креативами (пагинация с задержкой)
      const allBanners: any[] = [];
      let offset = 0;
      const limit = 200;

      while (true) {
        const response = await client.get('banners.json', {
          params: {
            limit,
            offset,
            fields: 'id,content,ad_group_id',
          },
        });

        if (response.data.error) {
          throw new BadRequestException(response.data.error.message);
        }

        const items = response.data.items || [];
        allBanners.push(...items);

        // Если получили меньше чем limit - это последняя страница
        if (items.length < limit) break;
        offset += limit;

        // Безопасность - не более 25 страниц (5000 баннеров)
        if (offset >= 5000) break;

        // Задержка 200мс между запросами чтобы не превысить rate limit
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      this.logger.log(`Загружено ${allBanners.length} баннеров для извлечения креативов`);
      const banners = allBanners;
      const creativesMap = new Map<number, Creative>();

      // DEBUG: Полный анализ ВСЕХ баннеров - ищем ВСЕ типы контента включая видео
      let bannersWithContent = 0;
      let bannersWithoutContent = 0;

      if (banners.length > 0) {
        const allContentKeys = new Set<string>();
        const contentKeyStats: Record<string, number> = {};
        let videoBannersFound = 0;

        for (const b of banners) {
          if (b.content && Object.keys(b.content).length > 0) {
            bannersWithContent++;
            const keys = Object.keys(b.content);
            keys.forEach(k => {
              allContentKeys.add(k);
              contentKeyStats[k] = (contentKeyStats[k] || 0) + 1;
            });
            // Считаем баннеры с видео
            if (keys.some(k => k.includes('video'))) {
              videoBannersFound++;
            }
          } else {
            bannersWithoutContent++;
          }
        }

        this.logger.log(`=== Баннеры: ${bannersWithContent} с контентом, ${bannersWithoutContent} без контента ===`);
        this.logger.log(`=== DEBUG: ВСЕ contentKeys во ВСЕХ ${banners.length} баннерах: ${Array.from(allContentKeys).join(', ')} ===`);
        this.logger.log(`=== DEBUG: Статистика по типам: ${JSON.stringify(contentKeyStats)} ===`);
        this.logger.log(`=== DEBUG: Баннеров с видео: ${videoBannersFound} из ${banners.length} ===`);
      }

      // БЕЗ ФИЛЬТРАЦИИ - собираем ВСЕ креативы
      let videoCreativesCount = 0;
      let imageCreativesCount = 0;

      for (const banner of banners) {
        if (!banner.content) continue;

        for (const [contentKey, contentData] of Object.entries(banner.content)) {
          if (!contentData || typeof contentData !== 'object') continue;

          const data = contentData as any;
          if (!data.id) continue;

          // Проверяем что креатив еще не добавлен
          if (creativesMap.has(data.id)) continue;

          // Определяем тип креатива ПО contentKey (более надёжно чем data.type)
          // Видео: video_portrait_9_16_30s, video_portrait_9_16_180s, video_square_180s, video_landscape_180s, etc.
          const isVideo = contentKey.startsWith('video_');
          const type = isVideo ? 'video' : 'image';

          if (isVideo) videoCreativesCount++;
          else imageCreativesCount++;

          // Получаем URL превью
          let previewUrl = '';
          let width: number | undefined;
          let height: number | undefined;

          if (data.variants) {
            // Для изображений берем 256x256 или original
            const variant = data.variants['256x256'] || data.variants['original'] || data.variants['uploaded'];
            if (variant) {
              previewUrl = variant.url;
              width = variant.width;
              height = variant.height;
            }
            // Для видео берем первый кадр
            if (type === 'video' && data.variants['high-first_frame']) {
              previewUrl = data.variants['high-first_frame'].url;
            }
          }

          creativesMap.set(data.id, {
            id: data.id,
            type,
            contentKey,
            previewUrl,
            width,
            height,
          });
        }
      }

      this.logger.log(`=== DEBUG: Найдено креативов без фильтрации: ${creativesMap.size} (видео: ${videoCreativesCount}, картинок: ${imageCreativesCount}) ===`)

      // Возвращаем все креативы
      const creatives = Array.from(creativesMap.values());

      this.logger.log(`Найдено ${creatives.length} уникальных креативов`);
      return creatives;
    } catch (error) {
      this.logger.error('Ошибка получения креативов:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Получить настройки для создания кампании
   * Package_id берём из справочника VK, гео по умолчанию Россия
   */
  async getExistingSettings(userId: number, vkAccountId: number, objective: string): Promise<ExistingAdGroupSettings | null> {
    // Маппинг objectives на package_id из VK Ads
    // VK Ads API использует один objective 'socialengagement' для разных целей сообщества:
    // - package_id 3122 (Вступить в сообщество) + CTA "signUp"
    // - package_id 3127 (Написать в сообщество) + CTA "contactUs"
    // - package_id 3194 (Повысить вовлеченность)
    //
    // Для мобильных приложений:
    // - package_id 2861 с objective 'appinstalls'
    //
    // Цель кампании в интерфейсе VK Ads определяется не objective, а комбинацией package_id + CTA
    const packageMapping: Record<string, { packageId: number; vkObjective: string }> = {
      'socialactivity': { packageId: 3127, vkObjective: 'socialengagement' },  // Написать в сообщество (с CTA "contactUs")
      'lead_form': { packageId: 3215, vkObjective: 'leadads' },                 // Лид-формы (package 3215, objective leadads)
      'appinstalls': { packageId: 2861, vkObjective: 'appinstalls' },            // Установка мобильного приложения
    };

    const mapping = packageMapping[objective];
    if (!mapping) {
      this.logger.error(`Неизвестный objective: ${objective}`);
      return null;
    }

    // Пытаемся получить гео и urlId из существующих групп/баннеров
    let geoRegions = [1]; // По умолчанию Россия
    let urlId: number | undefined;

    try {
      const token = await this.getVkToken(userId, vkAccountId);
      const client = this.createApiClient(token);

      // Получаем гео из групп
      const response = await client.get('ad_groups.json', {
        params: {
          limit: 10,
          fields: 'targetings',
        },
      });

      if (response.data.items?.length > 0) {
        const firstGroup = response.data.items[0];
        if (firstGroup.targetings?.geo?.regions?.length > 0) {
          geoRegions = firstGroup.targetings.geo.regions;
        }
      }

      // Получаем urlId из существующих баннеров
      // API /urls.json требует POST метод, поэтому извлекаем URL из баннеров
      try {
        const bannersResponse = await client.get('banners.json', {
          params: {
            limit: 10,
            fields: 'id,urls',
          },
        });
        if (bannersResponse.data.items?.length > 0) {
          for (const banner of bannersResponse.data.items) {
            if (banner.urls?.primary?.id) {
              urlId = banner.urls.primary.id;
              this.logger.log(`Найден URL ID из баннера ${banner.id}: ${urlId}`);
              break;
            }
          }
        }
      } catch (urlError) {
        this.logger.log('Не удалось получить URL из баннеров');
      }
    } catch (error) {
      this.logger.log('Не удалось получить гео из групп, используем Россию по умолчанию');
    }

    return {
      packageId: mapping.packageId,
      objective: mapping.vkObjective,
      geoRegions,
      urlId,
    };
  }

  /**
   * Получить доступные пакеты (форматы) для objective
   */
  async getPackages(userId: number, vkAccountId: number, objective: string): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      const response = await client.get('packages.json', {
        params: {
          limit: 100,
          objective,
        },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Ошибка получения пакетов:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить URL-ссылки из кабинета
   */
  async getUrls(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      const response = await client.get('urls.json', {
        params: {
          limit: 100,
          fields: 'id,url,title,status',
        },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      return response.data.items || [];
    } catch (error) {
      this.logger.error('Ошибка получения URL:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить группы ВКонтакте из существующих баннеров
   * Извлекаем уникальные группы из urls.primary где url_object_type === 'vk_group'
   */
  async getVkGroups(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      // Получаем баннеры с urls
      const response = await client.get('banners.json', {
        params: {
          limit: 200,
          fields: 'id,urls',
        },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      const banners = response.data.items || [];
      const groupsMap = new Map<string, { id: string; name: string; url: string }>();

      // Собираем уникальные группы VK из баннеров
      for (const banner of banners) {
        const primary = banner.urls?.primary;
        if (primary?.url_object_type === 'vk_group' && primary?.url_object_id) {
          const groupId = primary.url_object_id;
          if (!groupsMap.has(groupId)) {
            // Извлекаем имя группы из URL (vk.com/groupname)
            const urlMatch = primary.url?.match(/vk\.com\/([^/?]+)/);
            const groupName = urlMatch ? urlMatch[1] : `Группа ${groupId}`;

            groupsMap.set(groupId, {
              id: groupId,
              name: groupName,
              url: primary.url || `https://vk.com/club${groupId}`,
            });
          }
        }
      }

      const groups = Array.from(groupsMap.values());
      this.logger.log(`Найдено ${groups.length} уникальных групп VK`);
      return groups;
    } catch (error) {
      this.logger.error('Ошибка получения групп VK:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить сегменты аудитории (ремаркетинг)
   * GET /api/v2/remarketing/segments.json
   */
  async getSegments(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      const response = await client.get('remarketing/segments.json', {
        params: {
          limit: 100,
          fields: 'id,name,pass_condition,created,updated',
        },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      const segments = response.data.items || [];
      this.logger.log(`Найдено ${segments.length} сегментов аудитории`);
      return segments;
    } catch (error) {
      this.logger.error('Ошибка получения сегментов:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить обычные интересы для таргетинга (Авто, Финансы, и т.д.)
   * GET /api/v2/targetings_tree.json?targetings=interests
   */
  async getInterests(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      const response = await client.get('targetings_tree.json', {
        params: { targetings: 'interests' },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      // API возвращает объект {"interests": [...]}
      const tree = response.data?.interests || [];
      const result: any[] = [];

      // Рекурсивно извлекаем интересы с их полными названиями
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
      this.logger.error('Ошибка получения интересов:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить соц-дем интересы для таргетинга (доход, занятость, и т.д.)
   * GET /api/v2/targetings_tree.json?targetings=interests_soc_dem
   */
  async getInterestsSocDem(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      const response = await client.get('targetings_tree.json', {
        params: { targetings: 'interests_soc_dem' },
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      // API возвращает объект {"interests_soc_dem": [...]}
      const tree = response.data?.interests_soc_dem || [];
      const result: any[] = [];

      // Рекурсивно извлекаем интересы с их полными названиями
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
      this.logger.error('Ошибка получения соц-дем интересов:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Создать кампанию с несколькими группами (по одной на каждый креатив)
   * Структура: 1 кампания -> N групп -> N баннеров (1 креатив на 1 группу)
   */
  async createCampaign(userId: number, dto: CreateCampaignDto): Promise<{ campaignId: number; adGroupIds: number[]; bannerIds: number[] }> {
    const token = await this.getVkToken(userId, dto.vkAccountId);
    const client = this.createApiClient(token);

    // Получаем массив креативов
    const creativeIds = dto.creativeIds || [];

    if (creativeIds.length === 0) {
      throw new BadRequestException('Необходимо выбрать хотя бы один креатив');
    }

    // Ограничение до 10 креативов
    if (creativeIds.length > 10) {
      throw new BadRequestException('Максимум 10 креативов за раз');
    }

    // Определяем тип контента по первому креативу
    const firstContentKey = dto.creativeContentKeys?.[0] || 'video_portrait_9_16_30s';
    const isVideoContent = firstContentKey.includes('video');

    this.logger.log(`Создание кампании: ${dto.campaignName}, objective: ${dto.objective}, креативов: ${creativeIds.length}, тип контента: ${isVideoContent ? 'video' : 'image'}`);

    try {
      // Получаем настройки (package_id, vkObjective, geo)
      const existingSettings = await this.getExistingSettings(userId, dto.vkAccountId, dto.objective);
      if (!existingSettings) {
        throw new BadRequestException('Не удалось определить настройки для создания кампании');
      }

      // Используем packageId из маппинга (пока фиксированный 3127 для messages)
      // TODO: Найти правильные пакеты для objective='messages' с видео/картинками
      const packageId = dto.packageId || existingSettings.packageId;
      const geoRegions = dto.geoRegions || existingSettings.geoRegions;
      const vkObjective = existingSettings.objective;
      let urlId = dto.urlId || existingSettings.urlId;

      // Проверяем, что для сообщений указана группа VK и создаём URL для неё
      if (dto.objective === CampaignObjective.MESSAGES) {
        if (!dto.vkGroupUrl && !dto.vkGroupId) {
          throw new BadRequestException('Для цели "Сообщения" необходимо указать группу VK (vkGroupUrl)');
        }
        // ВСЕГДА создаём URL для группы VK для цели "Сообщения"
        // Приоритет: vkGroupUrl > vkGroupId
        const groupUrl = dto.vkGroupUrl || `https://vk.com/club${dto.vkGroupId}`;
        urlId = await this.createVkGroupUrlFromString(userId, dto.vkAccountId, groupUrl);
        this.logger.log(`Создан/найден URL для группы VK ${groupUrl}: ${urlId}`);
      }

      // Формируем группы объявлений - по одной на каждый креатив
      const adGroups: Record<string, any>[] = [];

      for (let i = 0; i < creativeIds.length; i++) {
        const creativeId = creativeIds[i];
        const contentKey = dto.creativeContentKeys?.[i] || 'video_portrait_9_16_30s'; // default to video

        // Формируем данные баннера
        let bannerData: Record<string, any>;

        if (dto.objective === CampaignObjective.MESSAGES && dto.messagesBanner) {
          const banner = dto.messagesBanner;

          // Преобразуем наш CTA в формат VK API
          const vkCtaValue = CTA_MAPPING[banner.callToAction] || 'learnMore';

          // Определяем тип контента по contentKey
          const isVideo = contentKey.includes('video');

          // Формируем content в зависимости от типа креатива
          // ВАЖНО: Для package 3127 (socialengagement) нужны: icon_256x256 + video_portrait_9_16_30s + video_portrait_9_16_180s
          const content: Record<string, any> = {};

          // Логотип (icon_256x256) ОБЯЗАТЕЛЕН для определения patterns
          // Если явно указан creativeId для логотипа - используем его, иначе используем основной креатив
          if (banner.creativeId) {
            content.icon_256x256 = { id: banner.creativeId };
          } else {
            // Используем основной креатив как логотип если не указан отдельно
            content.icon_256x256 = { id: creativeId };
          }

          // Добавляем основной креатив (картинку или видео)
          if (isVideo) {
            // Для видео ВСЕГДА добавляем ОБА формата: 30s и 180s
            // Это требуется для корректного определения patterns в VK API
            content.video_portrait_9_16_30s = { id: creativeId };
            content.video_portrait_9_16_180s = { id: creativeId };
          } else {
            // Для картинок используем оригинальный contentKey
            content[contentKey] = { id: creativeId };
          }

          // Формируем текстовые блоки
          const textblocks: Record<string, any> = {
            title_40_vkads: { text: banner.title },
            text_2000: { text: banner.description },
            cta_community_vk: { text: vkCtaValue },
          };

          // Добавляем информацию о рекламодателе если указана
          if (dto.advertiserName || dto.advertiserInn) {
            const advertiserParts: string[] = [];
            if (dto.advertiserName) advertiserParts.push(dto.advertiserName);
            if (dto.advertiserInn) advertiserParts.push(`ИНН ${dto.advertiserInn}`);
            textblocks.about_company_115 = { text: advertiserParts.join('\n') };
          }

          bannerData = {
            content,
            textblocks,
            urls: {} as Record<string, any>,
          };

          // Используем urlId если он есть из существующих URLs
          if (urlId) {
            this.logger.log(`Используем существующий URL ID: ${urlId}`);
            bannerData.urls.primary = {
              id: urlId,
            };
          } else {
            // Если urlId нет, не добавляем urls вообще
            // VK API сам определит URL по vk_group_id
            this.logger.log('URL ID не найден, создаем баннер без явного указания URL');
            delete bannerData.urls;
          }
        } else if (dto.objective === CampaignObjective.LEAD_FORM && dto.leadFormBanner) {
          // === ОБРАБОТКА ЦЕЛИ: ЛИД-ФОРМА (package 3215) ===
          const banner = dto.leadFormBanner;

          // Проверяем что указана лид-форма
          if (!dto.leadFormId) {
            throw new BadRequestException('Для цели "Лид-форма" необходимо указать ID лид-формы');
          }

          // Создаём URL для лид-формы через VK API (только один раз для всех баннеров)
          if (!urlId) {
            urlId = await this.createLeadFormUrl(userId, dto.vkAccountId, dto.leadFormId);
            this.logger.log(`Создан/найден URL ID для лид-формы: ${urlId}`);
          }

          // Определяем тип креатива
          const isVideoCreative = contentKey.includes('video');

          // ВАЖНО: Package 3215 (leadads) НЕ поддерживает видео!
          // Patterns для видео [168,169,508,239] не валидны для этого пакета
          if (isVideoCreative) {
            throw new BadRequestException('Лид-формы (package 3215) не поддерживают видео. Используйте изображения.');
          }

          // Формируем content для лид-формы
          // Package 3215:
          // - Логотип (icon_256x256) берётся АВТОМАТИЧЕСКИ из самой лид-формы, НЕ указываем его!
          // - Только изображения: image_600x600
          const content: Record<string, any> = {};

          // Основной креатив (логотип НЕ указываем - он из лид-формы)
          if (banner.imageCreativeId) {
            // Явно указанное изображение
            content.image_600x600 = { id: banner.imageCreativeId };
          } else {
            // Используем основной креатив как изображение
            content.image_600x600 = { id: creativeId };
          }

          // Преобразуем наш CTA в формат VK API для лид-форм
          const vkCtaValue = CTA_LEADADS_MAPPING[banner.callToAction] || 'learnMore';

          // Формируем textblocks для лид-формы (package 3215)
          // Обязательные поля: title_40_vkads, text_90, text_220, title_30_additional, cta_leadads
          const textblocks: Record<string, any> = {
            title_40_vkads: { text: banner.title },
            text_90: { text: banner.shortDescription },
            text_220: { text: banner.longDescription },
            title_30_additional: { text: banner.buttonText || 'Получить' },  // Текст кнопки
            cta_leadads: { text: vkCtaValue },
          };

          // Добавляем информацию о рекламодателе если указана
          if (dto.advertiserName || dto.advertiserInn) {
            const advertiserParts: string[] = [];
            if (dto.advertiserName) advertiserParts.push(dto.advertiserName);
            if (dto.advertiserInn) advertiserParts.push(`ИНН ${dto.advertiserInn}`);
            textblocks.about_company_115 = { text: advertiserParts.join('\n') };
          }

          bannerData = {
            content,
            textblocks,
            urls: {
              primary: { id: urlId },
            },
          };
        } else if (dto.objective === CampaignObjective.APP_INSTALLS && dto.appInstallsBanner) {
          // === ОБРАБОТКА ЦЕЛИ: УСТАНОВКА МОБИЛЬНОГО ПРИЛОЖЕНИЯ ===
          const banner = dto.appInstallsBanner;

          // Проверяем обязательные параметры
          if (!dto.appTrackerUrl) {
            throw new BadRequestException('Для цели "Установка приложения" необходимо указать URL трекера');
          }

          // Создаём URL для приложения через VK API (только один раз для всех баннеров)
          // Кэшируем appUrlId чтобы не создавать дубликаты
          if (!urlId) {
            urlId = await this.createAppUrl(userId, dto.vkAccountId, dto.appTrackerUrl, dto.appBundleId);
            this.logger.log(`Создан/найден URL ID для приложения: ${urlId}`);
          }

          // Формируем content для package 2861 (appinstalls)
          // Package 2861 требует: icon_300x300_app и image_1080x607
          const content: Record<string, any> = {};

          // Иконка приложения - icon_300x300_app
          if (banner.iconCreativeId) {
            content.icon_300x300_app = { id: banner.iconCreativeId };
          } else if (creativeId) {
            content.icon_300x300_app = { id: creativeId };
          }

          // Промо изображение - image_1080x607
          if (banner.imageCreativeId) {
            content.image_1080x607 = { id: banner.imageCreativeId };
          } else if (creativeId) {
            content.image_1080x607 = { id: creativeId };
          }

          // CTA для приложений
          const vkCtaValue = CTA_APPS_MAPPING[banner.ctaText || 'install'] || 'install';

          // Формируем textblocks для package 2861 (appinstalls)
          const textblocks: Record<string, any> = {
            title_25: { text: banner.title.substring(0, 25) },
            text_90: { text: (banner.shortDescription || banner.longDescription || '').substring(0, 90) },
            cta_apps_full: { text: vkCtaValue },
          };

          // Добавляем информацию о рекламодателе
          if (dto.advertiserName || dto.advertiserInn) {
            const advertiserParts: string[] = [];
            if (dto.advertiserName) advertiserParts.push(dto.advertiserName);
            if (dto.advertiserInn) advertiserParts.push(`ИНН ${dto.advertiserInn}`);
            textblocks.about_company_115 = { text: advertiserParts.join('\n') };
          }

          // VK API требует передавать только id URL, а не url/url_object_type напрямую
          bannerData = {
            content,
            textblocks,
            urls: {
              primary: {
                id: urlId,
              },
            },
          };
        } else {
          throw new BadRequestException('Не указаны данные баннера');
        }

        // Добавляем название баннера если указано
        if (dto.bannerNames && dto.bannerNames[i]) {
          bannerData.name = dto.bannerNames[i];
        }

        // Формируем таргетинги
        const targetings: Record<string, any> = {
          age: {
            age_list: this.generateAgeList(dto.ageFrom || 21, dto.ageTo || 50),
          },
          geo: {
            regions: geoRegions,
          },
          fulltime: this.generateFulltime(8, 23),
        };

        // Добавляем сегменты аудитории если указаны
        if (dto.segmentIds && dto.segmentIds.length > 0) {
          targetings.segments = dto.segmentIds;
        }

        // Добавляем интересы если указаны
        if (dto.interestIds && dto.interestIds.length > 0) {
          targetings.interests = dto.interestIds;
        }

        // Добавляем соц-дем интересы если указаны
        if (dto.socDemInterestIds && dto.socDemInterestIds.length > 0) {
          targetings.interests_soc_dem = dto.socDemInterestIds;
        }

        // Мобильные таргетинги для APP_INSTALLS
        if (dto.objective === CampaignObjective.APP_INSTALLS) {
          targetings.mobile_apps = 'never_installed';  // Показывать только тем, кто не установил приложение
          targetings.mobile_types = ['smartphones'];   // Только смартфоны
          targetings.mobile_operation_systems = dto.mobileOperatingSystems || DEFAULT_MOBILE_OS;
        }

        // Площадки размещения (pads)
        // Для APP_INSTALLS НЕ указываем pads - VK сам выберет на основе package
        // Это важно для корректного определения patterns
        if (!dto.autoPlacement) {
          if (dto.pads && dto.pads.length > 0) {
            targetings.pads = dto.pads;
          } else if (dto.objective === CampaignObjective.LEAD_FORM) {
            targetings.pads = [1342048, 1480820];  // Дефолт для лид-форм (ВК Лента + ВК Клипы)
            targetings.sex = ['female', 'male'];   // Пол для лид-форм
          }
          // Для APP_INSTALLS и socialactivity не указываем pads - VK сам выберет
        }

        // Формируем название группы объявлений
        let groupName: string;
        if (dto.adGroupName) {
          // Если указано кастомное название и несколько креативов - добавляем номер
          groupName = creativeIds.length > 1 ? `${dto.adGroupName} ${i + 1}` : dto.adGroupName;
        } else {
          // Дефолтное название
          groupName = creativeIds.length > 1 ? `группа ${i + 1}` : 'дефолт';
        }

        // Формируем группу объявлений
        const adGroupData: Record<string, any> = {
          name: groupName,
          package_id: packageId,
          objective: vkObjective,
          budget_limit_day: dto.dailyBudget,
          autobidding_mode: 'max_goals',
          targetings,
          age_restrictions: '18+',
          banners: [bannerData],
          // Примечание: VK API не поддерживает явное указание placements через API
          // Места размещения определяются автоматически на основе package_id
        };

        // UTM метки (реф-метки) - только для целей где они поддерживаются
        // Package 3215 (leadads) и appinstalls не поддерживают UTM
        // Для appinstalls UTM-метки идут через tracker URL (AppsFlyer и т.д.)
        if (dto.objective !== CampaignObjective.LEAD_FORM && dto.objective !== CampaignObjective.APP_INSTALLS) {
          adGroupData.enable_utm = true;
          adGroupData.utm = 'ref_source={{banner_id}}&ref=vkads';
        }

        adGroups.push(adGroupData);
      }

      // Формируем запрос создания кампании
      const requestData: Record<string, any> = {
        name: dto.campaignName,
        status: 'active',
        objective: vkObjective,
        ad_groups: adGroups,
      };

      // Для socialengagement (сообщения) указываем ad_object_id и ad_object_type
      // ad_object_id = ID URL группы VK, ad_object_type = "url"
      if (dto.objective === CampaignObjective.MESSAGES && urlId) {
        requestData.ad_object_id = String(urlId);
        requestData.ad_object_type = 'url';
        this.logger.log(`Устанавливаем ad_object_id=${urlId}, ad_object_type=url для socialengagement`);
      }

      // Дата начала показа кампании (для запланированных кампаний)
      if (dto.dateStart) {
        requestData.date_start = dto.dateStart; // формат YYYY-MM-DD
      }

      // ПРИМЕЧАНИЕ: VK Ads API не поддерживает установку advertiser через API
      // Информация о рекламодателе должна быть указана в настройках кабинета VK Ads вручную
      // if (dto.advertiserName && dto.advertiserInn) {
      //   requestData.advertiser = {
      //     company_name: dto.advertiserName,
      //     inn: dto.advertiserInn,
      //   };
      // }

      this.logger.log(`Отправляем запрос: ${JSON.stringify(requestData, null, 2)}`);

      let response;
      try {
        response = await client.post('ad_plans.json', requestData);
      } catch (error) {
        this.logger.error(`VK API Error: ${JSON.stringify(error.response?.data, null, 2)}`);

        // Возвращаем ошибку VK API как есть
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

      // Парсим ответ
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
        const groupsResponse = await client.get('ad_groups.json', {
          params: { _ad_plan_id: campaignId, limit: 20, fields: 'id,banners' },
        });
        if (groupsResponse.data.items?.length > 0) {
          adGroupIds = groupsResponse.data.items.map((g: any) => g.id);
          bannerIds = groupsResponse.data.items.flatMap((g: any) => g.banners?.map((b: any) => b.id) || []);
        }
      }

      this.logger.log(`Кампания создана: ID ${campaignId}, групп: ${adGroupIds.length}, баннеров: ${bannerIds.length}`);
      return { campaignId, adGroupIds, bannerIds };
    } catch (error) {
      this.logger.error('Ошибка создания кампании:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Генерация списка возрастов
   */
  private generateAgeList(from: number, to: number): number[] {
    const ages: number[] = [];
    for (let age = from; age <= to; age++) {
      ages.push(age);
    }
    return ages;
  }

  /**
   * Генерация расписания показов (каждый день с fromHour до toHour)
   */
  private generateFulltime(fromHour: number, toHour: number): Record<string, any> {
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
   * Создать URL для приложения в VK Ads
   * POST /api/v2/urls.json
   * Возвращает ID созданного URL для использования в баннерах
   */
  async createAppUrl(
    userId: number,
    vkAccountId: number,
    trackerUrl: string,
    bundleId?: string,
  ): Promise<number> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      // Сначала проверим, нет ли уже созданного URL с таким трекером
      const existingUrls = await client.get('urls.json', {
        params: {
          limit: 100,
          url_object_type: 'app_shop',
        },
      });

      // Ищем URL с таким же трекером
      if (existingUrls.data.items?.length > 0) {
        for (const urlItem of existingUrls.data.items) {
          if (urlItem.url === trackerUrl || urlItem.url?.includes(bundleId || '')) {
            this.logger.log(`Найден существующий URL для приложения: ID ${urlItem.id}`);
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

      this.logger.log(`Создание URL приложения: ${JSON.stringify(urlData)}`);

      const response = await client.post('urls.json', urlData);

      if (response.data.error) {
        this.logger.error('Ошибка создания URL:', response.data.error);
        throw new BadRequestException(response.data.error.message || JSON.stringify(response.data.error));
      }

      const urlId = response.data.id;
      if (!urlId) {
        throw new BadRequestException('Не удалось получить ID созданного URL');
      }

      this.logger.log(`✅ URL приложения создан, ID: ${urlId}`);
      return urlId;
    } catch (error) {
      this.logger.error('Ошибка создания URL приложения:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка создания URL приложения: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  /**
   * Создать или найти URL для VK группы по URL строке
   * POST /api/v2/urls.json
   * Возвращает ID URL для использования в баннерах socialengagement
   * @param groupUrl - полный URL (https://vk.com/zaymptichka) или shortname (zaymptichka)
   */
  async createVkGroupUrlFromString(
    userId: number,
    vkAccountId: number,
    groupUrl: string,
  ): Promise<number> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    // Нормализуем URL - если передан только shortname, добавляем https://vk.com/
    let normalizedUrl = groupUrl.trim();
    if (!normalizedUrl.startsWith('http')) {
      normalizedUrl = `https://vk.com/${normalizedUrl}`;
    }

    try {
      // VK API не поддерживает GET для urls.json, только POST
      // При POST на существующий URL возвращается тот же ID (идемпотентно)
      const urlData = {
        url: normalizedUrl,
      };

      this.logger.log(`Создание/получение URL группы VK: ${JSON.stringify(urlData)}`);

      const response = await client.post('urls.json', urlData);

      if (response.data.error) {
        this.logger.error('Ошибка создания URL группы:', response.data.error);
        throw new BadRequestException(response.data.error.message || JSON.stringify(response.data.error));
      }

      const urlId = response.data.id;
      if (!urlId) {
        throw new BadRequestException('Не удалось получить ID URL группы');
      }

      this.logger.log(`✅ URL группы VK получен, ID: ${urlId}`);
      return urlId;
    } catch (error) {
      this.logger.error('Ошибка создания URL группы VK:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка создания URL группы VK: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  /**
   * Создать или найти URL для лид-формы
   * POST /api/v2/urls.json
   * Возвращает ID URL для использования в баннерах leadads
   */
  async createLeadFormUrl(
    userId: number,
    vkAccountId: number,
    leadFormId: string,
  ): Promise<number> {
    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    try {
      // Сначала проверим, нет ли уже URL для этой лид-формы
      const existingUrls = await client.get('urls.json', {
        params: {
          limit: 100,
          url_object_type: 'lead_form',
        },
      });

      // Ищем URL с таким же leadFormId
      if (existingUrls.data.items?.length > 0) {
        for (const urlItem of existingUrls.data.items) {
          if (urlItem.url_object_id === leadFormId) {
            this.logger.log(`Найден существующий URL для лид-формы: ID ${urlItem.id}`);
            return urlItem.id;
          }
        }
      }

      // Создаём новый URL для лид-формы
      const urlData = {
        url: `leadads://${leadFormId}/`,
        url_object_type: 'lead_form',
        url_object_id: leadFormId,
      };

      this.logger.log(`Создание URL лид-формы: ${JSON.stringify(urlData)}`);

      const response = await client.post('urls.json', urlData);

      if (response.data.error) {
        this.logger.error('Ошибка создания URL лид-формы:', response.data.error);
        throw new BadRequestException(response.data.error.message || JSON.stringify(response.data.error));
      }

      const urlId = response.data.id;
      if (!urlId) {
        throw new BadRequestException('Не удалось получить ID URL лид-формы');
      }

      this.logger.log(`✅ URL лид-формы создан, ID: ${urlId}`);
      return urlId;
    } catch (error) {
      this.logger.error('Ошибка создания URL лид-формы:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка создания URL лид-формы: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  /**
   * Получить лид-формы из кабинета
   * GET /api/v1/lead_ads/lead_forms.json
   */
  async getLeadForms(userId: number, vkAccountId: number): Promise<any[]> {
    const token = await this.getVkToken(userId, vkAccountId);

    try {
      // Лид-формы находятся в API v1, не v2
      const response = await axios.get('https://ads.vk.com/api/v1/lead_ads/lead_forms.json', {
        params: {
          limit: 100,
          status: 1, // Только активные формы
        },
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        timeout: 30000,
      });

      if (response.data.error) {
        throw new BadRequestException(response.data.error.message);
      }

      const leadForms = response.data.items || [];
      this.logger.log(`Найдено ${leadForms.length} лид-форм`);
      return leadForms;
    } catch (error) {
      this.logger.error('Ошибка получения лид-форм:', error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Получить аватар сообщества VK и загрузить его как логотип в VK Ads
   * @param userId - ID пользователя
   * @param vkAccountId - ID VK аккаунта для загрузки креатива
   * @param vkGroupId - ID группы VK (например: 218588658)
   * @returns VK content ID для использования как icon_256x256
   */
  async getGroupLogoAndUpload(
    userId: number,
    vkAccountId: number,
    vkGroupId: number,
  ): Promise<{ vkContentId: number; previewUrl: string }> {
    this.logger.log(`Получение аватара сообщества VK ${vkGroupId}...`);

    const token = await this.getVkToken(userId, vkAccountId);
    const client = this.createApiClient(token);

    // Способ 1: Пытаемся использовать VK API для получения аватара группы
    // VK API требует сервисный токен или access_token пользователя
    // Попробуем получить через публичный эндпоинт
    let avatarUrl: string | null = null;

    try {
      // Попытка через VK API (если есть VK_SERVICE_TOKEN в env)
      const vkServiceToken = this.configService.get<string>('VK_SERVICE_TOKEN');

      if (vkServiceToken) {
        const vkApiResponse = await axios.get('https://api.vk.com/method/groups.getById', {
          params: {
            group_id: vkGroupId,
            fields: 'photo_200',
            access_token: vkServiceToken,
            v: '5.199',
          },
          timeout: 10000,
        });

        if (vkApiResponse.data?.response?.groups?.[0]?.photo_200) {
          avatarUrl = vkApiResponse.data.response.groups[0].photo_200;
          this.logger.log(`Получен аватар через VK API: ${avatarUrl}`);
        } else if (vkApiResponse.data?.response?.[0]?.photo_200) {
          // Старый формат ответа
          avatarUrl = vkApiResponse.data.response[0].photo_200;
          this.logger.log(`Получен аватар через VK API (старый формат): ${avatarUrl}`);
        }
      }
    } catch (error) {
      this.logger.warn(`VK API недоступен для получения аватара: ${error.message}`);
    }

    // Способ 2: Если VK API не сработал, пробуем получить аватар напрямую
    // VK хранит аватары по паттерну, попробуем несколько вариантов
    if (!avatarUrl) {
      // Пробуем получить через веб-страницу группы
      try {
        const groupPageResponse = await axios.get(`https://vk.com/club${vkGroupId}`, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });

        const html = groupPageResponse.data;
        // Ищем og:image в meta тегах
        const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
        if (ogImageMatch && ogImageMatch[1]) {
          avatarUrl = ogImageMatch[1];
          this.logger.log(`Получен аватар через og:image: ${avatarUrl}`);
        }
      } catch (error) {
        this.logger.warn(`Не удалось получить страницу группы: ${error.message}`);
      }
    }

    if (!avatarUrl) {
      throw new BadRequestException(
        `Не удалось получить аватар сообщества VK ${vkGroupId}. ` +
        'Убедитесь что ID группы корректен и группа публична.'
      );
    }

    // Скачиваем изображение
    this.logger.log(`Скачиваем аватар: ${avatarUrl}`);
    let imageBuffer: Buffer;
    let contentType: string;

    try {
      const imageResponse = await axios.get(avatarUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      imageBuffer = Buffer.from(imageResponse.data);
      contentType = imageResponse.headers['content-type'] || 'image/jpeg';
    } catch (error) {
      throw new BadRequestException(`Не удалось скачать аватар: ${error.message}`);
    }

    // Загружаем в VK Ads через /api/v2/content/static.json
    try {
      this.logger.log(`Загрузка аватара в VK Ads...`);

      const formData = new FormData();
      formData.append('file', imageBuffer, {
        filename: `group_${vkGroupId}_avatar.jpg`,
        contentType: contentType,
      });

      // Добавляем data с размерами (256x256 для аватара)
      formData.append('data', JSON.stringify({
        width: 256,
        height: 256,
      }));

      const uploadResponse = await axios.post(
        'https://ads.vk.com/api/v2/content/static.json',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 60000,
        },
      );

      if (uploadResponse.data.error) {
        throw new BadRequestException(uploadResponse.data.error.message || JSON.stringify(uploadResponse.data.error));
      }

      const vkContentId = uploadResponse.data.id;
      if (!vkContentId) {
        throw new BadRequestException('Не удалось получить ID загруженного контента');
      }

      this.logger.log(`✅ Логотип сообщества ${vkGroupId} загружен в VK, ID: ${vkContentId}`);

      return {
        vkContentId,
        previewUrl: avatarUrl,
      };
    } catch (error) {
      this.logger.error('Ошибка загрузки логотипа в VK:', error.response?.data || error.message);
      throw new BadRequestException(
        'Ошибка загрузки логотипа в VK: ' + (error.response?.data?.error?.message || error.message)
      );
    }
  }

  /**
   * Загрузить креатив из библиотеки в VK Ads
   * Возвращает VK content ID для использования при создании баннеров
   *
   * КЭШИРОВАНИЕ: Если креатив уже загружен в VK для этого аккаунта,
   * возвращается закэшированный ID без повторной загрузки
   *
   * VK Ads Content API v2:
   * - POST /api/v2/content/static.json для изображений
   * - POST /api/v2/content/video.json для видео
   *
   * Формат: multipart/form-data с полями:
   * - file: файл изображения/видео
   * - data: JSON с размерами {"width": 1612, "height": 980}
   *
   * Ответ: { "variants": {...}, "id": 1084236 }
   */
  async uploadLibraryCreativeToVk(
    userId: number,
    vkAccountId: number,
    libraryCreativeId: number,
    targetContentKey?: 'icon_256x256' | 'image_600x600',  // Явно указываем нужный размер
  ): Promise<{ vkContentId: number; contentKey: string }> {
    // Определяем целевой contentKey
    const requestedContentKey = targetContentKey || 'image_600x600';  // По умолчанию 600x600

    // Проверяем кэш - может креатив уже загружен в VK в нужном размере
    const cached = await this.prisma.vkCreativeCache.findFirst({
      where: {
        libraryCreativeId,
        vkAccountId,
        contentKey: requestedContentKey,
      },
    });

    if (cached) {
      this.logger.log(`✅ Креатив ${libraryCreativeId} уже загружен в VK как ${requestedContentKey} (ID: ${cached.vkContentId}), используем кэш`);
      return {
        vkContentId: cached.vkContentId,
        contentKey: cached.contentKey,
      };
    }

    this.logger.log(`Загрузка креатива ${libraryCreativeId} из библиотеки в VK как ${requestedContentKey}...`);

    // Получаем креатив из библиотеки
    const creativeData = await this.creativesService.getCreativeBuffer(userId, libraryCreativeId);
    if (!creativeData) {
      throw new NotFoundException('Креатив не найден в библиотеке');
    }

    const token = await this.getVkToken(userId, vkAccountId);

    // Определяем тип контента по MIME-типу
    const isVideo = creativeData.mimeType.startsWith('video/');
    let contentKey: string;
    let uploadEndpoint: string;

    // Размеры для ресайза
    let targetSize: number;
    let bufferToUpload = creativeData.buffer;
    let finalWidth = creativeData.width || 600;
    let finalHeight = creativeData.height || 600;

    if (isVideo) {
      contentKey = 'video_portrait_9_16_30s';
      uploadEndpoint = 'https://ads.vk.com/api/v2/content/video.json';
    } else {
      // Используем переданный contentKey или определяем по размеру
      contentKey = requestedContentKey;
      targetSize = requestedContentKey === 'icon_256x256' ? 256 : 600;
      uploadEndpoint = 'https://ads.vk.com/api/v2/content/static.json';

      // Ресайзим изображение до целевого размера (квадрат)
      // VK требует точное соответствие размеров для icon_256x256 и image_600x600
      try {
        this.logger.log(`Ресайз изображения до ${targetSize}x${targetSize}...`);
        bufferToUpload = await sharp(creativeData.buffer)
          .resize(targetSize, targetSize, {
            fit: 'cover',  // Обрезаем по центру чтобы получить квадрат
            position: 'center',
          })
          .jpeg({ quality: 90 })
          .toBuffer();
        finalWidth = targetSize;
        finalHeight = targetSize;
        this.logger.log(`Ресайз завершён: ${bufferToUpload.length} байт`);
      } catch (resizeError) {
        this.logger.error(`Ошибка ресайза: ${resizeError.message}`);
        // Используем оригинал если ресайз не удался
      }
    }

    try {
      this.logger.log(`Загрузка файла: ${creativeData.filename}, MIME: ${creativeData.mimeType}, размер: ${bufferToUpload.length}, ${finalWidth}x${finalHeight}`);
      this.logger.log(`Эндпоинт: ${uploadEndpoint}, contentKey: ${contentKey}`);

      const formData = new FormData();
      formData.append('file', bufferToUpload, {
        filename: creativeData.filename.replace(/\.[^.]+$/, '.jpg'),  // Меняем расширение на jpg после ресайза
        contentType: 'image/jpeg',
      });

      // Добавляем data с размерами (обязательно для VK Content API)
      formData.append('data', JSON.stringify({
        width: finalWidth,
        height: finalHeight,
      }));

      const uploadResponse = await axios.post(
        uploadEndpoint,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          timeout: 180000, // 3 минуты для загрузки видео
        },
      );

      this.logger.log(`Ответ VK API: ${JSON.stringify(uploadResponse.data).substring(0, 500)}`);

      if (uploadResponse.data.error) {
        throw new BadRequestException(uploadResponse.data.error.message || JSON.stringify(uploadResponse.data.error));
      }

      const vkContentId = uploadResponse.data.id;
      if (!vkContentId) {
        throw new BadRequestException('Не удалось получить ID загруженного контента');
      }

      // Сохраняем в кэш для предотвращения повторных загрузок
      await this.prisma.vkCreativeCache.create({
        data: {
          libraryCreativeId,
          vkAccountId,
          vkContentId,
          contentKey,
        },
      });

      this.logger.log(`✅ Креатив загружен в VK, ID: ${vkContentId} (сохранён в кэш)`);

      return { vkContentId, contentKey };
    } catch (error) {
      this.logger.error('Ошибка загрузки креатива в VK:', error.response?.data || error.message);
      this.logger.error('Status:', error.response?.status);
      this.logger.error('URL:', error.config?.url);
      throw new BadRequestException('Ошибка загрузки креатива в VK: ' + (error.response?.data?.error?.message || error.message));
    }
  }

  /**
   * Загрузить несколько креативов из библиотеки в VK
   */
  async uploadLibraryCreativesToVk(
    userId: number,
    vkAccountId: number,
    libraryCreativeIds: number[],
    targetContentKey?: 'icon_256x256' | 'image_600x600',
  ): Promise<Array<{ libraryId: number; vkContentId: number; contentKey: string }>> {
    const results: Array<{ libraryId: number; vkContentId: number; contentKey: string }> = [];

    for (const libraryId of libraryCreativeIds) {
      try {
        const result = await this.uploadLibraryCreativeToVk(userId, vkAccountId, libraryId, targetContentKey);
        results.push({
          libraryId,
          vkContentId: result.vkContentId,
          contentKey: result.contentKey,
        });
        // Небольшая задержка между загрузками чтобы не превысить rate limit
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`Ошибка загрузки креатива ${libraryId}:`, error.message);
        throw error; // Прерываем при первой ошибке
      }
    }

    return results;
  }
}
