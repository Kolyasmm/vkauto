import { IsNumber, IsInt, Min, Max } from 'class-validator';

export class CreateScalingTaskDto {
  @IsNumber()
  vkAccountId: number;

  @IsNumber()
  adGroupId: number;

  @IsInt()
  @Min(1)
  @Max(15)
  copiesCount: number;
}
