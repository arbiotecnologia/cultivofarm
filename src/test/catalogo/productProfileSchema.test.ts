import { expect, it } from "vitest";
import { parseProductProfileRows } from "@/lib/catalogo/productProfileSchema";
const root = { id: "f1", produto_id: "p1", updated_at: "2026-11-18T03:48:00Z", status_validacao: "rascunho", resumo_curto: "Texto exato", beneficio_combinado: null, explicacao_tecnica: null, explicacao_produtor: null, explicacao_b2b: null, indicacoes_uso: null, janela_aplicacao: null, cuidados_aplicacao: null, compatibilidade: null, observacoes_regulatorias: null, validado_em: null, created_at: "2026-11-18T03:48:00Z" };
it("preserva a revisão observada e o texto sem normalizar", () => {
  expect(parseProductProfileRows(root, [], [], [], "p1").profile).toMatchObject(root);
});
it("recusa perfil de outro produto", () => {
  expect(() => parseProductProfileRows(root, [], [], [], "p2")).toThrow();
});
it("recusa texto inválido e revisão ausente", () => {
  expect(() => parseProductProfileRows({ ...root, resumo_curto: 12 }, [], [], [], "p1")).toThrow();
  expect(() => parseProductProfileRows({ ...root, updated_at: null }, [], [], [], "p1")).toThrow();
});
it("não esconde schema incorreto dos filhos como vazio", () => {
  expect(() => parseProductProfileRows(root, {}, [], [], "p1")).toThrow();
  expect(() => parseProductProfileRows(root, [], [], [{ volume_ml: "12" }], "p1")).toThrow();
});
it("distingue ausência de perfil de envelope incompleto", () => {
 expect(parseProductProfileRows(null, [], [], [], "p1").profile).toBeNull();
 const { compatibilidade, ...missing } = root;
 expect(() => parseProductProfileRows(missing, [], [], [], "p1")).toThrow();
 expect(() => parseProductProfileRows(undefined, [], [], [], "p1")).toThrow();
});
