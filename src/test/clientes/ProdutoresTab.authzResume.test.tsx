// Contrato do módulo de retomada (unidade). Fluxo integrado em
// ProdutoresTab.authzResume.integration.test.tsx (AuthProvider/monitor reais).
import { beforeEach, describe, expect, it } from "vitest";
import { __peekResumeForTests, armResumeOnTimeout, clearResume, rememberResume, resumePrincipalKey, takeResume, RESUME_TTL_MS } from "@/lib/navigation/protectedResumeContext";

const P = resumePrincipalKey("U", "O", ["b", "a"]);
beforeEach(() => clearResume());

describe("protectedResumeContext", () => {
  it("principal exige usuário, empresa e papéis; papéis ordenados", () => {
    expect(resumePrincipalKey(null, "O", ["a"])).toBeNull();
    expect(resumePrincipalKey("U", null, ["a"])).toBeNull();
    expect(resumePrincipalKey("U", "O", [])).toBeNull();
    expect(P).toBe(resumePrincipalKey("U", "O", ["a", "b"]));
  });
  it("sem timeout armado não retoma (remontagem qualquer)", () => {
    rememberResume(P, "/r", "C", "documentos");
    expect(takeResume(P, "/r", 1)).toBeNull();
  });
  it("só a aba Documentos é guardada", () => {
    for (const t of ["geral", "endereco", "financeiro", "portal", "x"]) { rememberResume(P, "/r", "C", t); expect(__peekResumeForTests()).toBeNull(); }
  });
  it("TTL conta da pausa, não da abertura", () => {
    rememberResume(P, "/r", "C", "documentos");
    armResumeOnTimeout(P, 1_000_000);
    expect(takeResume(P, "/r", 1_000_000 + RESUME_TTL_MS)).toEqual({ recordId: "C", tab: "documentos" });
    rememberResume(P, "/r", "C", "documentos"); armResumeOnTimeout(P, 0);
    expect(takeResume(P, "/r", RESUME_TTL_MS + 1)).toBeNull();
  });
  it("timeout com principal divergente descarta; rota diferente descarta; consumo único", () => {
    rememberResume(P, "/r", "C", "documentos"); armResumeOnTimeout(resumePrincipalKey("U", "O", ["a"]), 0);
    expect(__peekResumeForTests()).toBeNull();
    rememberResume(P, "/r", "C", "documentos"); armResumeOnTimeout(P, 0);
    expect(takeResume(P, "/x", 1)).toBeNull();
    rememberResume(P, "/r", "C", "documentos"); armResumeOnTimeout(P, 0);
    expect(takeResume(P, "/r", 1)).not.toBeNull();
    expect(takeResume(P, "/r", 2)).toBeNull();
  });
});
