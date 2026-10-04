import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'patient@carepath.example.com' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;
}
