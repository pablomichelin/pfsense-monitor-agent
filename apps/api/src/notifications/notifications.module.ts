import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailNotificationProvider } from './providers/email.provider';
import { TelegramNotificationProvider } from './providers/telegram.provider';
import { WebhookNotificationProvider } from './providers/webhook.provider';
import { NotificationsController } from './notifications.controller';
import {
  NotificationsDispatcherService,
  NotificationsService,
} from './notifications.service';

@Module({
  imports: [PrismaModule, AuthModule, CommonModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsDispatcherService,
    EmailNotificationProvider,
    WebhookNotificationProvider,
    TelegramNotificationProvider,
  ],
  exports: [NotificationsDispatcherService],
})
export class NotificationsModule {}
