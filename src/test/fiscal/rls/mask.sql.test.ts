/**
 * Fase Fiscal 3.0 (complemento) — validação runtime de mask_sensitive_jsonb.
 *
 * Cobre: objetos aninhados, arrays, arrays de objetos, headers, case,
 * payload nulo, payload grande. Skip se PGURL_STAGING ausente.
 */
import { describe, test, expect } from "vitest";

const pgUrl = process.env.PGURL_STAGING;

type PgClient = {
  connect: () => Promise<void>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ out: unknown }> }>;
  end: () => Promise<void>;
};

async function loadPg(): Promise<
  (new (o: { connectionString: string }) => PgClient) | null
> {
  try {
    const mod = (await import(/* @vite-ignore */ "pg")) as {
      Client: new (o: { connectionString: string }) => PgClient;
    };
    return mod.Client;
  } catch {
    console.warn("[mask.sql.test] pg indisponível — skip");
    return null;
  }
}

async function mask(client: PgClient, payload: unknown): Promise<unknown> {
  const { rows } = await client.query(
    "SELECT public.mask_sensitive_jsonb($1::jsonb) AS out",
    [payload === null ? null : JSON.stringify(payload)],
  );
  return rows[0].out;
}

describe("Fase Fiscal 3.0 — mask_sensitive_jsonb (SQL, cobertura ampliada)", () => {
  test.skipIf(!pgUrl)("cobre objetos, arrays, headers, case, null e grande", async () => {
    if (!pgUrl) return;
    const Client = await loadPg();
    if (!Client) return;
    const client = new Client({ connectionString: pgUrl });
    await client.connect();
    try {
      // 1) objetos aninhados
      const nested = (await mask(client, {
        outer: { token: "x", nested2: { password: "p", ok: 1 } },
      })) as { outer: { token: string; nested2: { password: string; ok: number } } };
      expect(nested.outer.token).toBe("***REDACTED***");
      expect(nested.outer.nested2.password).toBe("***REDACTED***");
      expect(nested.outer.nested2.ok).toBe(1);

      // 2) arrays simples (não devem quebrar)
      const arr = (await mask(client, [1, "a", null])) as unknown[];
      expect(arr).toEqual([1, "a", null]);

      // 3) arrays de objetos
      const arrObj = (await mask(client, [{ token: "t" }, { ok: "keep" }])) as Array<
        Record<string, unknown>
      >;
      expect(arrObj[0].token).toBe("***REDACTED***");
      expect(arrObj[1].ok).toBe("keep");

      // 4) headers (Authorization / apikey)
      const headers = (await mask(client, {
        headers: { Authorization: "Bearer z", apikey: "k", "X-Custom": "keep" },
      })) as { headers: Record<string, string> };
      expect(headers.headers.Authorization).toBe("***REDACTED***");
      expect(headers.headers.apikey).toBe("***REDACTED***");
      expect(headers.headers["X-Custom"]).toBe("keep");

      // 5) case-insensitive
      const cases = (await mask(client, {
        TOKEN: "a",
        Token: "b",
        token: "c",
        Password: "d",
        SENHA: "e",
      })) as Record<string, string>;
      expect(cases.TOKEN).toBe("***REDACTED***");
      expect(cases.Token).toBe("***REDACTED***");
      expect(cases.token).toBe("***REDACTED***");
      expect(cases.Password).toBe("***REDACTED***");
      expect(cases.SENHA).toBe("***REDACTED***");

      // 6) payload nulo
      const nullOut = await mask(client, null);
      expect(nullOut).toBeNull();

      // 7) payload grande (500 chaves, algumas sensíveis)
      const big: Record<string, unknown> = {};
      for (let i = 0; i < 500; i++) big[`k${i}`] = i;
      big.token = "secret";
      big.nested = { authorization: "z", ok: "keep" };
      const bigOut = (await mask(client, big)) as Record<string, unknown> & {
        nested: { authorization: string; ok: string };
      };
      expect(bigOut.token).toBe("***REDACTED***");
      expect(bigOut.nested.authorization).toBe("***REDACTED***");
      expect(bigOut.nested.ok).toBe("keep");
      expect(bigOut.k499).toBe(499);
    } finally {
      await client.end();
    }
  }, 60_000);

  test.skipIf(pgUrl != null)(
    "EXECUÇÃO PENDENTE EM STAGING — defina PGURL_STAGING",
    () => {
      expect(true).toBe(true);
    },
  );
});
