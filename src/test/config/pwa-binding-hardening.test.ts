import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_SUPABASE_HOST, validateSupabaseBinding } from "@/integrations/supabase/bindingGuard";

const ROOT = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("P0-03A — binding fail-closed", () => {
  it("aceita somente o host HTTPS canônico", () => {
    expect(validateSupabaseBinding(`https://${CANONICAL_SUPABASE_HOST}`)).toEqual({ ok: true });
  });

  it.each(["yzszlzjpovmcteuxjznj", "ikaauvsflpmamgxmkhoq", "navfzbwgwzruipouyfnk"])("rejeita o ref legado %s", (ref) => {
    expect(validateSupabaseBinding(`https://${ref}.supabase.co`).ok).toBe(false);
  });

  it("rejeita protocolo inseguro e host semelhante", () => {
    expect(validateSupabaseBinding(`http://${CANONICAL_SUPABASE_HOST}`).ok).toBe(false);
    expect(validateSupabaseBinding(`https://${CANONICAL_SUPABASE_HOST}.example.com`).ok).toBe(false);
  });
});

describe("P0 PWA — versão independente de service worker", () => {
  const vite = read("vite.config.ts");
  const register = read("src/pwa/registerSW.ts");
  const legacyWorker = read("public/sw.js");
  const pushWorker = read("public/push-sw.js");
  const app = read("src/App.tsx");
  const main = read("src/main.tsx");

  it("remove Workbox/VitePWA e preserva manifesto estático", () => {
    expect(vite).not.toMatch(/VitePWA|generateSW|registerType|workbox|clientsClaim|skipWaiting/);
    expect(read("package.json")).not.toContain("vite-plugin-pwa");
    expect(existsSync(resolve(ROOT, "public/manifest.webmanifest"))).toBe(true);
    expect(read("index.html")).toContain('/manifest.webmanifest');
  });

  it("detecta versão pelo HTML sem listeners de ciclo do worker", () => {
    expect(register).toContain('cache: "no-store"');
    expect(register).toContain("UPDATE_INTERVAL_MS = 60 * 60 * 1000");
    expect(register).toContain('addEventListener("visibilitychange"');
    expect(register).toContain('addEventListener("online"');
    expect(register).not.toMatch(/controllerchange|updatefound|SKIP_WAITING/);
  });

  it("mantém notificador não bloqueante e navegação somente em ação explícita", () => {
    expect(app).toContain("PwaUpdateNotifier");
    expect(register).toContain("applyPendingUpdate");
    expect(register).toContain("dismissPendingUpdate");
    expect(register).toContain("RECENT_NAVIGATION_KEY");
    expect(register).not.toContain("location.reload");
    expect(main).not.toMatch(/vite:preloadError[\s\S]{0,300}(reload|replace)/);
  });

  it("worker legado só limpa caches e se desregistra, sem navegar clientes", () => {
    expect(legacyWorker).toContain("registration.unregister");
    expect(legacyWorker).not.toMatch(/clients\.claim|client\.navigate|openWindow|location\.reload/);
    expect(register).toContain("migrateLegacyAppShell");
  });

  it("push é standalone e não controla versão nem cacheia app-shell", () => {
    expect(register).toContain('register(PUSH_SW_URL');
    expect(pushWorker).toContain('addEventListener("push"');
    expect(pushWorker).not.toMatch(/importScripts|workbox|SKIP_WAITING|skipWaiting|clients\.claim|caches\./);
  });

  it("remove todos os textos e eventos bloqueantes antigos do runtime atual", () => {
    const runtime = [register, read("src/pwa/PwaUpdateNotifier.tsx"), main, pushWorker].join("\n");
    expect(runtime).not.toMatch(/Atualizando aplicação|recarregada automaticamente|pwa:updating-start|SwUpdatingOverlay|controllerchange|updatefound|autoUpdate/);
  });
});