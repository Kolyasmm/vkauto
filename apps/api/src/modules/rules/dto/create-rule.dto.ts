import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateRuleDto {
  @IsOptional()
  @IsNumber()
  vkAccountId?: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  adAccountId?: number;

  @IsNumber()
  @Min(0)
  cplThreshold: number;

  @IsNumber()
  @Min(1)
  minLeads: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  copiesCount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  copyBudget?: number; // Бюджет для копий (null = как у оригинала)

  @IsString()
  runTime: string; // формат HH:MM

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
