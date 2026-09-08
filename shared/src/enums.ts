/**
 * Shared enums used across frontend and backend.
 * These mirror values persisted by Prisma so both apps agree on the contract.
 */

export enum MembershipRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum PaymentStatus {
  PAID = 'PAID',
  PARTIAL = 'PARTIAL',
  UNPAID = 'UNPAID',
}

export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  INTERESTED = 'INTERESTED',
  NEGOTIATING = 'NEGOTIATING',
  WON = 'WON',
  LOST = 'LOST',
}

export enum RecommendationCategory {
  HOT_LEAD = 'HOT_LEAD',
  REORDER_DUE = 'REORDER_DUE',
  DEBTOR = 'DEBTOR',
  REACTIVATION = 'REACTIVATION',
  VIP = 'VIP',
  FOLLOW_UP = 'FOLLOW_UP',
}

export enum RecommendationStatus {
  PENDING = 'PENDING',
  CONTACTED = 'CONTACTED',
  SNOOZED = 'SNOOZED',
  DISMISSED = 'DISMISSED',
  EXPIRED = 'EXPIRED',
}

export enum FollowUpOutcome {
  CONTACTED = 'CONTACTED',
  INTERESTED = 'INTERESTED',
  NOT_INTERESTED = 'NOT_INTERESTED',
  PURCHASED = 'PURCHASED',
  FOLLOW_UP_LATER = 'FOLLOW_UP_LATER',
  NO_RESPONSE = 'NO_RESPONSE',
}

export enum ReasonCode {
  RECENT_INQUIRY = 'RECENT_INQUIRY',
  PRODUCT_INTEREST = 'PRODUCT_INTEREST',
  NO_PURCHASE_YET = 'NO_PURCHASE_YET',
  REORDER_DUE = 'REORDER_DUE',
  OUTSTANDING_DEBT = 'OUTSTANDING_DEBT',
  LONG_INACTIVITY = 'LONG_INACTIVITY',
  PREVIOUS_PURCHASES = 'PREVIOUS_PURCHASES',
  HIGH_VALUE = 'HIGH_VALUE',
}

export enum ImportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
