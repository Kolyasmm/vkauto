import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min } from 'class-validator';

export class UpdateAutoDisableRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['cpc', 'ctr', 'cpl', 'conversions'])
  metricType?: string;

  @IsOptional()
  @IsIn(['gte', 'lte'])
  operator?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  threshold?: number;

  @IsOptional()
  @IsIn([1, 3, 7])
  periodDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpent?: number;

  @IsOptional()
  @IsString()
  runTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
