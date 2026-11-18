import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentaryAI } from "@/components/protocolos/catalog/DocumentaryAI";
import { documentarySchema, retainVerifiedSources, selectedDocumentaryValues } from "@/lib/catalogo/documentarySuggestions";
import { familyForNewProduct, productMatchesFamily } from "@/lib/catalogo/productFamilies";

const state = vi.hoisted(() => ({ invoke: vi.fn(), ready: true }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: state.invoke } } }));
vi.mock("@/hooks/useTenantCatalogEditor", () => ({ useTenantCatalogEditor: () => ({ canEdit: state.ready, scope: "actor-A", capture: () => () => state.ready }) }));
const source = { url: "https://example.org/ficha", title: "Ficha do fabricante", excerpt: "Descrição comercial documentada" };
const candidate = (key: string) => ({ key, name: `Produto ${key}`, manufacturer: key, registration: null, sources: [source] });
const suggestion = (key = "A") => ({ candidate_key: key, field: "descricao" as const, value: "Descrição sugerida", sources: [source] });
const props = { identity: { name: "Produto identificado", manufacturer: "Fabricante", registration: "", entity: "produto" as const }, values: { descricao: "Rascunho atual" }, allowed: ["descricao"], onApply: vi.fn() };
beforeEach(() => { state.ready = true; state.invoke.mockReset(); props.onApply.mockReset(); });
afterEach(cleanup);
it.each(["biologico", "quimico", "fertilizante_adubo"] as const)("família %s pré-seleciona e usa metadado canônico, não tipo legado", family => {
  expect(familyForNewProduct(family)).toBe(family);
  expect(productMatchesFamily(family, family)).toBe(true);
  expect(productMatchesFamily(null, family)).toBe(false);
});
it("legados ficam sem classificação e Todos não inventa família", () => {
  expect(productMatchesFamily("solo", "sem_classificacao")).toBe(true);
  expect(productMatchesFamily(null, "sem_classificacao")).toBe(true);
  expect(familyForNewProduct("sem_classificacao")).toBe("");
  expect(familyForNewProduct("todos")).toBe("");
});
it("descarta URL inventada e campos sem fonte ou candidato correspondente", () => {
  const parsed = documentarySchema.parse({ candidates: [candidate("A")], suggestions: [suggestion(), { ...suggestion(), field: "modo_acao", sources: [{ ...source, url: "https://inventada.example/" }] }] });
  expect(retainVerifiedSources(parsed, new Set([source.url])).suggestions.map(s => s.field)).toEqual(["descricao"]);
  expect(retainVerifiedSources(parsed, new Set()).suggestions).toEqual([]);
  expect(documentarySchema.safeParse({ candidates: [candidate("A")], suggestions: [{ ...suggestion(), sources: [] }] }).success).toBe(false);
});
it("aplica somente seleção do candidato e allowlist sem salvar", () => {
  const result = { candidates: [candidate("A"), candidate("B")], suggestions: [suggestion(), { ...suggestion("B"), value: "Outra" }] };
  expect(selectedDocumentaryValues(result, "", ["descricao"], ["descricao"])).toEqual({});
  expect(selectedDocumentaryValues(result, "A", [], ["descricao"])).toEqual({});
  expect(selectedDocumentaryValues(result, "B", ["descricao"], ["descricao"])).toEqual({ descricao: "Outra" });
  expect(selectedDocumentaryValues(result, "A", ["descricao"], [])).toEqual({});
});
it("resposta válida compara atual/sugestão e aguarda seleção explícita", async () => {
  state.invoke.mockResolvedValue({ data: { candidates: [candidate("A")], suggestions: [suggestion()] }, error: null });
  render(<DocumentaryAI {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
  await screen.findByText("Descrição sugerida");
  expect(screen.getByText("Rascunho atual")).toBeTruthy();
  expect(props.onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "descricao" }));
  fireEvent.click(screen.getByRole("button", { name: "Aplicar campos selecionados ao rascunho" }));
  expect(props.onApply).toHaveBeenCalledExactlyOnceWith({ descricao: "Descrição sugerida" });
  expect(state.invoke).toHaveBeenCalledTimes(1);
});
it("ambiguidade exige escolha e não exibe campos de candidatos combinados", async () => {
  state.invoke.mockResolvedValue({ data: { candidates: [candidate("A"), candidate("B")], suggestions: [suggestion()] }, error: null });
  render(<DocumentaryAI {...props} />); fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
  await screen.findByText("Escolha entre as identificações encontradas");
  expect(screen.queryByRole("checkbox", { name: "descricao" })).toBeNull();
  expect(props.onApply).not.toHaveBeenCalled();
});
it("erro preserva formulário sem aplicações e sem retry automático", async () => {
  state.invoke.mockResolvedValue({ data: null, error: new Error("indisponível") });
  render(<DocumentaryAI {...props} />); fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
  expect((await screen.findByRole("alert")).textContent).toContain("formulário foi preservado");
  expect(props.onApply).not.toHaveBeenCalled(); expect(state.invoke).toHaveBeenCalledTimes(1);
});
it("troca de identidade aborta e descarta resposta atrasada", async () => {
  let resolve: (v: unknown) => void = () => {};
  state.invoke.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<DocumentaryAI {...props} />); fireEvent.click(screen.getByRole("button", { name: "Gerar com IA" }));
  view.rerender(<DocumentaryAI {...props} identity={{ ...props.identity, name: "Outro produto" }} />);
  resolve({ data: { candidates: [candidate("A")], suggestions: [suggestion()] }, error: null });
  await waitFor(() => expect(screen.queryByText("Descrição sugerida")).toBeNull());
  expect(props.onApply).not.toHaveBeenCalled();
});
it("papel não competente não monta pesquisa", () => { state.ready = false; render(<DocumentaryAI {...props} />); expect(screen.queryByRole("button")).toBeNull(); });it('cancelar permite nova tentativa e resposta antiga não substitui resultado',async()=>{
 let finish:(value:unknown)=>void=()=>{};
 state.invoke.mockReturnValueOnce(new Promise(r=>{finish=r;})).mockResolvedValueOnce({data:{candidates:[candidate('A')],suggestions:[suggestion()]},error:null});
 render(<DocumentaryAI {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Gerar com IA'}));fireEvent.click(screen.getByRole('button',{name:'Parar'}));fireEvent.click(screen.getByRole('button',{name:'Gerar com IA'}));await screen.findByText('Descrição sugerida');
 finish({data:{candidates:[candidate('A')],suggestions:[{...suggestion(),value:'Antiga'}]},error:null});await waitFor(()=>expect(screen.queryByText('Antiga')).toBeNull());expect(state.invoke).toHaveBeenCalledTimes(2);
});
it.each([401,403,429,402])('diferencia erro HTTP %s sem aplicar nem retry',async status=>{state.invoke.mockResolvedValue({data:null,error:{context:new Response('{}',{status})}});render(<DocumentaryAI {...props}/>);fireEvent.click(screen.getByRole('button',{name:'Gerar com IA'}));await screen.findByRole('alert');expect(props.onApply).not.toHaveBeenCalled();expect(state.invoke).toHaveBeenCalledOnce();});
it('persiste seleção de fontes via callback explícito sem salvar automaticamente',async()=>{state.invoke.mockResolvedValue({data:{candidates:[candidate('A')],suggestions:[suggestion()]},error:null});const evidence=vi.fn();render(<DocumentaryAI {...props} onEvidence={evidence}/>);fireEvent.click(screen.getByRole('button',{name:'Gerar com IA'}));await screen.findByText('Descrição sugerida');fireEvent.click(screen.getByRole('checkbox',{name:'descricao'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar campos selecionados ao rascunho'}));expect(evidence).toHaveBeenCalledWith([expect.objectContaining({field:'descricao',value:'Descrição sugerida',sources:[source]})]);expect(state.invoke).toHaveBeenCalledOnce();});
