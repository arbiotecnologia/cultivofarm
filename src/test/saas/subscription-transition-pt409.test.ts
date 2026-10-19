import { describe, expect, it, vi } from "vitest";
import { createSubscriptionTransition, SubscriptionResultUnknown, type SubscriptionAction } from "@/lib/saas/subscriptionTransition";

const input: SubscriptionAction = { organizationId: "org", action: "start_trial", planVersionId: "v", reason: "teste focal" };
const msg = "platform_conflict: trial já utilizado";

describe("Assinatura: PT409 é conflito de negócio definitivo", () => {
  it("PT409: 1 write, 0 committed, mensagem original preservada", async () => {
    const write = vi.fn().mockResolvedValue({ data: null, error: { code: "PT409", message: msg } });
    const committed = vi.fn();
    const verify = vi.fn();
    const err = await createSubscriptionTransition({ write, committed })(input, verify).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(SubscriptionResultUnknown);
    expect((err as Error).message).toBe(msg);
    expect(write).toHaveBeenCalledTimes(1);
    expect(committed).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });
  it.each(["PT400", "PT4091", "pt409", "PGRST301", undefined])("código %s segue ambíguo com 3 reconciliações", async (code) => {
    const write = vi.fn().mockResolvedValue({ data: null, error: { code, message: "x" } });
    const committed = vi.fn().mockResolvedValue(false);
    const err = await createSubscriptionTransition({ write, committed })(input, vi.fn()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubscriptionResultUnknown);
    expect(write).toHaveBeenCalledTimes(1);
    expect(committed).toHaveBeenCalledTimes(3);
  });
});
