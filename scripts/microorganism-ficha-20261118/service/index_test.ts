import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handle } from "./index.ts";
const url = "https://vrlcdwmlytukrjezrrnf.supabase.co";
Deno.test("CORS on options", async () => {
  const r = await handle(new Request(url, { method: "OPTIONS" }));
  assertEquals(r.status, 200);
  assertEquals(r.headers.get("access-control-allow-origin"), "*");
});
Deno.test("wrong destination fails closed", async () => {
  Deno.env.set("SUPABASE_URL", "https://invalid.example");
  const r = await handle(new Request(url, { method: "POST" }));
  assertEquals(r.status, 503);
});
Deno.test("absent bearer denied before provider", async () => {
  Deno.env.set("SUPABASE_URL", url);
  Deno.env.set("SUPABASE_ANON_KEY", "synthetic-key");
  const r = await handle(new Request(url, { method: "POST" }));
  assertEquals(r.status, 401);
});
Deno.test("invalid JWT denied before provider", async () => {
  Deno.env.set("SUPABASE_URL", url);
  Deno.env.set("SUPABASE_ANON_KEY", "synthetic-key");
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify({ message: "invalid JWT" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
  try {
    const r = await handle(
      new Request(url, {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
      }),
    );
    assertEquals(r.status, 401);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("authenticated request malformed identity rejected", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  try {
    const r = await handle(
      new Request(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identity: { name: "Micro", entity: "microrganismo" },
          fields: ["descricao"],
        }),
      }),
    );
    assertEquals(r.status, 400);
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("authority denied cannot invoke inference", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    calls++;
    return Promise.resolve(
      new Response(
        JSON.stringify(
          calls === 1
            ? { id: "00000000-0000-4000-8000-000000000001" }
            : { allowed: false },
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  };
  try {
    const r = await handle(
      new Request(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer synthetic",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identity: {
            name: "Micro",
            entity: "microrganismo",
            manufacturer: "",
            registration: "",
          },
          fields: ["descricao"],
        }),
      }),
    );
    assertEquals(r.status, 403);
    assertEquals(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test(
  "explicit homolog binding accepts authentication phase, mismatch is closed",
  async () => {
    Deno.env.set("SUPABASE_URL", "https://vrlcdwmlytukrjezrrnf.supabase.co");
    assertEquals(
      (await handle(new Request(url, { method: "POST" }))).status,
      401,
    );
    Deno.env.set("SUPABASE_URL", "https://swzpzcwiasxmjutrmvkm.supabase.co");
    assertEquals(
      (await handle(new Request(url, { method: "POST" }))).status,
      503,
    );
    Deno.env.set("SUPABASE_URL", url);
  },
);
Deno.test("server bounds body without trusting content length", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  try {
    assertEquals(
      (
        await handle(
          new Request(url, {
            method: "POST",
            headers: { Authorization: "Bearer synthetic" },
            body: "x".repeat(24001),
          }),
        )
      ).status,
      413,
    );
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test("shared quota denial prevents provider call", async () => {
  let calls = 0;
  const original = globalThis.fetch;
  const actor = "00000000-0000-4000-8000-000000000001";
  globalThis.fetch = () => {
    calls++;
    return Promise.resolve(
      new Response(
        JSON.stringify(
          calls === 1
            ? { id: actor }
            : calls === 2
              ? { allowed: true, actor_id: actor, organization_id: "org" }
              : { code: "PT429", message: "quota" },
        ),
        {
          status: calls === 3 ? 429 : 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  };
  try {
    const r = await handle(
      new Request(url, {
        method: "POST",
        headers: { Authorization: "Bearer synthetic" },
        body: JSON.stringify({
          identity: {
            name: "Micro",
            entity: "microrganismo",
            manufacturer: "",
            registration: "",
          },
          fields: ["descricao"],
        }),
      }),
    );
    assertEquals(r.status, 429);
    assertEquals(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});
