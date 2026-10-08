import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handler } from "./index.ts";

for (const scenario of ["anonymous", "invalid-bearer", "claimed-admin", "claimed-owner", "internal", "malformed"] as const) {
  Deno.test(`STORAGE1 ${scenario}: denies before body or network effects`, async () => {
    let networkCalls = 0;
    let bodyReads = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => { networkCalls++; throw new Error("Unexpected network: domain/upload/sign/invoke"); };
    try {
      const headers: Record<string, string> = {};
      if (scenario !== "anonymous") headers.Authorization = "Bearer TEST_INVALID_NOT_A_SESSION";
      if (scenario === "internal") headers["x-internal-secret"] = "TEST_NOT_A_SECRET";
      const req = new Request("http://localhost/pdf", { method: "POST", headers,
        body: scenario === "malformed" ? "{" : JSON.stringify({ registroId: "fake", owner_id: "other", role: "administrador", destinatarioEmail: "nobody@example.invalid", pdfBase64: "fake" }) });
      req.json = () => { bodyReads++; throw new Error("Body must not be read"); };
      const response = handler(req);
      assertEquals(response.status, 503);
      assertEquals((await response.json()).code, "STORAGE1_PDF_CONTRACT_UNAVAILABLE");
      assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
      assertEquals(response.headers.get("Cache-Control"), "no-store");
      assertEquals(bodyReads, 0);
      // SDK upload/sign/invoke and domain requests all require network; none is reachable.
      assertEquals(networkCalls, 0);
    } finally { globalThis.fetch = originalFetch; }
  });
}
Deno.test("STORAGE1 preflight has CORS and no PDF link", async () => {
  const response = handler(new Request("http://localhost/pdf", { method: "OPTIONS" }));
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(await response.text(), "ok");
});
Deno.test("STORAGE1 other methods stay closed", async () => {
  for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
    const response = handler(new Request("http://localhost/pdf", { method }));
    assertEquals(response.status, 503);
    const body = await response.json();
    assertEquals(body.success, false);
    assertEquals(body.downloadUrl, undefined);
  }
});
