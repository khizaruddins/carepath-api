import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvestigationDto {
  @ApiProperty({ description: 'Name of laboratory test or diagnostic study', example: 'Complete Blood Count (CBC) with Differential' })
  @IsString()
  @IsNotEmpty()
  investigationName: string;

  @ApiPropertyOptional({ description: 'Category (LABORATORY, IMAGING, OTHER)', example: 'LABORATORY' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ description: 'Clinical reason or indication for test', example: 'Rule out anemia and check platelet count' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Clinical priority (ROUTINE, URGENT, STAT)', example: 'ROUTINE' })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({ description: 'Specific diagnostic preparation or clinical instructions' })
  @IsString()
  @IsOptional()
  notes?: string;
}
