import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkService } from '../vk/vk.service';
import { CreateCampaignDto, CampaignObjective, CallToAction } from './dto/create-campaign.dto';
import axios from 'axios';

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

      // Разрешённые contentKey - только оригинальные креативы
      // Исключаем автоматически созданные VK (ресайзы 4:5, landscape, видео из картинок)
      const allowedContentKeys = [
        'icon_256x256',                    // Логотипы
        'video_portrait_9_16_30s',         // Вертикальное видео 9:16 (30 сек)
        'video_portrait_9_16_180s',        // Вертикальное видео 9:16 (180 сек)
        'image_600x600',                   // Квадратные картинки 600x600
        'image_1080x1080',                 // Квадратные картинки 1080x1080
      ];

      // Собираем уникальные креативы
      for (const banner of banners) {
        if (!banner.content) continue;

        for (const [contentKey, contentData] of Object.entries(banner.content)) {
          if (!contentData || typeof contentData !== 'object') continue;

          const data = contentData as any;
          if (!data.id) continue;

          // Фильтруем - только разрешённые типы креативов
          if (!allowedContentKeys.includes(contentKey)) continue;

          // Проверяем что креатив еще не добавлен
          if (creativesMap.has(data.id)) continue;

          // Определяем тип креатива
          const type = data.type === 'video' ? 'video' : 'image';

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
    // Цель кампании в интерфейсе VK Ads определяется не objective, а комбинацией package_id + CTA
    const packageMapping: Record<string, { packageId: number; vkObjective: string }> = {
      'socialactivity': { packageId: 3127, vkObjective: 'socialengagement' },  // Написать в сообщество (с CTA "contactUs")
      'app_installs': { packageId: 2861, vkObjective: 'app_installs' },        // Установка приложений (Android)
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
   * Получить список интересов для таргетинга
   * GET /api/v2/targetings_tree.json?targetings=interests
   */
  async getInterests(_userId: number, _vkAccountId: number): Promise<any[]> {
    // Возвращаем хардкод интересов: Финансы (7311) и Микрозаймы (9285)
    this.logger.log('Возвращаем хардкод интересов: Финансы и Микрозаймы');
    return [
      {
        id: 7311,
        name: 'Финансы',
        no_checkbox: false,
        children: [
          {
            id: 9285,
            name: 'Микрозаймы',
            no_checkbox: false,
            synonyms: ['Микрокредиты', 'Быстроденьги'],
          },
        ],
      },
    ];
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

      // Проверяем, что для сообщений указана группа VK
      if (dto.objective === CampaignObjective.MESSAGES) {
        if (!dto.vkGroupId) {
          throw new BadRequestException('Для цели "Сообщения" необходимо указать группу VK');
        }
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
          const content: Record<string, any> = {};

          // Логотип всегда нужен
          if (banner.creativeId) {
            content.icon_256x256 = { id: banner.creativeId };
          }

          // Добавляем основной креатив (картинку или видео)
          if (isVideo) {
            content[contentKey] = { id: creativeId };
            // Также добавляем альтернативный формат если это 30s
            if (contentKey === 'video_portrait_9_16_30s') {
              content['video_portrait_9_16_180s'] = { id: creativeId };
            }
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
        } else if (dto.objective === CampaignObjective.APP_INSTALLS && dto.appInstallsBanner) {
          const banner = dto.appInstallsBanner;
          bannerData = {
            content: {
              icon_256x256: { id: creativeId },
            },
            textblocks: {
              title_40_vkads: { text: banner.title },
              text_90: { text: banner.shortDescription },
              text_220: { text: banner.longDescription },
              text_30: { text: banner.buttonText },
            },
            call_to_action: banner.callToAction,
          };
          if (urlId) {
            bannerData.urls = { primary: { id: urlId } };
          }
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
          // UTM метки (реф-метки) - включаем автоматически
          enable_utm: true,
          utm: 'ref_source={{banner_id}}&ref=vkads',
          // Примечание: VK API не поддерживает явное указание placements через API
          // Места размещения определяются автоматически на основе package_id
        };

        adGroups.push(adGroupData);
      }

      // Формируем запрос создания кампании
      const requestData: Record<string, any> = {
        name: dto.campaignName,
        status: 'active',
        objective: vkObjective,
        ad_groups: adGroups,
      };

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
  private generateFulltime(fromHour: number, toHour: number): Record<string, number[]> {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const hours: number[] = [];
    for (let h = fromHour; h <= toHour; h++) {
      hours.push(h);
    }
    const fulltime: Record<string, number[]> = {};
    for (const day of days) {
      fulltime[day] = hours;
    }
    return fulltime;
  }
}
