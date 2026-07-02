import { AlertSeverity, AlertType } from '@prisma/client';

export type NotificationRuleMatchInput = {
  severity: AlertSeverity;
  alertType: AlertType;
  clientId: string;
};

export type NotificationRuleCandidate = {
  enabled: boolean;
  severity: AlertSeverity | null;
  alertType: AlertType | null;
  clientId: string | null;
};

export function ruleMatchesAlert(
  rule: NotificationRuleCandidate,
  alert: NotificationRuleMatchInput,
): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (rule.severity && rule.severity !== alert.severity) {
    return false;
  }

  if (rule.alertType && rule.alertType !== alert.alertType) {
    return false;
  }

  if (rule.clientId && rule.clientId !== alert.clientId) {
    return false;
  }

  return true;
}

export function buildNotificationIdempotencyKey(
  alertId: string,
  channelId: string,
  openedAt: Date,
): string {
  return `${alertId}:${channelId}:${openedAt.toISOString()}`;
}
