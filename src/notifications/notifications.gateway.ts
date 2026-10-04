import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized on / namespace');
  }

  async handleConnection(client: Socket) {
    try {
      const rawToken =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (!rawToken || typeof rawToken !== 'string') {
        this.logger.warn(`Rejected connection from ${client.id}: Missing authentication token`);
        client.disconnect(true);
        return;
      }

      const token = rawToken.startsWith('Bearer ') ? rawToken.slice(7) : rawToken;
      const secret =
        this.configService.get<string>('jwt.accessSecret') ||
        'carepath_default_access_secret_123';

      const payload = this.jwtService.verify(token, { secret });
      const userId = payload.sub || payload.id;

      if (!payload || !userId) {
        this.logger.warn(`Rejected connection from ${client.id}: Invalid token payload (missing user ID)`);
        client.disconnect(true);
        return;
      }

      // Normalize user payload
      payload.id = userId;
      client.data.user = payload;

      // Join user specific room and role room
      const userRoom = `user:${userId}`;
      const roleRoom = `role:${payload.role}`;
      await client.join([userRoom, roleRoom]);

      this.logger.log(
        `Client connected: ${client.id} -> User ${userId} (${payload.role}) joined ${userRoom}`,
      );

      // Acknowledge connection
      client.emit('connected', {
        status: 'ok',
        userId,
        role: payload.role,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.warn(
        `Authentication failed for socket ${client.id}: ${error.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.user?.id;
    this.logger.log(
      `Client disconnected: ${client.id}${userId ? ` (User: ${userId})` : ''}`,
    );
  }

  /**
   * Send notification event to a specific user across all connected sessions/tabs
   */
  sendNotification(userId: string, notification: any) {
    if (!this.server) {
      this.logger.warn('WebSocket server not ready yet to send notification');
      return;
    }

    const room = `user:${userId}`;
    this.logger.log(`Emitting realtime notification to ${room}: ${notification.title}`);

    // Main standard event
    this.server.to(room).emit('notification:new', notification);

    // Type-specific event for instant granular handler invalidation
    if (notification.type) {
      this.server
        .to(room)
        .emit(`notification:${String(notification.type).toLowerCase()}`, notification);
    }
  }

  /**
   * Send arbitrary realtime domain action event to a specific user
   */
  sendToUser(userId: string, event: string, data: any) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Broadcast arbitrary realtime domain action event to all users with a specific role
   */
  sendToRole(role: string, event: string, data: any) {
    if (!this.server) return;
    this.server.to(`role:${role}`).emit(event, data);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }
}
