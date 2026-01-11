import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export enum CampaignObjective {
  MESSAGES = 'socialactivity',      // Отправка сообщений
  LEAD_FORM = 'lead_form',          // Лид-форма
  APP_INSTALLS = 'appinstalls',     // Установка мобильного приложения
}

export enum CallToAction {
  READ_MORE = 'read_more',      // Подробнее
  WRITE = 'write',              // Написать
  APPLY = 'apply',              // Подать заявку
  REGISTER = 'register',        // Зарегистрироваться
  GET = 'get',                  // Получить
  DOWNLOAD = 'download',        // Скачать
  INSTALL = 'install',          // Установить
  OPEN = 'open',                // Открыть
  BUY = 'buy',                  // Купить
  ORDER = 'order',              // Заказать
}

// Баннер для цели "Отправка сообщений"
export class MessagesBannerDto {
  @IsNumber()
  @IsOptional()
  creativeId?: number;  // ID креатива (логотипа) из кабинета - опциональный

  @IsString()
  @MaxLength(40)
  title: string;  // Заголовок, до 40 символов

  @IsString()
  @MaxLength(2000)
  description: string;  // Описание, до 2000 символов

  @IsEnum(CallToAction)
  callToAction: CallToAction;  // Надпись на кнопке
}

// Баннер для цели "Лид-форма" (package 3215)
export class LeadFormBannerDto {
  @IsNumber()
  @IsOptional()
  creativeId?: number;  // ID креатива (логотипа) из кабинета - опциональный (icon_256x256)

  @IsNumber()
  @IsOptional()
  imageCreativeId?: number;  // ID креатива изображения (image_600x600)

  @IsString()
  @MaxLength(40)
  title: string;  // Заголовок, до 40 символов (title_40_vkads)

  @IsString()
  @MaxLength(90)
  shortDescription: string;  // Короткое описание, до 90 символов (text_90)

  @IsString()
  @MaxLength(220)
  longDescription: string;  // Длинное описание, до 220 символов (text_220, text_long)

  @IsString()
  @MaxLength(30)
  @IsOptional()
  buttonText?: string;  // Текст кнопки (title_30_additional), по умолчанию "Получить займ"

  @IsEnum(CallToAction)
  callToAction: CallToAction;  // CTA для кнопки (cta_leadads)
}

// Баннер для цели "Установка приложения"
export class AppInstallsBannerDto {
  @IsNumber()
  @IsOptional()
  iconCreativeId?: number;  // ID креатива иконки приложения (icon_256x256_app)

  @IsNumber()
  @IsOptional()
  imageCreativeId?: number;  // ID креатива изображения (image_600x600)

  @IsString()
  @MaxLength(40)
  title: string;  // Название приложения, до 40 символов (title_40_vkads)

  @IsString()
  @MaxLength(90)
  shortDescription: string;  // Короткий текст, до 90 символов (text_90)

  @IsString()
  @MaxLength(220)
  longDescription: string;  // Длинный текст, до 220 символов (text_220)

  @IsString()
  @MaxLength(30)
  @IsOptional()
  ctaText?: string;  // Текст кнопки CTA (title_30_additional), по умолчанию "Установить"
}

export class CreateCampaignDto {
  @IsNumber()
  vkAccountId: number;

  @IsString()
  @MaxLength(255)
  campaignName: string;

  @IsEnum(CampaignObjective)
  objective: CampaignObjective;

  @IsNumber()
  @Min(100)
  dailyBudget: number;  // Дневной бюджет группы в рублях

  // Информация о рекламодателе (обязательно для модерации)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  advertiserName?: string;  // Название рекламодателя (например, ООО "ЛИДСТЕХ")

  @IsOptional()
  @IsString()
  @MaxLength(12)
  advertiserInn?: string;  // ИНН рекламодателя (например, 6316264152)

  // Гео - копируем из существующих групп или дефолт (Россия)
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  geoRegions?: number[];

