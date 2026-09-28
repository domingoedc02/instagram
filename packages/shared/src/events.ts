/**
 * Realtime event names, `domain:action` (spec/file-structure). The realtime
 * server and the web client share these so a typo is a type error.
 */
export const RealtimeEvent = {
  DmMessage: "dm:message",
  DmRead: "dm:read",
  DmTyping: "dm:typing",
  PresenceUpdate: "presence:update",
  NotificationNew: "notification:new",
} as const;

export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

/** BullMQ queue names (spec/file-structure). */
export const Queue = {
  Media: "media",
  Moderation: "moderation",
  Fanout: "fanout",
  Notifications: "notifications",
  Maintenance: "maintenance",
  Export: "export",
} as const;

export type Queue = (typeof Queue)[keyof typeof Queue];
