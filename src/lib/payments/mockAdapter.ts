import type { PaymentEventInput, PaymentProviderAdapter, PaymentStatusSnapshot } from "./contracts";

/** Adaptador determinístico para testes. Não abre rede e não representa cobrança. */
export class MockPaymentAdapter implements PaymentProviderAdapter {
  readonly provider = "mock" as const;

  constructor(private readonly statuses: Readonly<Record<string, PaymentStatusSnapshot>> = {}) {}

  async verifyEvent(_payload: string, signature: string): Promise<boolean> {
    return signature === "mock-valid-signature";
  }

  async parseEvent(payload: string): Promise<PaymentEventInput> {
    const parsed = JSON.parse(payload) as PaymentEventInput;
    if (!parsed.providerEventId || !parsed.eventType || !parsed.occurredAt) {
      throw new Error("mock_invalid_event");
    }
    return parsed;
  }

  async fetchStatus(providerReference: string): Promise<PaymentStatusSnapshot> {
    const status = this.statuses[providerReference];
    if (!status) throw new Error("mock_status_not_found");
    return status;
  }
}