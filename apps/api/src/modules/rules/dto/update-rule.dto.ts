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
  runTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
