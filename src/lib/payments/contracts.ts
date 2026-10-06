export type PaymentProvider = "mercado_pago" | "stripe" | "mock";
export type PaymentEnvironment = "test" | "live";

export interface PaymentEventInput {
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  aggregateRef: string | null;
  sequenceNumber: number | null;
  payload: Record<string, unknown>;
}

export interface PaymentStatusSnapshot {
  providerReference: string;
  status: "pending" | "paid" | "failed" | "refunded" | "disputed";
  observedAt: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  verifyEvent(payload: string, signature: string): Promise<boolean>;
  parseEvent(payload: string): Promise<PaymentEventInput>;
  fetchStatus(providerReference: string): Promise<PaymentStatusSnapshot>;
}