import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { senhaForte } from "@/components/auth/TrocaSenhaObrigatoria";

const troca = readFileSync("src/components/auth/TrocaSenhaObrigatoria.tsx", "utf-8");
const edge = readFileSync("supabase/functions/platform-complete-first-access/index.ts", "utf-8");
const convite = readFileSync("supabase/functions/platform-invite-org-admin/index.ts", "utf-8");

describe("primeiro acesso — política de senha", () => {
  it("exige 8–128 caracteres com letra e dígito", () => {
    expect(senhaForte("curta1")).toBe(false);
    expect(senhaForte("sóletras123")).toBe(true);
    expect(senhaForte("12345678")).toBe(false);
    expect(senhaForte("abcdefgh")).toBe(false);
    expect(senhaForte("a".repeat(128) + "1")).toBe(false);
    expect(senhaForte("Abcdefg1")).toBe(true);
  });

  it("a política do cliente e do servidor são a mesma", () => {
    expect(edge).toContain("s.length < 8 || s.length > 128");
    expect(edge).toContain("/[A-Za-z]/.test(s) && /\\d/.test(s)");
  });
});

describe("primeiro acesso — fluxo server-side", () => {
  it("não usa mais MD5, comparação de hash nem GUC na conclusão", () => {
    expect(edge).not.toMatch(/md5|encrypted_password|set_config/i);
  });

  it("Edge Function confirma identidade, estado server-only e conclui transacionalmente", () => {
    expect(edge).toContain("getClaims");
    expect(edge).toContain("platform_first_access_pending");
    expect(edge).toContain("updateUserById");
    expect(edge).toContain("platform_conclude_provisional_password_server");
  });

  it("falha na Admin API mantém o bloqueio (nada é limpo antes do sucesso)", () => {
    const ordemOk =
      edge.indexOf("updateUserById") < edge.indexOf("platform_conclude_provisional_password_server");
    expect(ordemOk).toBe(true);
    expect(edge).toContain("Estado permanece bloqueado");
  });

  it("cliente não chama mais a RPC antiga nem o Admin API diretamente", () => {
    expect(troca).not.toContain("platform_conclude_provisional_password");
    expect(troca).not.toContain("auth.updateUser");
    expect(troca).toContain("platform-complete-first-access");
  });
});

describe("primeiro acesso — convite e compensação", () => {
  it("redirectTo fica restrito à allowlist de origens", () => {
    expect(convite).toContain("lovable\\.app");
    expect(convite).toContain("cultivofarm\\.com\\.br");
    expect(convite).toContain("origemPermitida");
  });

  it("não confia em user_metadata para estado de primeiro acesso", () => {
    // user_metadata é usado apenas como rótulo no convite, nunca para autorizar
    // a liberação; a marca vive em profiles.senha_provisoria/estado server-only.
    expect(edge).not.toContain("user_metadata");
  });

  it("falha parcial remove apenas o usuário recém-criado", () => {
    expect(convite).toContain("criamosUsuario");
    expect(convite).toContain("deleteUser(userId)");
  });

  it("nenhum segredo em logs", () => {
    expect(edge).not.toMatch(/console\.(log|error|warn)/);
    expect(convite).not.toMatch(/console\.(log|error|warn)/);
    expect(troca).not.toMatch(/console\.(log|error|warn)/);
  });
});
