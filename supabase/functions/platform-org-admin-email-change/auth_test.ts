import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authorizeSuperadmin, type AuthClient } from "./auth.ts";

const ACTOR = "33333333-3333-4333-8333-333333333333";

function mock(opts: { user?: string | null; userThrows?: boolean; superResult?: unknown; superError?: boolean; superThrows?: boolean }) {
  const calls: string[] = [];
  const client: AuthClient & { auth: AuthClient["auth"] & { admin: { updateUserById: () => void } } } = {
    auth: {
      getUser: async (_t: string) => {
        calls.push("getUser");
        if (opts.userThrows) throw new Error("net");
        return opts.user ? { data: { user: { id: opts.user } }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
      },
      admin: { updateUserById: () => { calls.push("updateUserById"); } },
    },
    rpc: async (fn: string) => {
      calls.push(fn);
      if (opts.superThrows) throw new Error("x");
      return opts.superError ? { data: null, error: { message: "db" } } : { data: opts.superResult ?? null, error: null };
    },
  };
  return { client, calls };
}

Deno.test("sem token => 401 sem chamadas", async () => {
  const { client, calls } = mock({});
  for (const h of [null, "", "Basic abc", "Bearer ", "Bearer   "]) {
    const r = await authorizeSuperadmin(h, client);
    assertEquals(r.ok ? 0 : r.status, 401);
  }
  assertEquals(calls.length, 0);
});

Deno.test("token inválido => 401 invalid_token, sem RPC", async () => {
  for (const o of [{ user: null }, { userThrows: true }]) {
    const { client, calls } = mock(o);
    const r = await authorizeSuperadmin("Bearer xyz", client);
    assertEquals(r.ok ? "" : `${r.status}:${r.code}`, "401:invalid_token");
    assertEquals(calls, ["getUser"]);
  }
});

Deno.test("ator válido não-superadmin => 403", async () => {
  for (const v of [false, null, "true", 1]) {
    const { client, calls } = mock({ user: ACTOR, superResult: v });
    const r = await authorizeSuperadmin("Bearer ok", client);
    assertEquals(r.ok ? 0 : r.status, 403);
    assertEquals(calls, ["getUser", "is_platform_superadmin"]);
  }
});

Deno.test("falha na verificação de permissão => fail-closed 500", async () => {
  for (const o of [{ superError: true }, { superThrows: true }]) {
    const { client } = mock({ user: ACTOR, ...o });
    const r = await authorizeSuperadmin("Bearer ok", client);
    assertEquals(r.ok ? "" : `${r.status}:${r.code}`, "500:authorization_check_failed");
  }
});

Deno.test("superadmin => ok com actorId de data.user.id; nunca begin/updateUserById", async () => {
  const { client, calls } = mock({ user: ACTOR, superResult: true });
  const r = await authorizeSuperadmin("Bearer ok", client);
  assertEquals(r, { ok: true, actorId: ACTOR });
  assertEquals(calls.includes("platform_begin_org_admin_email_change"), false);
  assertEquals(calls.includes("updateUserById"), false);
});

Deno.test("index.ts: autorização precede begin e updateUserById; sem getClaims/@2 flutuante", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const authAt = src.indexOf("authorizeSuperadmin(");
  assertEquals(authAt > 0, true);
  assertEquals(authAt < src.indexOf("platform_begin_org_admin_email_change"), true);
  assertEquals(authAt < src.indexOf("updateUserById"), true);
  assertEquals(src.includes("getClaims"), false);
  assertEquals(/supabase-js@2["']/.test(src), false);
  assertEquals(src.includes("esm.sh"), false);
});
