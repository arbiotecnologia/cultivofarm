import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const hardening = readFileSync(
  "supabase/migrations/20261002031850_0968ac43-e9f3-4497-b7de-94c897702102.sql",
  "utf8",
);
const denyCounter = readFileSync(
  "supabase/migrations/20261002031922_7290e0ed-50e8-498d-9d07-026b960ae4a7.sql",
  "utf8",
);

describe("D51.2 — bloqueios críticos de RLS para publicação", () => {
  it("remove as seis policies de leitura irrestrita", () => {
    for (const policy of [
      "codigo_sequencias leitura autenticada",
      "Anyone can read config",
      "fs_read_all_auth",
      "Visualização para usuários autenticados",
      "Authenticated can read objetivos sugestoes",
      "Authenticated can read sla",
    ]) {
      expect(hardening).toContain(`DROP POLICY IF EXISTS \"${policy}\"`);
    }
  });

  it("nega o contador ao cliente e preserva somente o acesso técnico", () => {
    expect(hardening).toMatch(
      /REVOKE ALL ON TABLE public\.codigo_sequencias FROM PUBLIC, anon, authenticated;/,
    );
    expect(hardening).toMatch(
      /GRANT ALL ON TABLE public\.codigo_sequencias TO service_role;/,
    );
    expect(denyCounter).toMatch(/AS RESTRICTIVE[\s\S]*FOR ALL TO authenticated/);
    expect(denyCounter).toMatch(/USING \(false\)[\s\S]*WITH CHECK \(false\)/);
  });

  it("protege configurações globais por conta ativa e papel financeiro", () => {
    expect(hardening).toContain("p.user_id = (SELECT auth.uid())");
    expect(hardening).toContain("p.ativo IS TRUE");
    expect(hardening).toContain(
      "public.is_financial_staff((SELECT auth.uid()))",
    );
    expect(hardening).toMatch(
      /REVOKE ALL ON TABLE public\.configuracoes_sistema FROM PUBLIC, anon, authenticated;/,
    );
    expect(hardening).toMatch(
      /REVOKE ALL ON TABLE public\.financial_settings FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("herda a autorização da visita para avisos de monitoramento", () => {
    expect(hardening).toContain("public.can_view_technical_visit(");
    expect(hardening).toContain("monitoramento_avisos.registro_consultor_id");
    expect(hardening).toMatch(
      /GRANT SELECT ON TABLE public\.monitoramento_avisos TO authenticated;/,
    );
  });

  it("limita sugestões e SLA aos papéis operacionais previstos", () => {
    for (const role of [
      "administrador",
      "gestor",
      "consultor_tecnico",
      "tecnico_agronomo",
    ]) {
      expect(hardening).toContain(`'${role}'::public.app_role`);
    }
    expect(hardening).not.toMatch(
      /CREATE POLICY[\s\S]{0,180}(?:USING|WITH CHECK) \(true\)/,
    );
  });
});