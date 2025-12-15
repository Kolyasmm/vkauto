import { IsString, IsNumber, IsOptional, IsBoolean, IsIn, Min } from 'class-validator';

export class CreateAutoDisableRuleDto {
  @IsString()
  name: string;

  @IsNumber()
  vkAccountId: number;

  // Тип метрики: clicks (клики), goals (результаты/лиды), ctr, cpl (цена за результат)
  @IsIn(['clicks', 'goals', 'ctr', 'cpl'])
  metricType: string;

  // Оператор: lt (<), lte (<=), eq (=), gt (>), gte (>=)
  @IsIn(['lt', 'lte', 'eq', 'gt', 'gte'])
  operator: string;

  // Пороговое значение метрики (клики < 2, результаты < 3, CTR < 0.1)
  @IsNumber()
  @Min(0)
  threshold: number;

  @IsIn([1, 3, 7])
  periodDays: number;

  // ГЛАВНОЕ УСЛОВИЕ: минимальный потраченный бюджет для срабатывания
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
