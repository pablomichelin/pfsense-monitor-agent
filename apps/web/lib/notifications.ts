import {
  getNotificationsStatus as getNotificationsStatusFromApi,
  listNotificationChannels as listNotificationChannelsFromApi,
  listNotificationDeliveries as listNotificationDeliveriesFromApi,
  listNotificationRules as listNotificationRulesFromApi,
} from '@/lib/api';

export type {
  NotificationChannelItem,
  NotificationChannelType,
  NotificationDeliveryItem,
  NotificationRuleItem,
  NotificationsStatusResponse,
} from '@/lib/api';

export const getNotificationsStatus = getNotificationsStatusFromApi;
export const listNotificationChannels = listNotificationChannelsFromApi;
export const listNotificationRules = listNotificationRulesFromApi;
export const listNotificationDeliveries = listNotificationDeliveriesFromApi;
