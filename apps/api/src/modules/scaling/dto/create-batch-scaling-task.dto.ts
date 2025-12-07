import { IsNumber, IsInt, Min, Max, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateBatchScalingTaskDto {
  @IsNumber()
  vkAccountId: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsNumber({}, { each: true })
  adGroupIds: number[];

  @IsInt()
  @Min(1)
  @Max(15)
  copiesCount: number;
}
