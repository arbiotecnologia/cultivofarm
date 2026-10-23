import { describe, it, expect, beforeEach } from "vitest";
import {
  pauseStateKey,
  readPauseState,
  writePauseState,
  clearPauseState,
  clearAllPauseStates,
} from "@/lib/authz/pauseRetainedState";

const key = (epoch: number, userId = "u1") =>
  pauseStateKey({ userId, organizationId: "org1", roles: ["administrador"], epoch });

beforeEach(() => clearAllPauseStates());

describe("pauseRetainedState (retenção volátil de pausa transitória)", () => {
  it("escreve e lê o estado na mesma chave", () => {
    writePauseState(key(0), { open: true, target: { user_id: "x" } });
    expect(readPauseState(key(0))).toEqual({ open: true, target: { user_id: "x" } });
  });

  it("revogação (época nova) torna o estado retido inalcançável — deny", () => {
    writePauseState(key(0), { open: true, target: { user_id: "x" } });
    expect(readPauseState(key(1))).toBeNull();
  });

  it("troca de identidade (outro usuário) torna o estado inalcançável", () => {
    writePauseState(key(0, "u1"), { open: true });
    expect(readPauseState(key(0, "u2"))).toBeNull();
  });

  it("clearPauseState descarta apenas a chave alvo (fechamento explícito)", () => {
    writePauseState(key(0), { open: true });
    writePauseState(key(0) + ":draft:x", { profile: { nome: "Rascunho" }, reason: "" });
    clearPauseState(key(0) + ":draft:x");
    expect(readPauseState(key(0) + ":draft:x")).toBeNull();
    expect(readPauseState(key(0))).toEqual({ open: true });
  });

  it("clearAllPauseStates descarta tudo (troca de identidade/saída)", () => {
    writePauseState(key(0), { open: true });
    writePauseState(key(3, "u9"), { open: true });
    clearAllPauseStates();
    expect(readPauseState(key(0))).toBeNull();
    expect(readPauseState(key(3, "u9"))).toBeNull();
  });

  it("poda entradas antigas além do limite, mantendo as recentes", () => {
    for (let i = 0; i < 10; i++) writePauseState(key(i), { i });
    expect(readPauseState(key(0))).toBeNull();
    expect(readPauseState(key(1))).toBeNull();
    expect(readPauseState(key(9))).toEqual({ i: 9 });
    expect(readPauseState(key(8))).toEqual({ i: 8 });
  });

  it("reescrever a mesma chave substitui o valor sem duplicar", () => {
    writePauseState(key(0), { open: false });
    writePauseState(key(0), { open: true });
    expect(readPauseState(key(0))).toEqual({ open: true });
  });
});
