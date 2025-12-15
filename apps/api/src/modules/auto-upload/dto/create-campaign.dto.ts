import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested, IsUrl, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export enum CampaignObjective {
  MESSAGES = 'socialactivity',      // Отправка сообщений
  APP_INSTALLS = 'app_installs',    // Установка приложений
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

// Баннер для цели "Установка приложений"
export class AppInstallsBannerDto {
  @IsNumber()
  creativeId: number;  // ID креатива (логотипа) из кабинета

  @IsString()
  @MaxLength(40)
  title: string;  // Заголовок, до 40 символов

  @IsString()
  @MaxLength(90)
  shortDescription: string;  // Короткое описание, до 90 символов

  @IsString()
  @MaxLength(220)
  longDescription: string;  // Длинное описание, до 220 символов

  @IsString()
  @MaxLength(30)
  buttonText: string;  // Текст рядом с кнопкой, до 30 символов

  @IsUrl()
  trackingUrl: string;  // Трекинговая ссылка

  @IsEnum(CallToAction)
  callToAction: CallToAction;  // Надпись на кнопке
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

  // ID группы ВКонтакте для рекламы сообщений
  @IsOptional()
  @IsNumber()
  vkGroupId?: number;

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
  @Type(() => AppInstallsBannerDto)
  appInstallsBanner?: AppInstallsBannerDto;
}

// DTO для получения креативов из кабинета
export class GetCreativesDto {
  @IsNumber()
  vkAccountId: number;

  @IsOptional()
  @IsString()
  contentType?: string;  // image, video
}
