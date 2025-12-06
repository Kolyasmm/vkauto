import { IsString, MinLength } from 'class-validator';

export class CreateVkAccountDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(10)
  accessToken: string;
}
