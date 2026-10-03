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
  const notifier = read("src/pwa/PwaUpdateNotifier.tsx");
  const loginControl = read("src/pwa/PwaUpdateControl.tsx");
  const manualControl = read("src/pwa/PwaManualCheckButton.tsx");
  const topbar = read("src/components/portal/PortalTopBar.tsx");
  const platform = read("src/pages/plataforma/PlataformaHome.tsx");
  const adminLayout = read("src/components/AppLayout.tsx");
  const producerLayout = read("src/pages/portal/PortalLayout.tsx");
  const partnerLayout = read("src/pages/portal-parceiro/PortalParceiroLayout.tsx");
  const mobileLayout = read("src/pages/app/MobileLayout.tsx");

  it("remove Workbox/VitePWA e preserva manifesto estático", () => {
    expect(vite).not.toMatch(/VitePWA|generateSW|registerType|workbox|clientsClaim|skipWaiting/);
    expect(read("package.json")).not.toContain("vite-plugin-pwa");
    expect(existsSync(resolve(ROOT, "public/manifest.webmanifest"))).toBe(true);
    expect(read("index.html")).toContain('/manifest.webmanifest');
  });

  it("detecta versão pelo HTML sem listeners de ciclo do worker", () => {
    expect(register).toContain('cache: "no-store"');
    expect(register).toContain("UPDATE_INTERVAL_MS = 10 * 60 * 1000");
    expect(register).toContain('addEventListener("visibilitychange"');
    expect(register).toContain('addEventListener("online"');
    expect(register).not.toMatch(/controllerchange|updatefound|SKIP_WAITING/);
  });

  it("mantém notificador não bloqueante e navegação somente em ação explícita", () => {
    expect(app).toContain("PwaUpdateNotifier");
    expect(app).toContain("PwaUpdateControl");
    expect(app.indexOf("<PwaUpdateControl />")).toBeGreaterThan(app.indexOf("<AuthProvider>"));
    expect(register).toContain("applyPendingUpdate");
    expect(register).toContain("dismissPendingUpdate");
    expect(register).toContain("RECENT_NAVIGATION_KEY");
    expect(register).not.toContain("location.reload");
    expect(main).not.toMatch(/vite:preloadError[\s\S]{0,300}(reload|replace)/);
  });

  it("P0.3 A–D: aviso tem ações explícitas, Adiar oculta e não existe badge flutuante", () => {
    expect(notifier).toContain("Nova versão disponível");
    expect(notifier).toContain("Atualizar agora");
    expect(notifier).toContain("Adiar");
    expect(register).not.toContain("deferred_badge");
    expect(register).not.toContain("reopenPendingUpdate");
  });

  it("P0.3 E–H: origem distingue automático, login e manual com token persistido", () => {
    expect(register).toContain('"automatic" | "login" | "manual"');
    expect(register).toContain('origin === "automatic"');
    expect(register).toContain("JSON.stringify({ version: snapshot.version })");
    expect(loginControl).toContain('inspectPublishedVersion(fetch, "login")');
    expect(manualControl).toContain('inspectPublishedVersion(fetch, "manual")');
  });

  it("P0.3/P0.3.1 I–L: controle reutilizável fica nos cabeçalhos somente como ícone", () => {
    expect(topbar).toContain("PwaManualCheckButton");
    expect(platform).toContain("PwaManualCheckButton");
    expect(adminLayout).toContain("PortalTopBar");
    expect(producerLayout).toContain("PortalTopBar");
    expect(partnerLayout).toContain("PortalTopBar");
    expect(mobileLayout).toContain("PortalTopBar");
    expect(producerLayout).not.toContain("PwaManualCheckButton");
    expect(partnerLayout).not.toContain("PwaManualCheckButton");
    expect(mobileLayout).not.toContain("PwaManualCheckButton");
    expect(manualControl).not.toMatch(/fixed|bottom-|safe-area-inset-bottom/);
    expect(manualControl).toContain('className="h-9 w-9 shrink-0 cursor-pointer px-0"');
    expect(manualControl).not.toContain("hidden sm:inline");
    expect(manualControl).toContain('aria-label="Verificar se há nova versão do Cultivo Farm"');
    expect(manualControl).toContain("TooltipContent");
  });

  it("P0.3 M–P: scheduler único, eventos apenas detectam e stale-chunk segue manual", () => {
    expect(register).toContain("UPDATE_INTERVAL_MS = 10 * 60 * 1000");
    expect(register.match(/window\.setInterval\(/g)).toHaveLength(1);
    expect(register).toContain("const onVisibilityChange = () => detect()");
    expect(register).toContain("const onOnline = () => detect()");
    expect(register).toContain("requestStaleBuildRecovery");
    expect(register).not.toContain("location.reload");
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