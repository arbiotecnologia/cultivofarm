import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  error: false, success: true, evidenceError: false, revision: "2026-11-18T04:00:00Z",
  evidenceRevision: "2026-11-18T04:00:00Z", absent: false,
  evidence: [] as any[], history: null as any, dossier: null as any, dossierError:false,
  refetch: vi.fn(), evidenceRefetch: vi.fn(), save: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ profile: { organization_id: "org1" }, roles: ["gestor"] }) }));
vi.mock("@/hooks/useTenantCatalogEditor", () => ({ useTenantCatalogEditor: () => ({ scope: "scope1", canEdit: true, ready: true, capture: () => () => true }) }));
vi.mock("@/hooks/useProductProfile", () => ({
  useProductProfile: () => ({ isSuccess: state.success, isError: state.error, data: { profile: state.absent ? null : { id: "profile1", updated_at: state.revision, resumo_curto: "Texto observado", status_validacao: "rascunho" }, composicao: [] }, refetch: state.refetch }),
  useProductDocumentaryEvidence: () => ({ isSuccess: !state.evidenceError, isError: state.evidenceError, data: state.evidence, history: state.history, profileId: state.absent ? null : "profile1", profileRevision: state.absent ? null : state.evidenceRevision, refetch: state.evidenceRefetch }),
  useUpsertProductProfile: () => ({ isPending: false, mutateAsync: state.save }),
}));
vi.mock("@/hooks/useProductResearchDossier", () => ({ useProductResearchDossier: () => ({ data: state.dossier, isError:state.dossierError }) }));
vi.mock("@/components/protocolos/catalog/ProfileFieldAI", () => ({ ProfileFieldAI: ({ label, value, onChange }: any) => <textarea aria-label={label} value={value} onChange={e => onChange(e.target.value)} /> }));
vi.mock("@/components/protocolos/ProductFormulaBenefits", () => ({ ProductFormulaBenefits: () => null }));
vi.mock("@/components/protocolos/ProductFichaRelations", () => ({ ProductFichaRelations: () => null }));
vi.mock("@/components/protocolos/catalog/DocumentaryAI", () => ({ DocumentaryAI: () => null }));
vi.mock("@/components/protocolos/catalog/VersoesHistoricoTab", () => ({ VersoesHistoricoTab: () => null }));
vi.mock("@/components/fiscal/ProductDossierManagement", () => ({ ProductDossierManagement: () => null }));
import { ProductTechnicalProfileDialog } from "@/components/protocolos/ProductTechnicalProfileDialog";
const tree = (id = "p1", descricao = "Descrição atual", nome = "Produto") => <ProductTechnicalProfileDialog embedded open produto={{ id, nome, tipo: "solo", codigo: null, descricao, owner_organization_id: "org1" }} onOpenChange={() => {}} />;
beforeEach(() => {
  vi.clearAllMocks(); state.error = false; state.success = true; state.evidenceError = false; state.absent = false;
  state.revision = "2026-11-18T04:00:00Z"; state.evidenceRevision = state.revision;
  state.evidence=[]; state.history=null;state.dossier=null;state.dossierError=false;
});
afterEach(cleanup);
const fertilizerTree=()=> <ProductTechnicalProfileDialog embedded open produto={{id:'p1',nome:'Fertilizante QA',tipo:'solo',codigo:null,familia_catalogo:'fertilizante_adubo',owner_organization_id:'org1'}} onOpenChange={()=>{}}/>;
it('fertilizante mantém notas manuais no CAS do perfil sem garantir teores, aprovação ou composição microbiana',async()=>{
 state.save.mockResolvedValue({id:'profile1',updated_at:'2026-11-18T05:10:00Z'});const view=render(fertilizerTree());
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Composição e garantias'}),{button:0,ctrlKey:false});
 const notes=screen.getByLabelText('Notas documentais de composição, garantias e registro');
 fireEvent.change(notes,{target:{value:'Anotação QA sem teor comercial; validar documento.'}});
 state.revision='2026-11-18T05:09:00Z';state.evidenceRevision=state.revision;view.rerender(fertilizerTree());
 expect(notes).toHaveValue('Anotação QA sem teor comercial; validar documento.');
 fireEvent.click(screen.getByRole('button',{name:'Salvar conteúdo'}));
 await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
 expect(state.save.mock.calls[0][0]).toMatchObject({observacoes_regulatorias:'Anotação QA sem teor comercial; validar documento.',status_validacao:'rascunho',observedProfile:{updated_at:'2026-11-18T04:00:00Z'}});
 expect(state.save.mock.calls[0][0].relations).toEqual([]);
});
it('fertilizante distingue erro documental de ausência e conserva notas na navegação/cancelamento',()=>{
 state.dossierError=true;render(fertilizerTree());fireEvent.mouseDown(screen.getByRole('tab',{name:'Composição e garantias'}),{button:0,ctrlKey:false});
 expect(screen.getByRole('alert')).toHaveTextContent('A falha de consulta não significa ausência');
 fireEvent.change(screen.getByLabelText('Notas documentais de composição, garantias e registro'),{target:{value:'QA retido'}});
 fireEvent.mouseDown(screen.getByRole('tab',{name:'B2B'}),{button:0,ctrlKey:false});fireEvent.mouseDown(screen.getByRole('tab',{name:'Composição e garantias'}),{button:0,ctrlKey:false});
 expect(screen.getByLabelText('Notas documentais de composição, garantias e registro')).toHaveValue('QA retido');
 fireEvent.click(screen.getByRole('button',{name:'Cancelar alterações do conteúdo'}));expect(screen.getByLabelText('Notas documentais de composição, garantias e registro')).toHaveValue('');expect(state.save).not.toHaveBeenCalled();
});
it('fertilizante consulta formulação/garantia existente sem reescrever dossiê',()=>{
 state.dossier={formulation:'Formulação QA documental',label_guarantee:'Garantia QA sem teor real',guarantee_unit:'unidade QA'};
 render(fertilizerTree());fireEvent.mouseDown(screen.getByRole('tab',{name:'Composição e garantias'}),{button:0,ctrlKey:false});
 expect(screen.getByText('Formulação QA documental')).toBeInTheDocument();expect(screen.getByText('Garantia QA sem teor real unidade QA')).toBeInTheDocument();expect(state.save).not.toHaveBeenCalled();
});
it("erro de perfil bloqueia escrita e retry relê perfil e evidências", () => {
  state.error = true; state.success = false;
  render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(state.refetch).toHaveBeenCalledOnce(); expect(state.evidenceRefetch).toHaveBeenCalledOnce(); expect(state.save).not.toHaveBeenCalled();
});
it("erro de evidências não hidrata como ausência e não permite salvar", () => {
  state.evidenceError = true; render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeDisabled();
  expect(state.save).not.toHaveBeenCalled();
});
it("renomeação em tela aberta preserva origem histórica e permite retomar outro campo",async()=>{
 const evidence={field:'resumo_curto',value:'Texto observado',candidate_key:'A',identity:{entity:'produto',id:'p1',name:'Produto',manufacturer:'',registration:''},sources:[{url:'https://example.org/ficha',title:'Documento',excerpt:'Trecho'}]};
 state.evidence=[evidence];state.save.mockResolvedValue({id:'profile1',updated_at:'2026-11-18T04:45:00Z'});
 const view=render(tree());view.rerender(tree('p1','Descrição atual','Renomeado'));
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Fontes e histórico'}),{button:0,ctrlKey:false});
 expect(screen.getByText(/Identidade histórica: Produto/)).toBeInTheDocument();
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Características técnicas'}),{button:0,ctrlKey:false});
 fireEvent.change(screen.getByRole('textbox',{name:'Texto técnico'}),{target:{value:'Novo campo manual'}});
 fireEvent.click(screen.getByRole('button',{name:'Salvar conteúdo'}));
 await waitFor(()=>expect(state.save).toHaveBeenCalledOnce());
 expect(state.save.mock.calls[0][0]).toMatchObject({explicacao_tecnica:'Novo campo manual',documentaryProductName:'Renomeado',documentaryEvidence:[evidence]});
 expect(evidence.identity.name).toBe('Produto');
});
it("reabrir após renomeação mostra histórico de mesma revisão sem bloquear edição",()=>{
 state.history={profile_revision:state.revision,evidence:[{field:'resumo_curto',value:'Texto observado',candidate_key:'A',identity:{entity:'produto',id:'p1',name:'Produto',manufacturer:'',registration:''},sources:[{url:'https://example.org/ficha',title:'Documento',excerpt:'Trecho'}]}]};
 render(tree('p1','Descrição atual','Renomeado'));
 fireEvent.mouseDown(screen.getByRole('tab',{name:'Fontes e histórico'}),{button:0,ctrlKey:false});
 expect(screen.getByText('Identidade de origem: Produto')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Salvar conteúdo'})).toBeEnabled();
 expect(state.save).not.toHaveBeenCalled();
});
it("versões concorrentes exigem releitura, recuperam antes de hidratar e não rebaseiam rascunho sujo", async () => {
  state.evidenceRevision = "2026-11-18T03:00:00Z";
  const view = render(tree());
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  state.evidenceRevision = state.revision; view.rerender(tree());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Texto observado"));
  fireEvent.change(screen.getByRole("textbox", { name: "Resumo curto" }), { target: { value: "Rascunho local" } });
  state.revision = "2026-11-18T05:00:00Z"; state.evidenceRevision = state.revision; view.rerender(tree());
  expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Rascunho local");
  expect(state.save).not.toHaveBeenCalled();
});
it("troca de produto com ausência confirmada não herda rascunho anterior", () => {
  const view = render(tree());
  fireEvent.change(screen.getByRole("textbox", { name: "Resumo curto" }), { target: { value: "Anterior" } });
  state.absent = true; view.rerender(tree("p2", "Descrição nova"));
  expect(screen.getByRole("textbox", { name: "Resumo curto" })).toHaveValue("Descrição nova");
  expect(screen.getByRole("button", { name: "Salvar conteúdo" })).toBeEnabled();
  expect(state.save).not.toHaveBeenCalled();
});