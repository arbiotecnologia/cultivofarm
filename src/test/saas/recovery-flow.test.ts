import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { completeRecoveryPassword } from "@/lib/saas/recoveryFlow";

describe("recovery de senha — finalizador único", () => {
  it("primeiro acesso conclui no servidor sem updateUser direto", async () => {
    const completeFirstAccess = vi.fn().mockResolvedValue({ error: null });
    const updatePassword = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue(undefined);

    await expect(completeRecoveryPassword("first_access", "SenhaSegura1", {
      completeFirstAccess,
      updatePassword,
      signOut,
    })).resolves.toEqual({ ok: true, error: null });

    expect(completeFirstAccess).toHaveBeenCalledOnce();
    expect(updatePassword).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("recovery comum usa updateUser e não chama conclusão de primeiro acesso", async () => {
    const completeFirstAccess = vi.fn().mockResolvedValue({ error: null });
    const updatePassword = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue(undefined);

    await completeRecoveryPassword("common", "SenhaSegura2", {
      completeFirstAccess,
      updatePassword,
      signOut,
    });

    expect(updatePassword).toHaveBeenCalledOnce();
    expect(completeFirstAccess).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("falha no finalizador mantém a sessão e não executa outro caminho", async () => {
    const failure = new Error("sanitized");
    const completeFirstAccess = vi.fn().mockResolvedValue({ error: failure });
    const updatePassword = vi.fn().mockResolvedValue({ error: null });
    const signOut = vi.fn().mockResolvedValue(undefined);

    await expect(completeRecoveryPassword("first_access", "SenhaSegura3", {
      completeFirstAccess,
      updatePassword,
      signOut,
    })).resolves.toEqual({ ok: false, error: failure });

    expect(updatePassword).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("recovery de senha — contrato fail-closed", () => {
  it("a tela exige diagnóstico booleano antes de habilitar a alteração", async () => {
    const source = readFileSync("src/pages/ResetPassword.tsx", "utf-8");
    expect(source).toContain('body: { diagnostico: true }');
    expect(source).toContain('typeof data?.pendente !== "boolean"');
    expect(source).toContain('if (!recoveryMode)');
    expect(source).toContain('disabled={loading || checkingMode || !recoveryMode}');
  });

  it("preserva a limpeza do fragmento após o consumo Auth sem registrar segredos", async () => {
    const source = readFileSync("src/pages/ResetPassword.tsx", "utf-8");
    expect(source).toContain("limparCredenciaisDaUrl");
    expect(source).toContain("supabase.auth.getSession()");
    expect(source).not.toMatch(/console\.(log|error|warn)/);
  });
});