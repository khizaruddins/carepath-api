import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../database/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness and database health status' })
  @ApiResponse({ status: 200, description: 'Application is healthy' })
  async check() {
    let dbStatus = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (e: any) {
      dbStatus = 'unreachable';
    }

    return {
      status: 'ok',
      service: 'carepath-backend',
      milestone: 'Milestone 1: Patient Health Vault',
      timestamp: new Date().toISOString(),
      database: dbStatus,
      uptimeSeconds: process.uptime(),
    };
  }
}
