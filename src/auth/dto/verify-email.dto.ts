import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ example: 'verification-token-string' })
  @IsString()
  @IsNotEmpty({ message: 'Verification token is required' })
  token: string;
}
