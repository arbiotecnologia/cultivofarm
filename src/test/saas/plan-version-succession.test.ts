import { describe, expect, it } from "vitest";
import { draftIdParaSalvar, ultimaVersaoPublicada } from "@/components/plataforma/commercialDraftState";

const v1 = { id: "v1", plan_id: "base", status: "PUBLISHED", version_number: 1 };
const v2 = { id: "v2", plan_id: "base", status: "DRAFT", version_number: 2 };

describe("sucessão de versão comercial", () => {
  it("nunca envia id PUBLISHED ao salvar: cria novo rascunho", () => {
    expect(draftIdParaSalvar("v1", [v1])).toBeNull();
  });
  it("segundo salvar reutiliza o mesmo DRAFT", () => {
    expect(draftIdParaSalvar("v2", [v1, v2])).toBe("v2");
  });
  it("id desconhecido ou nulo vira novo rascunho", () => {
    expect(draftIdParaSalvar("x", [v1, v2])).toBeNull();
    expect(draftIdParaSalvar(null, [v1, v2])).toBeNull();
  });
  it("usa a publicação mais recente do próprio plano como origem", () => {
    const v3 = { id: "v3", plan_id: "base", status: "PUBLISHED", version_number: 3 };
    const other = { id: "o", plan_id: "gestao", status: "PUBLISHED", version_number: 9 };
    expect(ultimaVersaoPublicada([v1, v3, other, v2], "base")?.id).toBe("v3");
    expect(ultimaVersaoPublicada([v2], "base")).toBeUndefined();
  });
});
