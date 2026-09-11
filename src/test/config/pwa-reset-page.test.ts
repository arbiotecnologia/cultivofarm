import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const SOURCE = "public/api/pwa-reset.html";
const BUILT = "dist/api/pwa-reset.html";

const html = read(SOURCE);

describe("P0-03B — página de reset da PWA", () => {
  it("existe no source e é preservada no build quando o dist está presente", () => {
    expect(existsSync(resolve(ROOT, SOURCE))).toBe(true);
    if (existsSync(resolve(ROOT, "dist"))) {
      expect(existsSync(resolve(ROOT, BUILT))).toBe(true);
      expect(read(BUILT)).toContain("caches.delete");
    }
  });

  it("não contém refs Supabase, chaves ou segredos", () => {
    expect(html).not.toMatch(/supabase/i);
    expect(html).not.toMatch(/swzpzcwiasxmjutrmvkm|yzszlzjpovmcteuxjznj|ikaauvsflpmamgxmkhoq|navfzbwgwzruipouyfnk/);
    expect(html).not.toMatch(/sb_publishable_|service_role|eyJ[A-Za-z0-9_-]{10,}/);
  });

  it("não apaga localStorage, sessionStorage, cookies nem IndexedDB", () => {
    expect(html).not.toMatch(/localStorage/);
    expect(html).not.toMatch(/sessionStorage/);
    expect(html).not.toMatch(/document\.cookie/);
    expect(html).not.toMatch(/indexedDB/i);
  });

  it("desregistra workers, limpa Cache Storage e redireciona", () => {
    expect(html).toContain("getRegistrations");
    expect(html).toContain("unregister()");
    expect(html).toContain("caches.delete");
    expect(html).toContain('location.replace("/auth?pwa=migrated")');
    expect(html).toContain("Tentar novamente");
  });

  it("não carrega dependências externas e declara CSP restritiva", () => {
    expect(html).toContain("Content-Security-Policy");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("mantém a denylist de /api/ na estratégia PWA", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain("/^\\/api\\//");
  });
});
