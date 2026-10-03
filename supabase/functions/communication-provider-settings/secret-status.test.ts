import { isSecretReferenceConfigured } from "./secret-status.ts";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: esperado ${String(expected)}, recebido ${String(actual)}`);
  }
}

Deno.test("referência UUID presente fica configurada sem retornar seu valor", () => {
  const reference = "00000000-0000-0000-0000-000000000001";
  const row = { secret_smtp_password: reference };
  const configured = isSecretReferenceConfigured(row, "secret_smtp_password");

  assertEquals(configured, true, "referência UUID deve ser reconhecida");
  assertEquals(typeof configured, "boolean", "resultado deve ser somente booleano");
  assertEquals(String(configured).includes(reference), false, "resultado não deve conter a referência");
});

Deno.test("referência nula ou string vazia fica não configurada", () => {
  assertEquals(isSecretReferenceConfigured({ secret: null }, "secret"), false, "null");
  assertEquals(isSecretReferenceConfigured({ secret: undefined }, "secret"), false, "undefined");
  assertEquals(isSecretReferenceConfigured({ secret: "  " }, "secret"), false, "string vazia");
});

Deno.test("indicadores SMTP, WhatsApp e webhook usam a mesma regra", () => {
  const reference = "00000000-0000-0000-0000-000000000001";
  const row = {
    secret_smtp_password: reference,
    secret_whatsapp_access_token: reference,
    secret_whatsapp_app_secret: reference,
    secret_whatsapp_verify_token: reference,
  };

  for (const key of Object.keys(row)) {
    assertEquals(isSecretReferenceConfigured(row, key), true, key);
  }
});