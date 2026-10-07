import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";

let handler: ((req: Request) => Response | Promise<Response>) | undefined;
const serve = stub(Deno, "serve", (candidate: unknown) => {
  handler = candidate as (req: Request) => Response | Promise<Response>;
  return {} as Deno.HttpServer<Deno.NetAddr>;
});
try { await import("./index.ts"); } finally { serve.restore(); }

async function call(method: string, origin?: string) {
  if (!handler) throw new Error("Handler não registrado");
  return await handler(new Request("https://swzpzcwiasxmjutrmvkm.supabase.co/functions/v1/platform-complete-first-access", {
    method, headers: origin ? { Origin: origin } : {},
  }));
}

Deno.test("first-access pins SDK and uses canonical CORS, never wildcard", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, 'npm:@supabase/supabase-js@2.110.8"');
  assertStringIncludes(source, "corsHeadersFor, handlePreflight, isTrustedOrigin");
  assertEquals(source.includes("@2/cors"), false);
});

Deno.test("first-access trusted preflight reflects origin and client headers", async () => {
  const response = await call("OPTIONS", "https://app.cultivofarm.com.br");
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "https://app.cultivofarm.com.br");
  for (const header of ["authorization", "x-client-info", "apikey", "content-type"]) {
    assertStringIncludes(response.headers.get("Access-Control-Allow-Headers") ?? "", header);
  }
  assertEquals(response.headers.get("Vary"), "Origin");
});

Deno.test("first-access denies untrusted preflight and POST before Auth", async () => {
  for (const method of ["OPTIONS", "POST"]) {
    const response = await call(method, "https://untrusted.example");
    assertEquals(response.status, 403);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
    if (method === "POST") assertEquals((await response.json()).code, "origin_forbidden");
  }
});

Deno.test("first-access keeps originless POST compatible but still requires Auth", async () => {
  const response = await call("POST");
  assertEquals(response.status, 401);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), null);
  assertEquals((await response.json()).etapa, "auth_header");
});

Deno.test("first-access adds scoped CORS and no-store to all early error responses", async () => {
  for (const [method, status] of [["POST", 401], ["GET", 405]] as const) {
    const response = await call(method, "https://app.cultivofarm.com.br");
    assertEquals(response.status, status);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "https://app.cultivofarm.com.br");
    assertEquals(response.headers.get("Cache-Control"), "no-store, private");
  }
});

Deno.test("first-access isolates response headers between concurrent origins", async () => {
  const origins = ["https://app.cultivofarm.com.br", "http://localhost:8080"];
  const responses = await Promise.all(origins.map(origin => call("POST", origin)));
  responses.forEach((response, index) => assertEquals(response.headers.get("Access-Control-Allow-Origin"), origins[index]));
});