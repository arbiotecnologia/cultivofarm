import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { changeAdminPassword, adminPasswordErrorMessage, adminPasswordMessage } from "@/lib/configuracoes/adminPassword";

const text = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const ast = ts.createSourceFile("page.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "updateUserPassword" && node.initializer) expression = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
if (!expression) throw new Error("missing_real_password_mutation");
const js = ts.transpileModule(`const result = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function harness() {
  const invoke = vi.fn();
  const toast = vi.fn();
  const readError = vi.fn(async () => JSON.stringify({ code: "ADMIN_PASSWORD_AUTHORIZATION_ERROR", error: "private sentinel" }));
  const setPassword = vi.fn();
  const mutation = new Function("useMutation", "editUser", "newPassword", "confirmPassword", "supabase", "changeAdminPassword", "lerCorpoErroFuncao", "toast", "setNewPassword", "setConfirmPassword", "adminPasswordErrorMessage", `${js}; return result;`)(
    (options: unknown) => options, { user_id: "target" }, "mockPass123", "mockPass123", { functions: { invoke } }, changeAdminPassword, readError, toast, setPassword, vi.fn(), adminPasswordErrorMessage,
  ) as { mutationFn: () => Promise<void>; onError: (e: unknown) => void; onSuccess: () => void };
  return { mutation, invoke, toast, readError, setPassword };
}

describe("Configurações — mutation real de senha sem rede", () => {
  it("erro 500 do handler não vira sucesso e toast só usa código público", async () => {
    const h = harness();
    h.invoke.mockResolvedValue({ data: null, error: new Error("private sentinel") });
    try { await h.mutation.mutationFn(); throw new Error("unexpected_success"); }
    catch (e) { h.mutation.onError(e); }
    expect(h.invoke).toHaveBeenCalledExactlyOnceWith("admin-update-user-password", { body: { user_id: "target", new_password: "mockPass123" } });
    expect(h.toast.mock.calls[0]?.[0].description).toBe(adminPasswordMessage({ code: "ADMIN_PASSWORD_AUTHORIZATION_ERROR" }));
    expect(JSON.stringify(h.toast.mock.calls)).not.toContain("private sentinel");
    expect(h.setPassword).not.toHaveBeenCalled();
  });
  it("sucesso estrito mantém fluxo de limpeza local, sem segunda chamada ou recovery", async () => {
    const h = harness();
    h.invoke.mockResolvedValue({ data: { success: true }, error: null });
    await h.mutation.mutationFn();
    h.mutation.onSuccess();
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(h.setPassword).toHaveBeenCalledExactlyOnceWith("");
    expect(h.readError).not.toHaveBeenCalled();
  });
});