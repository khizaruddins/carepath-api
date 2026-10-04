import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DeclineConsentDto {
  @ApiPropertyOptional({
    description: 'Optional reason for declining the consent request',
    example: 'I prefer to share these reports directly during in-person visit.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
