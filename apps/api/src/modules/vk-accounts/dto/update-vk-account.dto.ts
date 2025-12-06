import { IsString, IsOptional, IsBoolean, MinLength } from 'class-validator';

export class UpdateVkAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  accessToken?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
