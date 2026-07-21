/**
 * Fase Fiscal 3.0.1 — validação runtime de mask_sensitive_jsonb.
 *
 * Contrato idêntico ao TS em src/test/fiscal/mask.test.ts.
 * Se PGURL_STAGING presente e `pg` não puder ser carregado, FALHA (não skip).
 */
import { describe, test, expect } from "vitest";

const pgUrl = process.env.PGURL_STAGING;

type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ out: unknown }> }>;
  end: () => Promise<void>;
};

async function loadPgOrThrow(): Promise<new (o: { connectionString: string }) => PgClient> {
  const modName = "pg";
  const mod = (await import(/* @vite-ignore */ modName)) as {
    Client: new (o: { connectionString: string }) => PgClient;
  };
  return mod.Client;
}

async function mask(client: PgClient, payload: unknown): Promise<unknown> {
  const { rows } = await client.query(
    "SELECT public.mask_sensitive_jsonb($1::jsonb) AS out",
    [payload === null ? null : JSON.stringify(payload)],
  );
  return rows[0].out;
}

describe("Fase Fiscal 3.0.1 — mask_sensitive_jsonb (SQL)", () => {
  test.runIf(pgUrl != null)("cobertura completa contra staging", async () => {
    // Se PGURL_STAGING presente e pg indisponível ⇒ FALHA explícita.
    const Client = await loadPgOrThrow();
    const client = new Client({ connectionString: pgUrl as string });
    await client.connect();
    let executed = 0;
    try {
      // 1) topo case-insensitive
      const l1 = (await mask(client, { Authorization: "x", TOKEN: "y", ok: "keep" })) as Record<string, string>;
      expect(l1.Authorization).toBe("***REDACTED***");
      expect(l1.TOKEN).toBe("***REDACTED***");
      expect(l1.ok).toBe("keep");
      executed++;

      // 2) 3 níveis
      const l3 = (await mask(client, { a: { b: { certificate: "c", ok: 1 } } })) as {
        a: { b: { certificate: string; ok: number } };
      };
      expect(l3.a.b.certificate).toBe("***REDACTED***");
      expect(l3.a.b.ok).toBe(1);
      executed++;

      // 3) arrays
      const arr = (await mask(client, [1, "a", null])) as unknown[];
      expect(arr).toEqual([1, "a", null]);
      executed++;

      // 4) arrays de objetos
      const arrObj = (await mask(client, [{ password: "p" }, { ok: 1 }])) as Array<Record<string, unknown>>;
      expect(arrObj[0].password).toBe("***REDACTED***");
      expect(arrObj[1].ok).toBe(1);
      executed++;

      // 5) headers
      const h = (await mask(client, { headers: { Authorization: "Bearer z", apikey: "k", "X-Custom": "keep" } })) as {
        headers: Record<string, string>;
      };
      expect(h.headers.Authorization).toBe("***REDACTED***");
      expect(h.headers.apikey).toBe("***REDACTED***");
      expect(h.headers["X-Custom"]).toBe("keep");
      executed++;

      // 6) accessToken / private_key_pem
      const comp = (await mask(client, {
        accessToken: "a", private_key_pem: "p", refresh_token: "r", client_secret: "s",
      })) as Record<string, string>;
      expect(comp.accessToken).toBe("***REDACTED***");
      expect(comp.private_key_pem).toBe("***REDACTED***");
      expect(comp.refresh_token).toBe("***REDACTED***");
      expect(comp.client_secret).toBe("***REDACTED***");
      executed++;

      // 7) null
      expect(await mask(client, null)).toBeNull();
      executed++;

      // 8) objeto vazio
      expect(await mask(client, {})).toEqual({});
      executed++;

      // 9) array vazio
      expect(await mask(client, [])).toEqual([]);
      executed++;

      // 10) payload grande
      const big: Record<string, unknown> = {};
      for (let i = 0; i < 500; i++) big[`k${i}`] = i;
      big.token = "s";
      big.nested = { authorization: "z", ok: "keep" };
      const out = (await mask(client, big)) as Record<string, unknown> & {
        nested: { authorization: string; ok: string };
      };
      expect(out.token).toBe("***REDACTED***");
      expect(out.nested.authorization).toBe("***REDACTED***");
      expect(out.nested.ok).toBe("keep");
      expect(out.k499).toBe(499);
      executed++;

      expect(executed).toBe(10);
    } finally {
      await client.end();
    }
  }, 60_000);

  test.skipIf(pgUrl != null)(
    "EXECUÇÃO PENDENTE EM STAGING — defina PGURL_STAGING",
    () => { expect(true).toBe(true); },
  );
});
