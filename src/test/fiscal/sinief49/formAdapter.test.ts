import { describe, expect, it } from "vitest";
import {
  buildFromForm,
  resolveOperationType,
  SINIEF_UI_OPTION_LABELS,
  toScenarioInput,
  type SinefFormState,
} from "@/lib/fiscal/sinief49/formAdapter";

const ISSUER = "12345678000199";
const RECIPIENT_CNPJ = "98765432000188";
const ORIGINAL_KEY = "0".repeat(43) + "1";
const ADVANCE_KEY = "0".repeat(43) + "2";

function baseState(): SinefFormState {
  return {
    uiOption: "ADVANCE_PAYMENT",
    issuerCnpj: ISSUER,
    taxSetupApproved: true,
    recipient: { kind: "EXTERNAL", cnpj: RECIPIENT_CNPJ, name: "Cliente" },
    items: [
      {
        sequence: 1,
        sourceKind: "PRODUCT",
        sourceId: "prod-1",
        description: "Semente",
        quantity: 2,
        unitValue: 10,
        cfop: "5922",
      },
    ],
    orderId: "PED-1",
    expectedDeliveryDate: "2026-09-01",
  };
}

describe("SINIEF 49/2025 · adaptador de formulário → builder", () => {
  it("expõe rótulos amigáveis para as 6 opções de UI", () => {
    expect(Object.keys(SINIEF_UI_OPTION_LABELS)).toHaveLength(6);
    for (const label of Object.values(SINIEF_UI_OPTION_LABELS)) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(4);
    }
  });

  it("resolve DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND para cenários canônicos", () => {
    const s = baseState();
    s.uiOption = "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND";
    expect(resolveOperationType({ ...s, refusalSubReason: "REFUSAL_TOTAL" }))
      .toBe("DELIVERY_REFUSAL_TOTAL");
    expect(resolveOperationType({ ...s, refusalSubReason: "RECIPIENT_NOT_FOUND" }))
      .toBe("RECIPIENT_NOT_FOUND");
  });

  it("ADVANCE_PAYMENT — mapeia e gera prévia válida", () => {
    const res = buildFromForm(baseState());
    expect(res.ok).toBe(true);
    expect(res.draft?.operationType).toBe("ADVANCE_PAYMENT");
    expect(res.draft?.direction).toBe("OUT");
    expect(res.draft?.finNFe).toBe(6);
    expect(res.draft?.tpNFDebito).toBe("06");
    expect(res.draft?.canTransmit).toBe(false);
  });

  it("EFFECTIVE_SALE — exige referência de antecipação", () => {
    const s: SinefFormState = {
      ...baseState(),
      uiOption: "EFFECTIVE_SALE_AFTER_ADVANCE",
      icmsApprovalState: "APPROVED_BY_ACCOUNTING",
      advanceReferences: [{ advanceAccessKey: ADVANCE_KEY, remainingValue: 100 }],
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "prod-1",
          description: "Semente",
          quantity: 1,
          unitValue: 20,
          cfop: "5102",
        },
      ],
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.operationType).toBe("EFFECTIVE_SALE_AFTER_ADVANCE");
    expect(res.draft?.documentReferences[0]?.referencedAccessKey).toBe(ADVANCE_KEY);
  });

  it("STOCK_LOSS — usa emitente como destinatário, exige motivo/justificativa", () => {
    const s: SinefFormState = {
      uiOption: "STOCK_LOSS",
      issuerCnpj: ISSUER,
      taxSetupApproved: true,
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "prod-1",
          description: "Insumo",
          quantity: 5,
          unitValue: 3,
          cfop: "5927",
        },
      ],
      icmsApprovalState: "BLOCKED_PENDING_ACCOUNTING",
      stockLossContext: {
        legalReasonCategory: "PERISHMENT",
        legalReasonDetails: "Vencimento em campo",
      },
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.operationType).toBe("STOCK_LOSS");
    expect(res.draft?.tpNFDebito).toBe("07");
    expect(res.draft?.icmsApprovalState).toBe("BLOCKED_PENDING_ACCOUNTING");
    expect(res.draft?.recipient.kind).toBe("EXTERNAL");
  });

  it("VALUE_QUANTITY_REDUCTION — herda destinatário do documento original", () => {
    const s: SinefFormState = {
      uiOption: "VALUE_QUANTITY_REDUCTION",
      issuerCnpj: ISSUER,
      taxSetupApproved: true,
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "prod-1",
          description: "Item",
          quantity: 1,
          unitValue: 10,
          cfop: "1949",
          itemReferences: [
            {
              referenceType: "REDUCTION_ITEM",
              referencedItemSequence: 1,
              referencedQuantity: 1,
              referencedValue: 10,
            },
          ],
        },
      ],
      original: {
        originalAccessKey: ORIGINAL_KEY,
        originalRecipient: { kind: "EXTERNAL", cnpj: RECIPIENT_CNPJ },
        // SINIEF 20/2026 — snapshot explícito, determinístico, sem derivação.
        originalRecipientSnapshot: {
          kind: "EXTERNAL",
          cnpjCpf: RECIPIENT_CNPJ,
          capturedAt: "2026-08-01T12:00:00Z",
          source: "NFE_XML_DEST",
        },
        originalItems: [
          {
            sequence: 1,
            originalQuantity: 5,
            originalValue: 50,
            remainingQuantity: 5,
            remainingValue: 50,
          },
        ],
      },
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.tpNFCredito).toBe("04");
    expect(res.draft?.direction).toBe("IN");
  });

  it("DELIVERY_REFUSAL_PARTIAL — exige DFeReferenciado por item", () => {
    const s: SinefFormState = {
      uiOption: "DELIVERY_REFUSAL_PARTIAL",
      issuerCnpj: ISSUER,
      taxSetupApproved: true,
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "prod-1",
          description: "Item",
          quantity: 1,
          unitValue: 10,
          cfop: "1949",
          itemReferences: [
            {
              referenceType: "PARTIAL_REFUSAL_ITEM",
              referencedItemSequence: 1,
              referencedQuantity: 1,
              referencedValue: 10,
            },
          ],
        },
      ],
      original: {
        originalAccessKey: ORIGINAL_KEY,
        originalRecipient: { kind: "EXTERNAL", cnpj: RECIPIENT_CNPJ },
        originalItems: [
          {
            sequence: 1,
            originalQuantity: 2,
            originalValue: 20,
            remainingQuantity: 2,
            remainingValue: 20,
          },
        ],
      },
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.tpNFCredito).toBe("06");
  });

  it("RECIPIENT_NOT_FOUND — exige tentativas de entrega", () => {
    const s: SinefFormState = {
      uiOption: "DELIVERY_REFUSAL_TOTAL_OR_NOT_FOUND",
      refusalSubReason: "RECIPIENT_NOT_FOUND",
      issuerCnpj: ISSUER,
      taxSetupApproved: true,
      items: [
        {
          sequence: 1,
          sourceKind: "PRODUCT",
          sourceId: "prod-1",
          description: "Item",
          quantity: 2,
          unitValue: 10,
          cfop: "1949",
          itemReferences: [
            {
              referenceType: "PARTIAL_REFUSAL_ITEM",
              referencedItemSequence: 1,
              referencedQuantity: 2,
              referencedValue: 20,
            },
          ],
        },
      ],
      original: {
        originalAccessKey: ORIGINAL_KEY,
        originalRecipient: { kind: "EXTERNAL", cnpj: RECIPIENT_CNPJ },
        originalItems: [
          {
            sequence: 1,
            originalQuantity: 2,
            originalValue: 20,
            remainingQuantity: 2,
            remainingValue: 20,
          },
        ],
      },
      deliveryAttempts: [
        { attemptedAt: "2026-08-04", channel: "Transportadora", proofReference: "AR-123" },
      ],
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.operationType).toBe("RECIPIENT_NOT_FOUND");
    expect(res.draft?.tpNFCredito).toBe("03");
  });

  it("aceita microrganismo direto sem product_id", () => {
    const s: SinefFormState = {
      ...baseState(),
      items: [
        {
          sequence: 1,
          sourceKind: "MICROORGANISM",
          sourceId: "micro-1",
          description: "Cepa X",
          quantity: 1,
          unitValue: 15,
          cfop: "5922",
        },
      ],
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(true);
    expect(res.draft?.items[0]?.sourceKind).toBe("MICROORGANISM");
  });

  it("rejeita serviço/NFS-e em qualquer cenário SINIEF", () => {
    const s: SinefFormState = {
      ...baseState(),
      items: [
        {
          sequence: 1,
          sourceKind: "SERVICE",
          sourceId: "srv-1",
          description: "Serviço",
          quantity: 1,
          unitValue: 100,
          cfop: "5922",
        },
      ],
    };
    const res = buildFromForm(s);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "SERVICE_ITEM_REJECTED")).toBe(true);
  });

  it("tax_setup não aprovado bloqueia com mensagem pt-BR", () => {
    const s = baseState();
    s.taxSetupApproved = false;
    const res = buildFromForm(s);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "TAX_SETUP_NOT_APPROVED")).toBe(true);
  });

  it("adaptador não muta o estado do formulário", () => {
    const s = baseState();
    const snap = JSON.stringify(s);
    toScenarioInput(s);
    buildFromForm(s);
    expect(JSON.stringify(s)).toBe(snap);
  });

  it("canTransmit sempre false na prévia válida", () => {
    const res = buildFromForm(baseState());
    expect(res.draft?.canTransmit).toBe(false);
  });
});
