import { Test, TestingModule } from '@nestjs/testing';
import { TimelineController, PatientTimelineController } from './timeline.controller';
import { HealthcareTimelineService } from './healthcare-timeline.service';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { Request } from 'express';

describe('TimelineController & PatientTimelineController', () => {
  let timelineController: TimelineController;
  let patientTimelineController: PatientTimelineController;
  let timelineService: HealthcareTimelineService;

  const mockTimelineService = {
    getPatientTimeline: jest.fn(),
    getTimelineEventDetails: jest.fn(),
    backfillTimeline: jest.fn(),
  };

  const patientUser: AuthenticatedUser = {
    id: 'patient-1',
    email: 'patient@carepath.io',
    role: Role.PATIENT,
    status: 'ACTIVE',
  };

  const doctorUser: AuthenticatedUser = {
    id: 'doctor-1',
    email: 'doctor@carepath.io',
    role: Role.DOCTOR,
    status: 'ACTIVE',
  };

  const mockRequest = {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'Jest-Test' },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimelineController, PatientTimelineController],
      providers: [
        {
          provide: HealthcareTimelineService,
          useValue: mockTimelineService,
        },
      ],
    }).compile();

    timelineController = module.get<TimelineController>(TimelineController);
    patientTimelineController = module.get<PatientTimelineController>(PatientTimelineController);
    timelineService = module.get<HealthcareTimelineService>(HealthcareTimelineService);
  });

  describe('getMyTimeline (GET /api/v1/timeline)', () => {
    it('delegates to timelineService.getPatientTimeline with patient ID', async () => {
      const mockResult = { items: [], nextCursor: null, hasMore: false, total: 0 };
      mockTimelineService.getPatientTimeline.mockResolvedValue(mockResult);

      const result = await timelineController.getMyTimeline(patientUser, {}, mockRequest);

      expect(result).toBe(mockResult);
      expect(mockTimelineService.getPatientTimeline).toHaveBeenCalledWith(
        'patient-1',
        {},
        patientUser,
        '127.0.0.1',
        'Jest-Test',
      );
    });
  });

  describe('getTimelineEventDetails (GET /api/v1/timeline/:id)', () => {
    it('delegates to timelineService.getTimelineEventDetails with event ID', async () => {
      const mockDetails = { event: { id: 'ev-1' }, resolvedSource: null };
      mockTimelineService.getTimelineEventDetails.mockResolvedValue(mockDetails);

      const result = await timelineController.getTimelineEventDetails(patientUser, 'ev-1', mockRequest);

      expect(result).toBe(mockDetails);
      expect(mockTimelineService.getTimelineEventDetails).toHaveBeenCalledWith(
        'ev-1',
        patientUser,
        '127.0.0.1',
        'Jest-Test',
      );
    });
  });

  describe('backfillTimeline (POST /api/v1/timeline/backfill)', () => {
    it('triggers timeline backfill', async () => {
      mockTimelineService.backfillTimeline.mockResolvedValue(42);

      const result = await timelineController.backfillTimeline();

      expect(result).toEqual({
        message: 'Healthcare timeline projection backfill completed successfully',
        projectedCount: 42,
      });
      expect(mockTimelineService.backfillTimeline).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getPatientTimelineForDoctor (GET /api/v1/patients/:patientId/timeline)', () => {
    it('delegates to timelineService.getPatientTimeline with clinician actor', async () => {
      const mockResult = { items: [], nextCursor: null, hasMore: false, total: 0 };
      mockTimelineService.getPatientTimeline.mockResolvedValue(mockResult);

      const result = await patientTimelineController.getPatientTimelineForDoctor(
        doctorUser,
        'patient-1',
        {},
        mockRequest,
      );

      expect(result).toBe(mockResult);
      expect(mockTimelineService.getPatientTimeline).toHaveBeenCalledWith(
        'patient-1',
        {},
        doctorUser,
        '127.0.0.1',
        'Jest-Test',
      );
    });
  });
});
