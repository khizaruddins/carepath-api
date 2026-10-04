import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationType, NotificationChannel } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';

describe('NotificationsService (M3 Communication & Reminders)', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  const userId = 'user-uuid-1';

  it('sendNotification creates notification record', async () => {
    mockPrisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      userId,
      type: NotificationType.CONSENT_REQUESTED,
      title: 'Consent Request',
      message: 'Dr. Ali requested access',
      channel: NotificationChannel.IN_APP,
      isRead: false,
    });

    const result = await service.sendNotification({
      userId,
      type: NotificationType.CONSENT_REQUESTED,
      title: 'Consent Request',
      message: 'Dr. Ali requested access',
    });

    expect(result).toBeDefined();
    expect(result?.id).toBe('notif-1');
  });

  it('getUserNotifications returns paginated notifications and total count', async () => {
    mockPrisma.notification.count.mockResolvedValue(1);
    mockPrisma.notification.findMany.mockResolvedValue([
      { id: 'notif-1', userId, isRead: false },
    ]);

    const result = await service.getUserNotifications(userId, 20, 0);

    expect(result.total).toBe(1);
    expect(result.notifications.length).toBe(1);
  });

  it('getUnreadCount returns correct unread count', async () => {
    mockPrisma.notification.count.mockResolvedValue(3);

    const result = await service.getUnreadCount(userId);
    expect(result.count).toBe(3);
  });

  it('markAsRead updates notification state to read', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'notif-1',
      userId,
      isRead: false,
    });
    mockPrisma.notification.update.mockResolvedValue({
      id: 'notif-1',
      userId,
      isRead: true,
      readAt: new Date(),
    });

    const result = await service.markAsRead(userId, 'notif-1');
    expect(result.isRead).toBe(true);
  });

  it('markAsRead throws NotFoundException if notification does not belong to user', async () => {
    mockPrisma.notification.findUnique.mockResolvedValue({
      id: 'notif-1',
      userId: 'other-user',
    });

    await expect(service.markAsRead(userId, 'notif-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('markAllAsRead marks all unread notifications as read', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.markAllAsRead(userId);
    expect(result.updatedCount).toBe(5);
  });
});
