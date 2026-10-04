import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { HealthcareTimelineService } from './healthcare-timeline.service';
import { QueryTimelineDto } from './dto/query-timeline.dto';
import { TimelineResponseDto } from './dto/timeline-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Timeline 2.0')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller('timeline')
export class TimelineController {
  constructor(private readonly timelineService: HealthcareTimelineService) {}

  @Get()
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient retrieves their own longitudinal healthcare timeline' })
  @ApiResponse({ status: 200, type: TimelineResponseDto, description: 'Chronological timeline events' })
  async getMyTimeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTimelineDto,
    @Req() req: Request,
  ): Promise<TimelineResponseDto> {
    return this.timelineService.getPatientTimeline(
      user.id,
      query,
      user,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Retrieve specific timeline event with resolved source details' })
  @ApiParam({ name: 'id', description: 'Timeline event UUID' })
  @ApiResponse({ status: 200, description: 'Timeline event with permitted clinical details' })
  async getTimelineEventDetails(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.timelineService.getTimelineEventDetails(
      id,
      user,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('backfill')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin/Internal trigger to reconcile and backfill timeline projections' })
  @ApiResponse({ status: 200, description: 'Backfill completed' })
  async backfillTimeline(
    @Query('patientId') patientId?: string,
  ) {
    const projectedCount = await this.timelineService.backfillTimeline(patientId);
    return {
      message: 'Healthcare timeline projection backfill completed successfully',
      projectedCount,
    };
  }
}

@ApiTags('Timeline 2.0')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller('patients')
export class PatientTimelineController {
  constructor(private readonly timelineService: HealthcareTimelineService) {}

  @Get(':patientId/timeline')
  @Roles(Role.DOCTOR, Role.ADMIN)
  @ApiOperation({
    summary: 'Clinician retrieves patient timeline with active consent scope filtering',
  })
  @ApiParam({ name: 'patientId', description: 'Patient user UUID' })
  @ApiResponse({ status: 200, type: TimelineResponseDto, description: 'Consent-scoped timeline events' })
  async getPatientTimelineForDoctor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: QueryTimelineDto,
    @Req() req: Request,
  ): Promise<TimelineResponseDto> {
    return this.timelineService.getPatientTimeline(
      patientId,
      query,
      actor,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
