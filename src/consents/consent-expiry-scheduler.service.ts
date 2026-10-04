import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConsentsService } from './consents.service';

@Injectable()
export class ConsentExpirySchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConsentExpirySchedulerService.name);
  private sweepTimer: NodeJS.Timeout | null = null;
  private reminderTimer: NodeJS.Timeout | null = null;

  constructor(private readonly consentsService: ConsentsService) {}

  onModuleInit() {
    // Run an initial sweep 10 seconds after boot
    setTimeout(() => {
      this.runSweep();
      this.runReminders();
    }, 10000);

    // Schedule periodic sweeps every 15 minutes
    this.sweepTimer = setInterval(() => {
      this.runSweep();
    }, 15 * 60 * 1000);

    // Schedule reminder checks once every 6 hours
    this.reminderTimer = setInterval(() => {
      this.runReminders();
    }, 6 * 60 * 60 * 1000);

    this.logger.log('Consent expiry and reminder background scheduler initialized');
  }

  onModuleDestroy() {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  async runSweep() {
    try {
      await this.consentsService.sweepExpiredConsents();
    } catch (error) {
      this.logger.error(`Error during consent expiration sweep: ${error.message}`);
    }
  }

  async runReminders() {
    try {
      await this.consentsService.sendExpiryReminders();
    } catch (error) {
      this.logger.error(`Error during consent expiry reminders: ${error.message}`);
    }
  }
}
