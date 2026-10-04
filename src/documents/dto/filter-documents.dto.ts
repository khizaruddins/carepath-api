import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentCategory, DocumentProcessingStatus } from '@prisma/client';

export class FilterDocumentsDto {
  @ApiPropertyOptional({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  @IsOptional()
  category?: DocumentCategory;

  @ApiPropertyOptional({ enum: DocumentProcessingStatus })
  @IsEnum(DocumentProcessingStatus)
  @IsOptional()
  status?: DocumentProcessingStatus;

  @ApiPropertyOptional({ example: 'blood work' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number = 0;
}
