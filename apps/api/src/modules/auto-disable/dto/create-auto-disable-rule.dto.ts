import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min } from 'class-validator';

export class CreateAutoDisableRuleDto {
  @IsString()
  name: string;

  @IsNumber()
  vkAccountId: number;

  @IsIn(['cpc', 'ctr', 'cpl', 'conversions'])
  metricType: string;

  @IsIn(['gte', 'lt'])
  operator: string;

  @IsNumber()
  @Min(0)
  threshold: number;

  @IsIn([1, 3, 7])
  periodDays: number;

  @IsNumber()
  @Min(0)
  minSpent: number;

  @IsOptional()
  @IsString()
  runTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
