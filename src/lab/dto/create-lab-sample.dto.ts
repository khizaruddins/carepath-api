import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLabSampleDto {
  @ApiProperty({
    description: 'Type of biological specimen collected (e.g. Whole Blood EDTA, Serum, Urine)',
    example: 'Whole Blood EDTA',
  })
  @IsString()
  @IsNotEmpty()
  sampleType: string;

  @ApiProperty({
    description: 'Unique specimen container identifier or vial ID',
    example: 'SMP-2026-9021',
  })
  @IsString()
  @IsNotEmpty()
  sampleIdentifier: string;

  @ApiPropertyOptional({
    description: 'Scanned tube barcode number',
    example: '8901234567890',
  })
  @IsString()
  @IsOptional()
  barcode?: string;

  @ApiPropertyOptional({
    description: 'Collection notes or phlebotomist remarks',
    example: 'Collected from left antecubital vein without complications.',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
