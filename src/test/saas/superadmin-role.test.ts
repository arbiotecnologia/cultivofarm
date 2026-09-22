// FASE SUPERADMIN — papel de plataforma SaaS ('superadmin').
// Invariantes estáticos sobre as migrations canônicas e sobre o frontend.
//
// As provas comportamentais (admin não concede/remove/edita superadmin, usuário
// comum não autoeleva, gestão de papéis normais preservada, apenas o mecanismo
// interno concede/remove) foram executadas como sondas transacionais no banco
// canônico (BEGIN ... ROLLBACK, sem persistir dados) e estão registradas em
// docs/auditorias/superadmin-role-hardening-2026-09-22.md.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const M_ENUM = "20260922160033_90eac344-6cbb-45dc-8b61-275cbc8d11cc.sql";
const M_HARD = "20260922160218_b19bd8e6-cb90-4d27-805e-c97272039918.sql";
const M_FIX = "20260922160736_29af83f9-2f0d-4770-91d4-264de788ccc5.sql";

const path = (rel: string) => resolve(process.cwd(), rel);
const read = (rel: string) => readFileSync(path(rel), "utf8");

const sqlEnum = read(`supabase/migrations/${M_ENUM}`);
const sqlHard = read(`supabase/migrations/${M_HARD}`);
const sqlFix = read(`supabase/migrations/${M_FIX}`);

const permissions = read("src/lib/permissions.ts");
const portalContext = read("src/lib/portalContext.ts");
const edicaoRpc = read("src/lib/configuracoes/edicaoUsuarioRpc.ts");
const createUser = read("supabase/functions/create-user/index.ts");

/** Os 13 papéis operacionais que já existiam antes desta fase. */
const PAPEIS_ORIGINAIS = [
  "administrador",
  "tecnico_agronomo",
  "producao",
  "administrativo",
  "gestor",
  "cliente_produtor",
  "consultor_tecnico",
  "aplicador",
  "operador_onfarm",
  "financeiro",
  "gestor_comercial",
  "parceiro_b2b",
  "parceiro_b2b_tecnico",
] as const;

