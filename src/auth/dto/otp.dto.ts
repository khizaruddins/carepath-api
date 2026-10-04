import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsPhoneNumber, IsString, Length } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phoneNumber: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phoneNumber: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 6 })
  @IsString()
  @Length(6, 6, { message: 'OTP must be a 6-digit code' })
  code: string;
}
