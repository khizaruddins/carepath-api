import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
import { ConsentsService } from './consents.service';
import { CreateConsentDto } from './dto/create-consent.dto';
import { DeclineConsentDto } from './dto/decline-consent.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';
import { QueryConsentsDto } from './dto/query-consents.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserStatusGuard } from '../common/guards/user-status.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Role, ConsentStatus } from '@prisma/client';

@ApiTags('Consents & Secure Sharing')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, UserStatusGuard, RolesGuard)
@Controller('consents')
export class ConsentsController {
  constructor(private readonly consentsService: ConsentsService) {}

  @Post()
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Clinician requests scoped consent to access patient medical records' })
  @ApiResponse({ status: 201, description: 'Consent request created and pending patient approval' })
  async requestConsent(
    @CurrentUser() doctor: AuthenticatedUser,
    @Body() dto: CreateConsentDto,
    @Req() req: Request,
  ) {
    return this.consentsService.createConsentRequest(
      doctor,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Get()
  @ApiOperation({ summary: 'List consents for authenticated user (role-filtered)' })
  @ApiResponse({ status: 200, description: 'List of consents with pagination' })
  async getConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryConsentsDto,
  ) {
    return this.consentsService.getConsents(user, query);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending consent requests awaiting review' })
  @ApiResponse({ status: 200, description: 'Pending consent requests' })
  async getPendingConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.consentsService.getConsents(user, {
      status: ConsentStatus.PENDING,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('active')
  @ApiOperation({ summary: 'List active approved consents with valid expiration' })
  @ApiResponse({ status: 200, description: 'Active authorized consents' })
  async getActiveConsents(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.consentsService.getConsents(user, {
      status: ConsentStatus.APPROVED,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'List historical consents (revoked, expired, declined)' })
  @ApiResponse({ status: 200, description: 'Historical consents' })
  async getConsentHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.consentsService.getConsents(user, {
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('requests')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Clinician lists consent requests they have submitted' })
  @ApiResponse({ status: 200, description: 'Clinician consent requests' })
  async getDoctorConsentRequests(
    @CurrentUser() doctor: AuthenticatedUser,
    @Query() query: QueryConsentsDto,
  ) {
    return this.consentsService.getConsents(doctor, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get consent grant details and scopes' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Consent details' })
  async getConsentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consentsService.getConsentById(user, id);
  }

  @Get(':id/resources')
  @ApiOperation({ summary: 'Get concrete medical documents encompassed by consent scope' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Resolved resources under consent scope' })
  async getConsentResources(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consentsService.getConsentResources(user, id);
  }

  @Post(':id/approve')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient approves pending consent request' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Consent approved and access granted' })
  async approveConsent(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.consentsService.approveConsent(
      patient,
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/decline')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient declines pending consent request' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Consent declined' })
  async declineConsent(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeclineConsentDto,
    @Req() req: Request,
  ) {
    return this.consentsService.declineConsent(
      patient,
      id,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/revoke')
  @Roles(Role.PATIENT)
  @ApiOperation({ summary: 'Patient revokes active approved consent immediately' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Consent revoked and clinician access terminated' })
  async revokeConsent(
    @CurrentUser() patient: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeConsentDto,
    @Req() req: Request,
  ) {
    return this.consentsService.revokeConsent(
      patient,
      id,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post(':id/cancel')
  @Roles(Role.DOCTOR)
  @ApiOperation({ summary: 'Clinician cancels their own pending consent request' })
  @ApiParam({ name: 'id', description: 'Consent UUID' })
  @ApiResponse({ status: 200, description: 'Consent request cancelled' })
  async cancelConsent(
    @CurrentUser() doctor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.consentsService.cancelConsent(
      doctor,
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
