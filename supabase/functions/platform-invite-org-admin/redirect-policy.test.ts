import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getPlatformInviteRedirectUrl,
  PLATFORM_INVITE_REDIRECT_URL,
} from "./redirect-policy.ts";

Deno.test("convite de produção usa sempre o redirect canônico", () => {
  assertEquals(
    getPlatformInviteRedirectUrl(),
    "https://app.cultivofarm.com.br/reset-password",
  );
  assertEquals(PLATFORM_INVITE_REDIRECT_URL, getPlatformInviteRedirectUrl());
});

Deno.test("origens de request não alteram o destino do convite", () => {
  for (const _origin of [
    "http://localhost:3000",
    "https://id-preview--a79bb3db-f665-466d-bf41-ee8c6cb91fab.lovable.app",
    "https://malicioso.example",
  ]) {
    assertEquals(
      getPlatformInviteRedirectUrl(),
      "https://app.cultivofarm.com.br/reset-password",
    );
  }
});