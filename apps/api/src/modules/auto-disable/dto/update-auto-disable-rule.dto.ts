import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min } from 'class-validator';

export class UpdateAutoDisableRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  // Тип метрики: clicks (клики), goals (результаты/лиды), ctr, cpl (цена за результат)
  @IsOptional()
  @IsIn(['clicks', 'goals', 'ctr', 'cpl'])
  metricType?: string;

  // Оператор: lt (<), lte (<=), eq (=), gt (>), gte (>=)
  @IsOptional()
  @IsIn(['lt', 'lte', 'eq', 'gt', 'gte'])
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
