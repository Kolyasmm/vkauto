import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export enum AiLaunchObjective {
  MESSAGES = 'socialactivity',
  LEAD_FORM = 'lead_form',
  APP_INSTALLS = 'appinstalls',
}

export class QuickLaunchDto {
  @IsEnum(AiLaunchObjective)
  objective: AiLaunchObjective;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  campaignName?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  dailyBudget?: number;

  @IsOptional()
  @IsString()
  strategy?: 'popularity_v1';
}
