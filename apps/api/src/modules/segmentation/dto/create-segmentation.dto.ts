import { IsInt, IsArray, IsOptional, ArrayMinSize, ArrayMaxSize, Min } from 'class-validator';

export class CreateSegmentationDto {
  @IsInt()
  vkAccountId: number;

  @IsInt()
  sourceAdGroupId: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Выберите хотя бы одну аудиторию' })
  @ArrayMaxSize(50, { message: 'Максимум 50 аудиторий за раз' })
  @IsInt({ each: true })
  audienceIds: number[];

  @IsOptional()
  @IsInt()
  interestId?: number;

  @IsOptional()
  @IsInt()
  socDemInterestId?: number;
}
