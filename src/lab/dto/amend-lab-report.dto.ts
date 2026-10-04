import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AmendLabReportDto {
  @ApiProperty({
    description: 'Mandatory formal clinical justification for amending a previously finalized report',
    example: 'Instrument recalibration post-routine QA; Platelet count revised from 250k to 265k.',
  })
  @IsString()
  @IsNotEmpty()
  amendedReason: string;

  @ApiProperty({
    description: 'Revised diagnostic test findings summary',
    example: 'Hemoglobin: 14.2 g/dL (Normal). Platelets: 265,000 /uL (Revised Normal). WBC: 7,200 /uL.',
  })
  @IsString()
  @IsNotEmpty()
  testSummary: string;

  @ApiPropertyOptional({
    description: 'Pathologist clinical interpretation remarks for the amendment',
    example: 'Recalculated post quality check. Clinical interpretation unchanged.',
  })
  @IsString()
  @IsOptional()
  clinicalNotes?: string;

  @ApiPropertyOptional({
    description: 'Document ID of the newly generated amended signed PDF report in storage',
    example: '550e8400-e29b-41d4-a716-446655440005',
  })
  @IsUUID()
  @IsOptional()
  documentId?: string;
}
