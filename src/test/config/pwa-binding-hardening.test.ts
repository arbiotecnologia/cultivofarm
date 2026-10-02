import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CANONICAL_SUPABASE_HOST,
  validateSupabaseBinding,
} from "@/integrations/supabase/bindingGuard";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("P0-03A — binding fail-closed", () => {
  it("aceita somente o host HTTPS canônico", () => {
    expect(validateSupabaseBinding(`https://${CANONICAL_SUPABASE_HOST}`)).toEqual({ ok: true });
  });

  it.each([
    "yzszlzjpovmcteuxjznj",
    "ikaauvsflpmamgxmkhoq",
    "navfzbwgwzruipouyfnk",
  ])("rejeita o ref legado %s", (ref) => {
    expect(validateSupabaseBinding(`https://${ref}.supabase.co`).ok).toBe(false);
  });

  it("rejeita protocolo inseguro e host semelhante", () => {
    expect(validateSupabaseBinding(`http://${CANONICAL_SUPABASE_HOST}`).ok).toBe(false);
    expect(validateSupabaseBinding(`https://${CANONICAL_SUPABASE_HOST}.example.com`).ok).toBe(false);
  });
});

describe("P0 PWA — atualização manual", () => {
  const vite = read("vite.config.ts");
  const register = read("src/pwa/registerSW.ts");
  const app = read("src/App.tsx");
  const main = read("src/main.tsx");
  const boundary = read("src/components/ErrorBoundary.tsx");

  it("usa estratégia prompt sem ativação automática e mantém limpeza de caches", () => {
    expect(vite).toMatch(/clientsClaim:\s*true/);
    expect(vite).toMatch(/registerType:\s*"prompt"/);
    expect(vite).toMatch(/skipWaiting:\s*false/);
    expect(vite).toMatch(/cleanupOutdatedCaches:\s*true/);
    expect(vite).toContain('handler: "NetworkFirst"');
  });

  it("oferece notificador manual e remove o overlay antigo", () => {
    expect(app).toContain("PwaUpdateNotifier");
    expect(app).not.toContain("SwUpdatingOverlay");
    expect(() => read("src/pwa/SwUpdatingOverlay.tsx")).toThrow();
    expect(register).toContain("pwa:update-available");
    expect(register).toContain("applyPendingUpdate");
    expect(register).toContain("dismissPendingUpdate");
  });

  it("mantém trava de recarga explícita e limpeza de observadores", () => {
    expect(register).toContain("explicitApplyIntent");
    expect(register).toContain("RECENT_RELOAD_KEY");
    expect(register).toContain("RELOAD_LOOP_GUARD_MS");
    expect(register).toContain("controllerchange");
    expect(register).toContain("removeEventListener");
    expect(register).toContain("clearInterval");
    expect(register).toContain("visibilitychange");
    expect(register).toContain('addEventListener("online"');
    expect(register).toContain("PWA_UPDATE_STATE_EVENT");
    expect(register).toContain("APPLY_TIMEOUT_MS");
  });

  it("não ativa nem recarrega ao detectar update", () => {
    expect(register).not.toMatch(/onUpdateFound[\s\S]{0,500}postMessage/);
    expect(register).toMatch(/state === "installed"[\s\S]{0,250}announcePendingUpdate/);
    expect(register).toMatch(/state === "redundant"[\s\S]{0,200}clearPendingUpdate/);
    expect(register).toMatch(/if \(explicitApplyIntent\) triggerExplicitReload/);
  });

  it("preserva os bloqueios de preview, iframe e kill-switch", () => {
    expect(register).toContain("!import.meta.env.PROD");
    expect(register).toContain("window.self !== window.top");
    expect(register).toContain('get("sw") === "off"');
    expect(register).toContain('hostname.startsWith("id-preview--")');
  });

  it("recarrega uma única versão quando o Vite detecta chunk obsoleto", () => {
    expect(main).toContain('addEventListener("vite:preloadError"');
    expect(main).toContain("recoverFromStaleBuild");
    expect(main).not.toMatch(/vite:preloadError[\s\S]{0,300}window\.location\.reload/);
    expect(register).toContain("isStaleBuildError");
    expect(register).toContain("Failed to fetch dynamically imported module");
    expect(register).toContain('new Set(["html-nav", "static-assets"])');
    expect(register).toContain("window.caches.delete");
    expect(boundary).toContain("recoverFromStaleBuild");
  });

  it("não classifica falha de chunk como bloqueio do Supabase", () => {
    expect(main).toContain("renderLoadFailure");
    expect(main).toMatch(/if \(isStaleBuildError\(error\)\)/);
    expect(main).not.toMatch(/\.catch\(\(\) => renderBlockedConnection\(\)\)/);
  });
});