  // Возраст 21-50 по дефолту
  @IsOptional()
  @IsNumber()
  @Min(18)
  @Max(65)
  ageFrom?: number;

  @IsOptional()
  @IsNumber()
  @Min(18)
  @Max(65)
  ageTo?: number;

  // ID группы ВКонтакте для рекламы сообщений (устаревшее, используйте vkGroupUrl)
  @IsOptional()
  @IsNumber()
  vkGroupId?: number;

  // URL группы ВКонтакте (например https://vk.com/zaymptichka)
  // Можно передать полный URL или shortname (zaymptichka)
  @IsOptional()
  @IsString()
  vkGroupUrl?: string;

  // package_id - копируем из существующих групп
  @IsOptional()
  @IsNumber()
  packageId?: number;

  // URL ссылки (для objectives где нужна ссылка)
  @IsOptional()
  @IsNumber()
  urlId?: number;

  // UTM метки (для сообщений)
  @IsOptional()
  @IsString()
  utmParams?: string;

  // Массив ID сегментов аудитории (из /api/v2/remarketing/segments.json)
  // Положительные значения = включить сегмент, отрицательные = исключить
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  segmentIds?: number[];

  // Массив ID интересов (из /api/v2/targetings_tree.json?targetings=interests)
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  interestIds?: number[];

  // Массив ID соц-дем интересов (из /api/v2/targetings_tree.json?targetings=interests_soc_dem)
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  socDemInterestIds?: number[];

  // Название группы объявлений (опционально, по умолчанию "группа 1", "группа 2" и т.д.)
  @IsOptional()
  @IsString()
  @MaxLength(255)
  adGroupName?: string;

  // Массив названий баннеров (соответствует creativeIds)
  // Если не указано - используются автоматически сгенерированные названия
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bannerNames?: string[];

  // Массив ID креативов (до 10 штук) - каждый креатив в отдельной группе
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  creativeIds?: number[];

  // Массив contentKey креативов (соответствует creativeIds) - для определения типа контента
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  creativeContentKeys?: string[];

  // Дата начала показа (для запланированных кампаний) - формат YYYY-MM-DD
  @IsOptional()
  @IsString()
  dateStart?: string;

  // Данные баннера - зависят от objective (общие тексты для всех групп)
  @IsOptional()
  @ValidateNested()
  @Type(() => MessagesBannerDto)
  messagesBanner?: MessagesBannerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadFormBannerDto)
  leadFormBanner?: LeadFormBannerDto;

  // ID лид-формы из кабинета (для objective = LEAD_FORM)
  @IsOptional()
  @IsString()
  leadFormId?: string;

  // Данные баннера для мобильного приложения
  @IsOptional()
  @ValidateNested()
  @Type(() => AppInstallsBannerDto)
  appInstallsBanner?: AppInstallsBannerDto;

  // URL трекера (AppsFlyer, Adjust и т.д.) для objective = APP_INSTALLS
  // Пример: https://app.appsflyer.com/com.app.id?pid=vk&c={{campaign_name}}
  @IsOptional()
  @IsString()
  appTrackerUrl?: string;

  // Bundle ID приложения (например: com.ptichka.nalichka.zaim)
  @IsOptional()
  @IsString()
  appBundleId?: string;

  // Массив ID версий мобильных ОС для таргетинга
  // По умолчанию Android 8+: [208,207,169,83,87,48,80,206,47,199,105,127]
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  mobileOperatingSystems?: number[];

  // Массив ID площадок (pads) для размещения
  // Если не указано - используется дефолтное значение для objective
  // Известные ID: 1342048 (лид-формы), 1554146 (приложения)
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  pads?: number[];

  // Использовать автоплейсмент (все площадки)
  // Если true - не передаем pads в таргетинги
  @IsOptional()
  autoPlacement?: boolean;
}

// DTO для получения креативов из кабинета
export class GetCreativesDto {
  @IsNumber()
  vkAccountId: number;

  @IsOptional()
  @IsString()
  contentType?: string;  // image, video
}
