// FASE SUPERADMIN — home provisória de plataforma (`/plataforma`).
//
// Invariantes estáticos: a rota existe, é guardada pelo papel de plataforma,
// é somente leitura, fica FORA do ACCESS_MAP/menus operacionais e usa o
// cliente Supabase canônico.
//
// A prova de autorização real é do servidor (policy `saas_platform_read` via
// `public.is_platform_superadmin`), registrada em
// docs/auditorias/superadmin-home-plataforma-2026-09-22.md.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = (rel: string) => resolve(process.cwd(), rel);
const read = (rel: string) => readFileSync(path(rel), "utf8");

const M_HOME = "20260922211137_7eae146c-4343-4633-a7ea-844c9e857ee6.sql";

const app = read("src/App.tsx");
const permissions = read("src/lib/permissions.ts");
const guard = read("src/components/guards/PlataformaGuard.tsx");
const page = read("src/pages/plataforma/PlataformaHome.tsx");
const hooks = read("src/hooks/usePlataformaSaaS.ts");
const sidebar = read("src/components/AppSidebar.tsx");
const navegacao = read("src/config/navigation.ts");

describe("SUPERADMIN HOME — rota e guarda", () => {
  it("a rota /plataforma existe e está sob o guard de plataforma", () => {
    expect(app).toContain('<Route path="/plataforma" element={<PlataformaHome />} />');
    expect(app).toContain("<PlataformaGuard />");
  });

  it("o guard exige sessão e o papel de plataforma na lista completa de papéis", () => {
    expect(guard).toContain('if (!user) return <Navigate to="/auth" replace />;');
    expect(guard).toContain('roles.includes("superadmin")');
    expect(guard).toContain('<Navigate to="/sem-permissao" replace />');
    // Nunca autorizar por armazenamento do navegador.
    expect(guard).not.toMatch(/localStorage|sessionStorage/);
  });

  it("a home do papel de plataforma passa a ser /plataforma", () => {
    const home = permissions.slice(
      permissions.indexOf("export function getHomeForRole"),
      permissions.indexOf("export function isMobileProfile"),
    );
    expect(home).toMatch(/case "superadmin":\s*\n\s*return "\/plataforma";/);
  });
});

describe("SUPERADMIN HOME — não toca menus operacionais", () => {
  it("superadmin continua fora do ACCESS_MAP e de ACTIVE_ROLES", () => {
    const mapa = permissions.slice(
      permissions.indexOf("const ACCESS_MAP"),
      permissions.indexOf("export function getHomeForRole"),
    );
    expect(mapa).not.toContain("superadmin");
    expect(mapa).not.toContain("/plataforma");
    const ativos = permissions.slice(permissions.indexOf("export const ACTIVE_ROLES"));
    expect(ativos).not.toContain("superadmin");
  });

  it("nenhum item de menu operacional foi criado para a rota", () => {
    expect(navegacao).not.toContain("/plataforma");
    expect(sidebar).not.toContain("/plataforma");
  });

  it("a página vive fora do AppLayout/AppSidebar", () => {
    expect(page).not.toContain("AppLayout");
    expect(page).not.toContain("AppSidebar");
  });
});

describe("SUPERADMIN HOME — somente leitura", () => {
  it("a tela não executa nenhuma escrita", () => {
    for (const fonte of [page, hooks]) {
      expect.soft(fonte).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
      // S3: escrita só pelas RPCs seguras de plataforma (superadmin + motivo).
      for (const m of fonte.match(/\.rpc\("([a-z_]+)"/g) ?? []) expect.soft(m).toMatch(/\.rpc\("platform_/);
    }
  });

  it("usa exclusivamente o cliente Supabase canônico", () => {
    expect(hooks).toContain('from "@/integrations/supabase/client"');
    expect(hooks).not.toContain("createClient");
  });

  it("consulta as tabelas do núcleo SaaS com colunas explícitas e sem SELECT *", () => {
    for (const tabela of [
      "saas_plans",
      "saas_modules",
      "saas_features",
      "organization_subscriptions",
      "organization_subscription_history",
    ]) {
      expect.soft(hooks, `faltou consulta a ${tabela}`).toContain(`.from("${tabela}")`);
    }
    expect(hooks).not.toContain('select("*")');
  });

  it("consultas não silenciam erro e não truncam em 1000 linhas", () => {
    expect(hooks).toContain("retry: false");
    expect(hooks).toContain("const LIMITE = 200");
    expect(hooks).toContain("throw new Error(error.message)");
  });

  it("a tela distingue carregando, erro (com nova tentativa) e vazio", () => {
    expect(page).toContain("Carregando…");
    expect(page).toContain("Tentar novamente");
    expect(page).toContain("mensagemVazio");
  });
});

describe("SUPERADMIN HOME — migration de leitura", () => {
  const sql = existsSync(path(`supabase/migrations/${M_HOME}`))
    ? read(`supabase/migrations/${M_HOME}`)
    : "";

  it("a migration existe, é transacional e idempotente", () => {
    expect(sql).not.toBe("");
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql).toContain("NOT EXISTS");
  });

  it("cria apenas policy de SELECT, ligada ao papel de plataforma", () => {
    expect(sql).toContain("FOR SELECT TO authenticated");
    expect(sql).toContain("public.is_platform_superadmin");
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(sql).not.toMatch(/\bGRANT\s+(INSERT|UPDATE|DELETE|ALL)\b/);
  });

  it("valida o resultado de forma fail-closed e não altera dados", () => {
    expect(sql).toContain("SUPERADMIN_HOME_VALIDACAO_FALHOU");
    expect(sql).not.toMatch(/\bINSERT INTO\b|\bDELETE FROM\b|\bUPDATE public\./);
  });
});
