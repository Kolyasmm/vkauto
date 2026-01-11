import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class UpdateRuleDto {
  @IsOptional()
  @IsNumber()
  vkAccountId?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  adAccountId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cplThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minLeads?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  copiesCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  copyBudget?: number; // Бюджет для копий (null = как у оригинала)

  @IsOptional()
  @IsString()
  profitabilityCheck?: string; // "cpl" (по CPL из VK Ads) или "leadstech" (реальная прибыльность через LeadsTech)

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  periodDays?: number; // Период проверки для LeadsTech (1, 3 или 7 дней)

  @IsOptional()
  @IsString()
  runTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
