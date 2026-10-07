import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyBeginError, parseEmailChangeBody } from "./policy.ts";

const base = {
  invite_id: "11111111-1111-4111-8111-111111111111",
  idempotency_key: "22222222-2222-4222-8222-222222222222",
  new_email: " Novo@Empresa.com.br ",
  reason: "Troca de domínio",
  confirm: true,
};

Deno.test("normaliza e aceita pedido válido", () => {
  const r = parseEmailChangeBody(base);
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.value.newEmail, "novo@empresa.com.br");
});

Deno.test("rejeita e-mail inválido, motivo curto e falta de confirmação", () => {
  assertEquals(parseEmailChangeBody({ ...base, new_email: "invalido" }).ok, false);
  assertEquals(parseEmailChangeBody({ ...base, reason: "x" }).ok, false);
  assertEquals(parseEmailChangeBody({ ...base, confirm: false }).ok, false);
  assertEquals(parseEmailChangeBody({ ...base, idempotency_key: "x" }).ok, false);
});

Deno.test("classifica e-mail em uso como conflito sem vazar SQL", () => {
  const e = classifyBeginError("platform_email_in_use");
  assertEquals([e.code, e.status], ["email_in_use", 409]);
  assertEquals(classifyBeginError("qualquer coisa").code, "begin_failed");
});