describe("SUPERADMIN — migrations", () => {
  it("as três migrations existem e são transacionais", () => {
    for (const [nome, sql] of [
      [M_ENUM, sqlEnum],
      [M_HARD, sqlHard],
      [M_FIX, sqlFix],
    ] as const) {
      expect.soft(existsSync(path(`supabase/migrations/${nome}`)), nome).toBe(true);
      expect.soft(sql, `${nome} deve abrir com BEGIN`).toMatch(/^BEGIN;$/m);
      expect.soft(sql.trimEnd().endsWith("COMMIT;"), `${nome} deve fechar com COMMIT`).toBe(true);

    }
  });

  it("adiciona 'superadmin' ao enum de forma idempotente", () => {
    expect(sqlEnum).toMatch(
      /ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS 'superadmin'/,
    );
  });

  it("não remove nem reordena nenhum dos 13 papéis existentes", () => {
    for (const papel of PAPEIS_ORIGINAIS) {
      expect
        .soft(sqlEnum, `não pode haver DROP/RENAME de ${papel}`)
        .not.toMatch(new RegExp(`(DROP|RENAME) VALUE[^;]*'${papel}'`, "i"));
    }
    expect(sqlEnum).not.toMatch(/DROP TYPE public\.app_role/);
  });

  it("nenhuma migration desta fase cria usuário ou mexe em senha", () => {
    for (const [nome, sql] of [
      [M_ENUM, sqlEnum],
      [M_HARD, sqlHard],
      [M_FIX, sqlFix],
    ] as const) {
      expect.soft(sql, `${nome} não pode tocar auth.users`).not.toMatch(
        /INSERT\s+INTO\s+auth\.users/i,
      );
      expect.soft(sql, `${nome} não pode alterar senha`).not.toMatch(/encrypted_password/i);
      expect.soft(sql, `${nome} não pode criar superadmin`).not.toMatch(
        /INSERT\s+INTO\s+public\.user_roles[^;]*'superadmin'/i,
      );
    }
  });

  it("cada migration termina com validação fail-closed", () => {
    expect.soft(sqlHard).toMatch(/RAISE EXCEPTION 'SUPERADMIN_M2_VALIDACAO_FALHOU/);
    expect.soft(sqlFix).toMatch(/RAISE EXCEPTION 'SUPERADMIN_M4_VALIDACAO_FALHOU/);
  });
});

describe("SUPERADMIN — travas no banco", () => {
  it("instala trigger de guarda em user_roles", () => {
    expect(sqlFix).toContain("CREATE TRIGGER trg_guard_superadmin_role_assignment");
    expect(sqlFix).toMatch(/BEFORE INSERT OR UPDATE OR DELETE ON public\.user_roles/);
  });

  it("o guard é SECURITY INVOKER — para enxergar o chamador real, não o dono da função", () => {
    const corpo = sqlFix.slice(
      sqlFix.indexOf("FUNCTION public.guard_superadmin_role_assignment"),
    );
    const trecho = corpo.slice(0, corpo.indexOf("CREATE TRIGGER"));
    expect(trecho).not.toMatch(/SECURITY DEFINER/);
    expect(trecho).toMatch(/current_user NOT IN \('service_role','postgres','supabase_admin'\)/);
    expect(trecho).toContain("superadmin_role_reserved");
  });

  it("separa leitura de escrita: admin lê tudo, mas não escreve o papel de plataforma", () => {
    expect.soft(sqlFix).toContain('DROP POLICY IF EXISTS "Admins can manage roles"');
    for (const p of [
      "Admins can read roles",
      "Admins can insert non platform roles",
      "Admins can update non platform roles",
      "Admins can delete non platform roles",
    ]) {
      expect.soft(sqlFix, `policy ausente: ${p}`).toContain(`CREATE POLICY "${p}"`);
    }
    const escrita = sqlFix.split('CREATE POLICY "Admins can insert non platform roles"')[1] ?? "";
    const ateFim = escrita.slice(0, escrita.indexOf("-- (d)"));
    const ocorrencias = ateFim.match(/role <> 'superadmin'::public\.app_role/g) ?? [];
    // insert(1) + update using/with check(2) + delete(1)
    expect(ocorrencias.length).toBeGreaterThanOrEqual(4);
  });

  it("a checagem dedicada não depende de perfil ativo (superadmin inativo também é protegido)", () => {
    expect(sqlFix).toMatch(/FUNCTION public\.is_platform_superadmin\(_user_id uuid\)/);
    const fn = sqlFix.slice(
      sqlFix.indexOf("FUNCTION public.is_platform_superadmin"),
      sqlFix.indexOf("REVOKE ALL ON FUNCTION public.is_platform_superadmin"),
    );
    expect(fn).toMatch(/SECURITY DEFINER/);
    expect(fn).toMatch(/SET search_path TO ''/);
    expect(fn).not.toMatch(/profiles/);
    expect(fn).not.toMatch(/ativo/);
  });

  it("a checagem dedicada não é executável por anon", () => {
    expect(sqlFix).toContain(
      "REVOKE ALL ON FUNCTION public.is_platform_superadmin(uuid) FROM anon",
    );
    expect(sqlFix).toContain(
      "REVOKE ALL ON FUNCTION public.is_platform_superadmin(uuid) FROM PUBLIC",
    );
  });

  it("a RPC de edição recusa o papel no payload e recusa alvo de plataforma", () => {
    expect(sqlFix).toContain("user_edit_superadmin_forbidden");
    expect(sqlFix).toContain("user_edit_superadmin_target");
    expect(sqlFix).toContain("public.is_platform_superadmin(p_user_id)");
  });

  it("a RPC de edição nunca apaga o papel de plataforma ao sincronizar papéis", () => {
    expect(sqlFix).toMatch(
      /DELETE FROM public\.user_roles WHERE user_id=p_user_id AND NOT\(role=ANY\(p_roles\)\) AND role<>'superadmin'/,
    );
  });

  it("a RPC de provisionamento recusa o papel de plataforma", () => {
    expect(sqlHard).toContain("superadmin_role_reserved");
    expect(sqlHard).toContain("admin_provision_user_profile_v1");
  });
});

describe("SUPERADMIN — serviço de criação de usuários", () => {
  it("bloqueia o papel de plataforma antes de qualquer escrita", () => {
    expect(createUser).toMatch(
      /rolesArr\.includes\("superadmin"\)\s*\|\|\s*role === "superadmin"/,
    );
    expect(createUser).toContain("superadmin_role_reserved");
    const idxGuard = createUser.indexOf('rolesArr.includes("superadmin")');
    const idxInsert = createUser.indexOf("user_roles");
    expect(idxGuard).toBeGreaterThan(0);
    expect(idxGuard).toBeLessThan(idxInsert);
  });
});

describe("SUPERADMIN — frontend", () => {
  it("AppRole reconhece o papel, preservando os 13 existentes", () => {
    const uniao = permissions.slice(
      permissions.indexOf("export type AppRole"),
      permissions.indexOf("export type AccessLevel"),
    );
    for (const papel of PAPEIS_ORIGINAIS) {
      expect.soft(uniao, `AppRole perdeu ${papel}`).toContain(`"${papel}"`);
    }
    expect(uniao).toContain('"superadmin"');
  });

  it("não recebe nenhum módulo operacional (fora de ACCESS_MAP e de ACTIVE_ROLES)", () => {
    const mapa = permissions.slice(
      permissions.indexOf("const ACCESS_MAP"),
      permissions.indexOf("export function getHomeForRole"),
    );
    expect(mapa).not.toContain("superadmin");

    const ativos = permissions.slice(permissions.indexOf("export const ACTIVE_ROLES"));
    expect(ativos).not.toContain("superadmin");
    for (const papel of PAPEIS_ORIGINAIS) {
      expect.soft(ativos, `ACTIVE_ROLES perdeu ${papel}`).toContain(`"${papel}"`);
    }
  });

  it("tem home segura provisória até o painel SaaS existir", () => {
    const home = permissions.slice(
      permissions.indexOf("export function getHomeForRole"),
      permissions.indexOf("export function isMobileProfile"),
    );
    expect(home).toMatch(/case "superadmin":\s*\n\s*return "\/sem-permissao";/);
  });

  it("é rótulo conhecido e é preservado no saneamento de papéis", () => {
    expect(permissions).toMatch(/superadmin: "Superadmin de Plataforma"/);
    const prio = portalContext.slice(
      portalContext.indexOf("const ROLE_PRIORITY"),
      portalContext.indexOf("const VALID_ROLES"),
    );
    expect(prio).toContain('"superadmin"');
    for (const papel of PAPEIS_ORIGINAIS) {
      expect.soft(prio, `ROLE_PRIORITY perdeu ${papel}`).toContain(`"${papel}"`);
    }
  });

  it("traduz os erros do servidor em mensagens seguras em PT-BR", () => {
    expect(edicaoRpc).toContain("user_edit_superadmin_forbidden:");
    expect(edicaoRpc).toContain("user_edit_superadmin_target:");
    expect(edicaoRpc).not.toMatch(/superadmin_role_reserved:/);
  });
});

describe("SUPERADMIN — escopo desta rodada", () => {
  it("não cria usuário mestre nem tela/painel SaaS", () => {
    for (const sql of [sqlEnum, sqlHard, sqlFix]) {
      expect.soft(sql).not.toMatch(/mestre@arbio\.com/i);
    }
    expect(existsSync(path("src/pages/superadmin"))).toBe(false);
  });
});
