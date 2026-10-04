import { Injectable, Logger, NotFoundException, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationType, NotificationChannel } from '@prisma/client';
import { NotificationsGateway } from './notifications.gateway';

export interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  channel?: NotificationChannel;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => NotificationsGateway))
    private readonly notificationsGateway?: NotificationsGateway,
  ) {}

  /**
   * Dispatch an in-app and abstract multi-channel notification
   */
  async sendNotification(params: SendNotificationParams) {
    try {
      const channel = params.channel || NotificationChannel.IN_APP;

      const notification = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          type: params.type,
          title: params.title,
          message: params.message,
          channel,
          metadata: params.metadata || {},
        },
      });

      // Emit realtime WebSocket update to user's connected socket sessions
      try {
        this.notificationsGateway.sendNotification(params.userId, notification);
      } catch (wsErr) {
        this.logger.warn(`Failed to push realtime WS event for notification ${notification.id}: ${wsErr.message}`);
      }

      // Abstract hooks for future external channels (SMS, Email, WhatsApp)
      if (channel === NotificationChannel.EMAIL) {
        this.logger.log(`[EXTERNAL_EMAIL] To: ${params.userId} | ${params.title}`);
      } else if (channel === NotificationChannel.WHATSAPP) {
        this.logger.log(`[EXTERNAL_WHATSAPP] To: ${params.userId} | ${params.title}`);
      } else if (channel === NotificationChannel.SMS) {
        this.logger.log(`[EXTERNAL_SMS] To: ${params.userId} | ${params.title}`);
      }

      return notification;
    } catch (error) {
      this.logger.error(`Failed to dispatch notification to user ${params.userId}: ${error.message}`);
      // Notifications must not crash primary transactional workflows
    }
  }

  /**
   * Send an arbitrary realtime action event (e.g. cache invalidation trigger)
   */
  sendRealtimeAction(userId: string, event: string, data: any) {
    try {
      this.notificationsGateway.sendToUser(userId, event, data);
    } catch (err) {
      this.logger.warn(`Failed to send realtime action to user ${userId}: ${err.message}`);
    }
  }

  /**
   * Get user notifications with pagination and unread filter
   */
  async getUserNotifications(userId: string, limit = 20, offset = 0, isRead?: boolean) {
    const where: any = { userId };
    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [total, unreadCount, notifications] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        skip: offset,
      }),
    ]);

    return {
      total,
      limit,
      offset,
      unreadCount,
      notifications,
    };
  }

  /**
   * Get count of unread notifications
   */
  async getUnreadCount(userId: string): Promise<{ count: number; unreadCount: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count, unreadCount: count };
  }

  /**
   * Mark a specific notification as read
   */
  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      message: 'All notifications marked as read',
      updatedCount: result.count,
    };
  }
}
