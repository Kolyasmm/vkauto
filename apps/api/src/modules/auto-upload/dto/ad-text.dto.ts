import { IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class CreateAdTextDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string; // Опционально - заголовок берётся из названия сообщества

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class UpdateAdTextDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(2000)
  text?: string;
}
