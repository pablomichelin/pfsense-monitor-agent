export type NotificationMessage = {
  subject: string;
  body: string;
  alertId?: string;
  isTest?: boolean;
};

export type NotificationSendResult = {
  ok: boolean;
  error?: string;
};

export interface NotificationProvider {
  send(
    publicConfig: Record<string, unknown>,
    secrets: Record<string, unknown>,
    message: NotificationMessage,
  ): Promise<NotificationSendResult>;
}
