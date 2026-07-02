import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AlertSeverity,
  AlertType,
  NotificationChannelStatus,
  NotificationChannelType,
} from '@prisma/client';

export class CreateNotificationChannelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(NotificationChannelType)
  type!: NotificationChannelType;

  @IsOptional()
  @IsEnum(NotificationChannelStatus)
  status?: NotificationChannelStatus;

  @IsObject()
  config_public!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;
}

export class UpdateNotificationChannelDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(NotificationChannelStatus)
  status?: NotificationChannelStatus;

  @IsOptional()
  @IsObject()
  config_public?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;
}

export class CreateNotificationRuleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertType)
  alert_type?: AlertType;

  @IsOptional()
  @IsUUID()
  client_id?: string;

  @IsUUID()
  channel_id!: string;
}

export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity | null;

  @IsOptional()
  @IsEnum(AlertType)
  alert_type?: AlertType | null;

  @IsOptional()
  @IsUUID()
  client_id?: string | null;

  @IsOptional()
  @IsUUID()
  channel_id?: string;
}

export class ListNotificationDeliveriesQueryDto {
  @IsOptional()
  @IsUUID()
  alert_id?: string;
}
