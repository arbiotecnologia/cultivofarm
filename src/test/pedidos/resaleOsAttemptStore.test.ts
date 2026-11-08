import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearResaleOsAttempt, loadResaleOsAttempt, RESALE_OS_ATTEMPT_KEY, retainResaleOsAttempt } from "@/lib/authz/resaleOsAttemptStore";

const scope = { scope: "scope-A", actor: "10000000-0000-4000-8000-000000000004", tenant: "10000000-0000-4000-8000-000000000005" };
const intent = { orderId: "10000000-0000-4000-8000-000000000001", itemId: "10000000-0000-4000-8000-000000000002", observed: "2026-11-08T21:12:00Z" };
const now = Date.parse("2026-11-08T22:00:00Z");

describe("retenção da tentativa de OS na aba", () => {
  beforeEach(() => { window.sessionStorage.clear(); vi.restoreAllMocks(); });
  it("sobrevive a remount/reload com a mesma chave e sem reenvio implícito", () => {
    const saved = retainResaleOsAttempt(scope, intent, "request-key-0001", now);
    expect(saved?.requestKey).toBe("request-key-0001");
    expect(loadResaleOsAttempt(scope, now + 1000)).toEqual(saved);
    expect(window.sessionStorage.getItem(RESALE_OS_ATTEMPT_KEY)).not.toContain("service_role");
  });
  it("não sobrescreve tentativa incerta com outro item ou CAS", () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001", now);
    expect(retainResaleOsAttempt(scope, { ...intent, observed: "2026-11-08T21:13:00Z" }, "request-key-0002", now)).toBeNull();
    expect(loadResaleOsAttempt(scope, now)?.requestKey).toBe("request-key-0001");
  });
  it("ator, tenant ou época/escopo diferente apaga e nunca adota", () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001", now);
    expect(loadResaleOsAttempt({ ...scope, scope: "scope-epoch-2" }, now)).toBeNull();
    expect(window.sessionStorage.getItem(RESALE_OS_ATTEMPT_KEY)).toBeNull();
  });
  it("expiração e payload corrompido falham fechado", () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001", now);
    expect(loadResaleOsAttempt(scope, now + 9 * 60 * 60 * 1000)).toBeNull();
    window.sessionStorage.setItem(RESALE_OS_ATTEMPT_KEY, "{broken");
    expect(loadResaleOsAttempt(scope, now)).toBeNull();
  });
  it("falha de storage impede retenção e, portanto, o dispatch", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    expect(retainResaleOsAttempt(scope, intent, "request-key-0001", now)).toBeNull();
  });
  it("limpeza exige a mesma chave retida", () => {
    retainResaleOsAttempt(scope, intent, "request-key-0001", now);
    clearResaleOsAttempt(scope, "request-key-0002");
    expect(loadResaleOsAttempt(scope, now)).not.toBeNull();
    clearResaleOsAttempt(scope, "request-key-0001");
    expect(loadResaleOsAttempt(scope, now)).toBeNull();
  });
});
