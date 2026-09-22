// FASE S1 — Núcleo de dados SaaS.
// Invariantes estáticos sobre a migration canônica: estrutura, constraints,
// índices, RLS/grants, imutabilidade do histórico e escopo (nada de entitlement
// engine, overrides, contadores de uso, billing ou gates de rota nesta fase).
//
// As provas comportamentais (unicidade, append-only, FKs, enum, RLS anon/auth,
// leitura cruzada entre organizações) foram executadas como sondas transacionais
// no banco canônico e estão registradas em
// docs/auditorias/fase-s1-core-saas-2026-09-22.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "20260922154526_3c081c07-9ce8-4f78-8355-a660aef594b4.sql";
const path = (rel: string) => resolve(process.cwd(), rel);
const read = (rel: string) => readFileSync(path(rel), "utf8");

const sql = read(`supabase/migrations/${MIGRATION}`);

const TABELAS = [
  "saas_modules",
  "saas_features",
  "saas_plans",
  "saas_plan_features",
  "organization_subscriptions",
  "organization_subscription_history",
] as const;

describe("FASE S1 — migration do núcleo SaaS", () => {
  it("a migration existe e é transacional", () => {
    expect(existsSync(path(`supabase/migrations/${MIGRATION}`))).toBe(true);
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("cria as seis tabelas do escopo, de forma idempotente", () => {
    for (const t of TABELAS) {
      expect.soft(sql, `${t} deve ser criada`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    }
  });

  it("termina com bloco de validação fail-closed", () => {
    expect(sql).toContain("FASE_S1_VALIDACAO_FALHOU");
    expect(sql).toMatch(/RAISE EXCEPTION 'FASE_S1_VALIDACAO_FALHOU/);
  });
});

describe("FASE S1 — RLS, grants e ausência de API de mutação", () => {
  it("todas as tabelas habilitam RLS", () => {
    for (const t of TABELAS) {
      expect.soft(sql, `${t} sem ENABLE ROW LEVEL SECURITY`).toContain(
        `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`,
      );
    }
  });

  it("revoga privilégios herdados e concede apenas leitura a authenticated", () => {
    for (const t of TABELAS) {
      expect.soft(sql, `${t} sem REVOKE`).toContain(
        `REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated;`,
      );
      expect.soft(sql, `${t} sem SELECT para authenticated`).toContain(
        `GRANT SELECT ON public.${t} TO authenticated;`,
      );
      expect.soft(sql, `${t} sem GRANT para service_role`).toContain(
        `GRANT ALL ON public.${t} TO service_role;`,
      );
    }
  });

  it("nenhum GRANT para anon em tabela saas", () => {
    for (const t of TABELAS) {
      expect.soft(sql, `${t} não pode ter grant para anon`).not.toMatch(
        new RegExp(String.raw`GRANT[^;]*ON public\.${t}[^;]*TO[^;]*\banon\b`, "i"),
      );
    }
  });

  it("a única policy é de leitura para administrador", () => {
    expect(sql).toContain("CREATE POLICY saas_admin_read ON public.%I FOR SELECT TO authenticated");
    expect(sql).toContain("public.has_role((SELECT auth.uid()), ''administrador''::public.app_role)");
    // Nenhuma policy de escrita nesta fase.
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]{0,200}FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("valida grants e ausência de policy de escrita dentro da própria migration", () => {
    expect(sql).toContain("anon possui grant em tabela saas");
    expect(sql).toContain("authenticated possui grant de escrita em tabela saas");
    expect(sql).toContain("existe policy de escrita em tabela saas");
  });
});

describe("FASE S1 — constraints, FKs e índices", () => {
  it("chaves únicas e formato das chaves de catálogo", () => {
    expect(sql).toContain("CONSTRAINT saas_modules_key_unique UNIQUE (key)");
    expect(sql).toContain("CONSTRAINT saas_features_key_unique UNIQUE (key)");
    expect(sql).toContain("CONSTRAINT saas_plans_key_unique UNIQUE (key)");
    expect(sql).toContain("saas_modules_key_format");
    expect(sql).toContain("saas_features_key_format");
    expect(sql).toContain("saas_plans_key_format");
  });

  it("FKs restritivas (sem CASCADE destrutivo)", () => {
    expect(sql).not.toMatch(/ON DELETE CASCADE/i);
    const fks = sql.match(/REFERENCES public\.\w+\(id\) ON UPDATE RESTRICT ON DELETE RESTRICT/g) ?? [];
    // features->modules, plan_features->plans, plan_features->features,
    // subscriptions->organizations, subscriptions->plans,
    // history->subscriptions, history->organizations
    expect(fks.length).toBe(7);
  });

  it("no máximo um plano padrão ativo", () => {
    expect(sql).toContain("uq_saas_plans_single_active_default");
    expect(sql).toMatch(/WHERE is_default AND active/);
    expect(sql).toContain("saas_plans_default_requires_active");
  });

  it("no máximo uma assinatura corrente por organização", () => {
    expect(sql).toContain("uq_org_subscriptions_one_current");
    expect(sql).toMatch(/WHERE status IN \('TRIAL','ACTIVE','PAST_DUE','SUSPENDED'\)/);
  });

  it("status por enum explícito com os seis valores exigidos", () => {
    expect(sql).toContain("CREATE TYPE public.saas_subscription_status AS ENUM");
    for (const s of ["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED", "EXPIRED"]) {
      expect.soft(sql, `status ${s} ausente`).toContain(`'${s}'`);
    }
  });

  it("checks de consistência de ciclo de vida e de payloads jsonb", () => {
    expect(sql).toContain("org_subscriptions_cancelled_consistency");
    expect(sql).toContain("org_subscriptions_suspended_consistency");
    expect(sql).toContain("org_subscriptions_period_order");
    expect(sql).toContain("org_subscriptions_billing_cycle_valid");
    expect(sql).toContain("saas_plan_features_limit_nonnegative");
    expect(sql).toContain("saas_plan_features_config_object");
    expect(sql).toContain("org_subscription_history_old_object");
    expect(sql).toContain("org_subscription_history_new_object");
  });

  it("índices em FKs e colunas de busca", () => {
    for (const idx of [
      "idx_saas_features_module_id",
      "idx_saas_plan_features_feature_id",
      "idx_org_subscriptions_plan_id",
      "idx_org_subscriptions_status",
      "idx_org_subscriptions_org_status",
      "idx_org_sub_history_subscription_id",
      "idx_org_sub_history_org_created",
    ]) {
      expect.soft(sql, `${idx} ausente`).toContain(idx);
    }
  });

  it("timestamps e autoria", () => {
    expect(sql).toContain("created_by           uuid NULL");
    expect(sql).toContain("actor_user_id   uuid NULL");
    const triggers = sql.match(/update_updated_at_column\(\)/g) ?? [];
    expect(triggers.length).toBeGreaterThanOrEqual(1);
  });
});

describe("FASE S1 — histórico append-only e auditoria automática", () => {
  it("bloqueia UPDATE e DELETE no histórico", () => {
    expect(sql).toContain("saas_subscription_history_no_mutation");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON public.organization_subscription_history");
    expect(sql).toContain("append-only");
  });

  it("bloqueia DELETE de assinatura (ciclo de vida por status)", () => {
    expect(sql).toContain("saas_subscription_no_delete");
    expect(sql).toContain("BEFORE DELETE ON public.organization_subscriptions");
  });

  it("registra INSERT e UPDATE de assinatura no histórico", () => {
    expect(sql).toContain("saas_subscription_audit");
    expect(sql).toContain("AFTER INSERT OR UPDATE ON public.organization_subscriptions");
    expect(sql).toContain("auth.uid()");
  });

  it("funções de trigger são SECURITY DEFINER com search_path fixo e sem EXECUTE público", () => {
    for (const fn of [
      "saas_subscription_history_no_mutation",
      "saas_subscription_no_delete",
      "saas_subscription_audit",
    ]) {
      const bloco = sql.slice(sql.indexOf(`FUNCTION public.${fn}`));
      expect.soft(bloco.slice(0, 600), `${fn} sem SECURITY DEFINER`).toContain("SECURITY DEFINER");
      expect.soft(bloco.slice(0, 600), `${fn} sem search_path`).toContain("SET search_path TO 'public'");
      expect.soft(sql, `${fn} sem REVOKE`).toContain(
        `REVOKE ALL ON FUNCTION public.${fn}() FROM PUBLIC, anon, authenticated;`,
      );
    }
  });
});

describe("FASE S1 — seed neutro", () => {
  it("cria apenas o plano padrão técnico, de forma idempotente", () => {
    expect(sql).toContain("INSERT INTO public.saas_plans (key, name, description, active, is_default)");
    expect(sql).toContain("'base', 'Plano Base'");
    expect(sql).toContain("ON CONFLICT (key) DO NOTHING");
  });

  it("não cria módulos, features, vínculos nem assinaturas", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.saas_modules/);
    expect(sql).not.toMatch(/INSERT INTO public\.saas_features/);
    expect(sql).not.toMatch(/INSERT INTO public\.saas_plan_features/);
    expect(sql).not.toMatch(/INSERT INTO public\.organization_subscriptions/);
    expect(sql).toContain("assinatura criada indevidamente na S1");
  });
});

describe("FASE S1 — escopo: S2 permanece bloqueada", () => {
  it("a migration não cria objetos fora do escopo S1", () => {
    for (const proibido of [
      "organization_feature_overrides",
      "saas_usage_counters",
      "get_my_entitlements",
    ]) {
      expect.soft(sql, `${proibido} não pertence à S1`).not.toContain(proibido);
    }
  });

  it("nenhuma tabela de negócio recebeu organization_id nesta fase", () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.(?!saas_|organization_subscription)/);
    expect(sql).not.toMatch(/ADD COLUMN[\s\S]{0,40}organization_id/i);
  });

  // Atualizado pela home provisória do superadmin: o único consumo permitido no
  // frontend é a LEITURA em `/plataforma` (src/hooks/usePlataformaSaaS.ts).
  // Nenhum módulo operacional, menu ou escrita pode tocar o núcleo SaaS.
  it("o núcleo SaaS só é consumido pela home de plataforma, em leitura", () => {
    const alvos = ["src/lib", "src/hooks", "src/pages", "src/components", "src/config", "src/routes"];
    const encontrados: string[] = [];
    const varrer = (dir: string) => {
      if (!existsSync(path(dir))) return;
      for (const e of readdirSync(path(dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) varrer(rel);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const c = read(rel);
          if (/saas_plans|saas_modules|saas_features|saas_plan_features|organization_subscriptions|organization_subscription_history/.test(c)) {
            encontrados.push(rel);
          }
        }
      }
    };
    alvos.forEach(varrer);
    expect(encontrados).toEqual(["src/hooks/usePlataformaSaaS.ts"]);
    const leitura = read("src/hooks/usePlataformaSaaS.ts");
    expect(leitura).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|useMutation/);
  });

  it("o relatório da fase existe", () => {
    expect(existsSync(path("docs/auditorias/fase-s1-core-saas-2026-09-22.md"))).toBe(true);
  });
});
