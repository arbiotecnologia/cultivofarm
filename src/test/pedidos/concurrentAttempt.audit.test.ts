import { beforeEach, expect, it } from "vitest";
import { clearAllOrderAttempts, markOrderAttemptCommitted, markOrderAttemptRejected, markOrderAttemptSending,
  markOrderAttemptUnresolved, prepareOrderAttempt, readOrderAttempt } from "@/lib/authz/pendingOrderAttempt";

const slot = "slot-A"; const fp = "fp-1";
let n = 0; const next = () => `key${++n}`;
beforeEach(() => { clearAllOrderAttempts(); n = 0; });

it("rejeição do 1º com 2º em voo não apaga; sucesso do 2º é registrado; retry reutiliza a chave", () => {
  const p1 = prepareOrderAttempt(slot, fp, next); if (!p1.ok) throw 0;
  const one = markOrderAttemptSending(slot, p1.key);
  expect(one.wasAmbiguous).toBe(false);
  const p2 = prepareOrderAttempt(slot, fp, next); if (!p2.ok) throw 0;
  expect(p2.key).toBe(p1.key);
  markOrderAttemptSending(slot, p2.key);
  markOrderAttemptRejected(slot, p1.key, one.wasAmbiguous);
  expect(readOrderAttempt(slot)?.inflight).toBe(true);
  markOrderAttemptCommitted(slot, p2.key, { numero: "PB-1" });
  expect(readOrderAttempt(slot)?.order?.numero).toBe("PB-1");
  const p3 = prepareOrderAttempt(slot, fp, next); if (!p3.ok) throw 0;
  expect(p3.key).toBe(p1.key);
});

it("ordem inversa: sucesso do 1º e rejeição tardia do 2º preservam a confirmação", () => {
  const p1 = prepareOrderAttempt(slot, fp, next); if (!p1.ok) throw 0;
  markOrderAttemptSending(slot, p1.key); markOrderAttemptSending(slot, p1.key);
  markOrderAttemptCommitted(slot, p1.key, { numero: "PB-1" });
  markOrderAttemptRejected(slot, p1.key, false);
  expect(readOrderAttempt(slot)?.order?.numero).toBe("PB-1");
  expect(readOrderAttempt(slot)?.inflight).toBe(false);
});

it("incerto + rejeição posterior continua incerto; payload alterado bloqueado", () => {
  const p1 = prepareOrderAttempt(slot, fp, next); if (!p1.ok) throw 0;
  markOrderAttemptSending(slot, p1.key); markOrderAttemptSending(slot, p1.key);
  markOrderAttemptUnresolved(slot, p1.key);
  markOrderAttemptRejected(slot, p1.key, false);
  expect(readOrderAttempt(slot)?.ambiguous).toBe(true);
  expect(prepareOrderAttempt(slot, "fp-2", next).ok).toBe(false);
});

it("rejeição única sem outros envios descarta (nova chave permitida)", () => {
  const p1 = prepareOrderAttempt(slot, fp, next); if (!p1.ok) throw 0;
  markOrderAttemptSending(slot, p1.key);
  markOrderAttemptRejected(slot, p1.key, false);
  expect(readOrderAttempt(slot)).toBeNull();
});
