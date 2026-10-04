import { IsOptional, IsString } from 'class-validator';

export class RevokeLabCareConnectionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
