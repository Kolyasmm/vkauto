import { IsString, IsNotEmpty, IsInt, IsNumber, IsOptional, IsArray, ArrayMinSize, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

// Структура креатива с полными данными для копирования
export class CreativeDataDto {
  @IsNumber()
  id: number;

  @IsNumber()
  bannerId: number;

  @IsString()
  type: string; // 'static' | 'video'

  @IsString()
  contentKey: string;

  @IsObject()
  content: Record<string, any>; // полная структура content

  @IsObject()
  urls: Record<string, any>; // полная структура urls

  @IsNumber()
  packageId: number; // package_id из группы объявлений (для совместимости patterns)

  @IsString()
  objective: string; // objective из группы объявлений
}

export class CreateAutoUploadDto {
  @IsInt()
  vkAccountId: number;

  @IsString()
  @IsNotEmpty()
  campaignName: string;

  // ID сообщества VK
  @IsNumber()
  groupId: number;

  // ID аудитории ретаргетинга (опционально)
  @IsNumber()
  @IsOptional()
  audienceId?: number;

  // ID текста из базы или кастомный текст
  @IsInt()
  @IsOptional()
  adTextId?: number;

  @IsString()
  @IsOptional()
  adTitle?: string; // Опционально - заголовок = название сообщества

  @IsString()
  @IsNotEmpty()
  adText: string;

  // Массив креативов с полными данными (content + urls)
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreativeDataDto)
  creatives: CreativeDataDto[];
}
