import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promotionErrorReason } from "@/hooks/usePromoteAccountingPendingOrder";

describe("c2_business_conflicts_http409_20261026 (registro, sem homologação real)", () => {
  it("promoção: PT409 = stale; bloqueio contábil e negação mantêm precedência", () => {
    expect(promotionErrorReason({ code: "PT409", message: "x" })).toBe("stale");
    expect(promotionErrorReason({ code: "PT409", message: "C2AP_STALE" })).toBe("stale");
    expect(promotionErrorReason({ code: "42501", message: "C2_ACCOUNTING_PENDING" })).toBe("accounting_pending");
    expect(promotionErrorReason({ code: "42501", message: "C2AP_ORDER_DENIED" })).toBe("denied");
    expect(promotionErrorReason({ code: "PT4091", message: "x" })).toBe("unknown");
  });
  it("lifecycle trata PT409 como conflito", () => {
    expect(readFileSync("src/components/configuracoes/PartnerLifecycleFields.tsx", "utf8")).toContain('error.code === "PT409"');
  });
  it("registro aplicado não pede reaplicação e lista pré-md5", () => {
    const s = readFileSync("scripts/owner-orders-20261023/applied/c2_business_conflicts_http409_20261026.md", "utf8");
    for (const h of ["588bb5b795e1f2c909622db8e34ea18b", "e9a3af7998001dda6f823aa3644af986", "a2b8670b8d0754d93cf69f44c4b0a94d", "NÃO REAPLICAR"]) expect(s).toContain(h);
  });
});
