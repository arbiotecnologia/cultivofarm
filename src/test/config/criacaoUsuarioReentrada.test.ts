import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Execute the actual form handler, not a copy of the lock implementation.
const source = readFileSync("src/pages/Configuracoes.tsx", "utf8");
const ast = ts.createSourceFile("Configuracoes.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handlerSource = "";
function findHandler(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleCriarUsuario") {
    handlerSource = node.getText(ast);
  }
  ts.forEachChild(node, findHandler);
}
findHandler(ast);
if (!handlerSource) throw new Error("missing_create_handler");
const javascript = ts.transpileModule(handlerSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function harness() {
  const lock = { current: false };
  const invoke = vi.fn<() => Promise<unknown>>();
  const validar = vi.fn(() => ({}));
  const primeiro = vi.fn<() => string | null>(() => null);
  const mutation = { isPending: false, mutateAsync: invoke };
  const handler: () => Promise<void> = new Function(
    "createSubmitLock", "createUser", "newUser", "validateUserDraft",
    "setCreateErros", "primeiroCampoInvalido", "setCreateResumo", "requestAnimationFrame", "campoRefs", "selectedClients", "primaryClient", "registrationKind", "createFence",
    `${javascript}; return handleCriarUsuario;`,
  )(lock, mutation, {}, validar, vi.fn(), primeiro, vi.fn(), vi.fn(), { current: {} }, [], null, "internal", { capture: () => () => true });
  return { handler, lock, invoke, mutation, primeiro };
}

describe("criação de usuário — exclusão síncrona do formulário real", () => {
  it("lock é ref por formulário e disabled/isPending permanecem", () => {
    expect(source).toMatch(/const createSubmitLock = useRef\(false\)/);
    expect(source).toContain("disabled={createUser.isPending}");
  });
  it.each(["sucesso", "falha"])("dois envios enquanto pendente invocam uma vez; libera após %s", async (outcome) => {
    const h = harness();
    let resolve: ((value: unknown) => void) | undefined;
    let reject: ((reason: Error) => void) | undefined;
    h.invoke.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
    const first = h.handler();
    const second = h.handler(); // React has not rendered isPending yet.
    await second;
    await h.handler(); // Another event during the same in-flight request.
    expect(h.invoke).toHaveBeenCalledOnce();
    expect(h.lock.current).toBe(true);
    expect(h.mutation.isPending).toBe(false);
    if (outcome === "sucesso") resolve?.({ success: true });
    else reject?.(new Error("sanitized_failure"));
    await first;
    expect(h.lock.current).toBe(false);
    h.invoke.mockResolvedValueOnce({ success: true });
    await h.handler();
    expect(h.invoke).toHaveBeenCalledTimes(2);
    expect(h.lock.current).toBe(false);
  });
  it("validação inválida libera o lock sem invocação", async () => {
    const h = harness();
    h.primeiro.mockReturnValueOnce("nome");
    await h.handler();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.lock.current).toBe(false);
  });
  it("isPending existente também impede envio", async () => {
    const h = harness();
    h.mutation.isPending = true;
    await h.handler();
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.lock.current).toBe(false);
  });
});