import { describe, expect, it, vi } from "vitest";
import { adminPasswordErrorMessage, adminPasswordMessage, changeAdminPassword } from "@/lib/configuracoes/adminPassword";

describe("admin password UI — contrato seguro efetivamente usado", () => {
  it.each([{}, { error: "private sentinel" }, { code: "unknown", message: "private sentinel" }, { code: "constructor" }, "private sentinel"])("ignora corpo arbitrário %j", (body) => {
    expect(adminPasswordMessage(body)).toBe(adminPasswordMessage(null));
  });
  it("distingue negação de falha de verificação sem usar mensagem remota", () => {
    expect(adminPasswordMessage({ code: "ADMIN_PASSWORD_FORBIDDEN" })).not.toBe(adminPasswordMessage({ code: "ADMIN_PASSWORD_AUTHORIZATION_ERROR" }));
  });
  it.each(["Abc1234", "abcdefgh", "12345678", "a1" + "x".repeat(127)])("senha inválida impede invoke %j", async (password) => {
    const invoke = vi.fn();
    await expect(changeAdminPassword("target", password, password, invoke, vi.fn())).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("confirmação divergente impede envio", async () => {
    const invoke = vi.fn();
    await expect(changeAdminPassword("target", "mockPass123", "otherPass123", invoke, vi.fn())).rejects.toThrow("As senhas não coincidem");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("FunctionsHttpError usa apenas código seguro lido no corpo", async () => {
    const read = vi.fn(async () => JSON.stringify({ code: "ADMIN_PASSWORD_AUTHORIZATION_ERROR", error: "private sentinel" }));
    const invoke = vi.fn(async () => ({ data: null, error: new Error("private sentinel") }));
    await expect(changeAdminPassword("target", "mockPass123", "mockPass123", invoke, read)).rejects.toThrow(adminPasswordMessage({ code: "ADMIN_PASSWORD_AUTHORIZATION_ERROR" }));
    expect(read).toHaveBeenCalledOnce();
  });
  it.each([{}, { success: false }, { error: "private sentinel" }])("resposta não estrita não vira sucesso %j", async (data) => {
    await expect(changeAdminPassword("target", "mockPass123", "mockPass123", async () => ({ data, error: null }), vi.fn())).rejects.toThrow(adminPasswordMessage(null));
  });
  it("sucesso explícito conclui sem ler erro", async () => {
    const read = vi.fn();
    await expect(changeAdminPassword("target", "mockPass123", "mockPass123", async () => ({ data: { success: true }, error: null }), read)).resolves.toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it("exceção de transporte e erro arbitrário não são expostos", async () => {
    const invoke = vi.fn(async () => { throw new Error("private sentinel"); });
    await expect(changeAdminPassword("target", "mockPass123", "mockPass123", invoke, vi.fn())).rejects.toThrow(adminPasswordMessage(null));
    expect(adminPasswordErrorMessage(new Error("private sentinel"))).toBe(adminPasswordMessage(null));
  });
});