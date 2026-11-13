import { describe, it, expect } from "vitest";
import { selectDraftCfop, isAutoCfop } from "@/lib/fiscal/draftCfopSelection";
const base = { cfopInState: "5101", cfopInterstate: "6101", emitterUf: "MG", destUf: "MG", issueDate: "2026-11-13", naturezaOperacao: "Venda de produção" };
describe("CFOP do rascunho", () => {
  it("MG→MG usa CFOP interno", () => expect(selectDraftCfop(base)).toEqual({ cfop: "5101", reason: "ok" }));
  it("MG→SP usa CFOP interestadual", () => expect(selectDraftCfop({ ...base, destUf: "SP" }).cfop).toBe("6101"));
  it("UF do destinatário ausente não presume interna", () => expect(selectDraftCfop({ ...base, destUf: null })).toEqual({ cfop: "", reason: "missing_dest_uf" }));
  it("UF do emitente ausente", () => expect(selectDraftCfop({ ...base, emitterUf: "" }).reason).toBe("missing_emitter_uf"));
  it("sem data de emissão", () => expect(selectDraftCfop({ ...base, issueDate: "" }).reason).toBe("missing_issue_date"));
  it("sem natureza da operação", () => expect(selectDraftCfop({ ...base, naturezaOperacao: undefined }).reason).toBe("missing_operation"));
  it("devolução não usa CFOP de venda", () => expect(selectDraftCfop({ ...base, naturezaOperacao: "Devolução de compra" }).cfop).toBe(""));
  it("finalidade complementar não presume", () => expect(selectDraftCfop({ ...base, finalidade: "2" }).reason).toBe("non_normal_purpose"));
  it("perfil sem CFOP interestadual", () => expect(selectDraftCfop({ ...base, destUf: "SP", cfopInterstate: null }).reason).toBe("missing_profile_cfop"));
  it("escolha manual é preservada", () => {
    expect(isAutoCfop("5102", { cfop_in_state: "5101", cfop_interstate: "6101" })).toBe(false);
    expect(isAutoCfop("5101", { cfop_in_state: "5101", cfop_interstate: "6101" })).toBe(true);
    expect(isAutoCfop("", undefined)).toBe(true);
  });
});
