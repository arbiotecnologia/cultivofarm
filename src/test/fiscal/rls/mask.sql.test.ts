/**
 * Fase Fiscal 3.0 — validação runtime da função SQL mask_sensitive_jsonb.
 *
 * Skip se PGURL_STAGING não estiver definido. NUNCA roda em produção.
 * Não instala dependências: usa `pg` apenas se disponível.
 */
import { describe, test, expect } from "vitest";

const pgUrl = process.env.PGURL_STAGING;

describe("Fase Fiscal 3.0 — mask_sensitive_jsonb (SQL)", () => {
  test.skipIf(!pgUrl)("mascara recursivamente chaves sensíveis", async () => {
    if (!pgUrl) return;
    // Import dinâmico por string para evitar dependência de tipos em CI.
    // `pg` é opcional; se ausente, faz skip explícito.
    const modName = "pg";
    let Client: new (opts: { connectionString: string }) => {
      connect: () => Promise<void>;
      query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ out: Record<string, unknown> }> }>;
      end: () => Promise<void>;
    };
    try {
      const mod = (await import(/* @vite-ignore */ modName)) as { Client: typeof Client };
      Client = mod.Client;
    } catch {
      console.warn("[mask.sql.test] pg indisponível — skip");
      return;
    }
    const client = new Client({ connectionString: pgUrl });
    await client.connect();
    try {
      const payload = {
        Authorization: "Bearer XYZ",
        nested: { token: "t1", certificate: "c1", ok: "keep" },
        list: [{ password: "p" }, { senha: "s" }],
        untouched: 42,
      };
      const { rows } = await client.query("SELECT public.mask_sensitive_jsonb($1::jsonb) AS out", [
        JSON.stringify(payload),
      ]);
      const out = rows[0].out;
      expect(out.Authorization).toBe("***REDACTED***");
      expect(out.nested.token).toBe("***REDACTED***");
      expect(out.nested.certificate).toBe("***REDACTED***");
      expect(out.nested.ok).toBe("keep");
      expect(out.list[0].password).toBe("***REDACTED***");
      expect(out.list[1].senha).toBe("***REDACTED***");
      expect(out.untouched).toBe(42);
    } finally {
      await client.end();
    }
  }, 30_000);

  test.skipIf(pgUrl != null)(
    "EXECUÇÃO PENDENTE EM STAGING — defina PGURL_STAGING",
    () => {
      expect(true).toBe(true);
    },
  );
});
