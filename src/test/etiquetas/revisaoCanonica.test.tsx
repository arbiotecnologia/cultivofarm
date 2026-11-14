import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LABEL_TEMPLATES, labelTemplate, labelDetails, snapshotText, replaceLabelIds } from "@/lib/etiquetas";
import { labelPrintPermit } from "@/lib/etiquetasPrintPermit";
import { fixtureId as id, replacementId as next, rpcLabelFixture } from "./rpcFixture";
const t = vi.hoisted(() => ({ rpc: vi.fn(), rows: [] as any[], queried: [] as string[][] }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({user:{id:"a"},profile:{user_id:"a",organization_id:"AR",ativo:true},roles:["gestor"],loading:false}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: t.rpc, from: () => ({select:()=>({in:(_:string,ids:string[])=>{t.queried.push(ids);return Promise.resolve({data:t.rows.filter(r=>ids.includes(r.id)),error:null});}})}) } }));
import Page from "@/pages/etiquetas/EtiquetaProdutoPrintPage";
const view = (extra = "") => <MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir${extra}`]}><Routes><Route path="/etiquetas/:id/imprimir" element={<Page/>}/></Routes></MemoryRouter>;
beforeEach(()=>{ vi.clearAllMocks();t.rows=[rpcLabelFixture()];t.queried=[];t.rpc.mockResolvedValue({data:null,error:null});vi.spyOn(window,"print").mockImplementation(()=>{}); });
describe("revisão SQL canônica",()=>{
 it.each(Object.keys(LABEL_TEMPLATES))("compatibilidade versão persistida %s",code=>{const l=rpcLabelFixture(code as keyof typeof LABEL_TEMPLATES);expect(labelTemplate({...l,snapshot:null})).toBe(code);expect(labelTemplate({...l,template_versao:null,snapshot:{template_codigo:code}})).toBe(code);});
 it("prioriza snapshot aninhado sobre campo antigo",()=>{expect(labelTemplate({...rpcLabelFixture('etiqueta-op-80x50'),template_codigo:'etiqueta-op-100x150'})).toBe('etiqueta-op-80x50');});
 it("não imprime IDs, keys ou objetos desconhecidos e deduplica textos equivalentes",()=>{
  const fields=labelDetails(rpcLabelFixture()).map(r=>r.join(': ')).join('\n');
  expect(fields).toContain('Operador: Operador teste');expect(fields).toContain('Cliente: Cliente teste');expect(fields).toContain('Responsável técnico: Responsável teste');expect(fields).not.toContain(id);expect(fields).not.toContain('PRIVADO');
  expect(snapshotText({id,tenant_id:id,segredo:'segredo',nome:'Bacillus'})).toBe('Nome: Bacillus');expect(snapshotText(['Aviso','Aviso',null,id])).toBe('Aviso');
 });
 it("deduplica a substituta já selecionada",()=>{expect(replaceLabelIds([id,next],id,next)).toEqual([next]);});
 it("correção lê nova_etiqueta_id, seleciona substituta e reimprime só ela",async()=>{
  render(view(`?ids=${id},${id}`));await screen.findByText(/SYN-1 · Recipiente/);expect(t.queried[0]).toEqual([id]);
  fireEvent.click(screen.getByRole('button',{name:'Corrigir'}));fireEvent.change(screen.getByLabelText('Motivo da correção'),{target:{value:'Correção teste'}});
  t.rpc.mockImplementation(async(name:string)=>{if(name==='rpc_corrigir_etiqueta_produto_v1'){t.rows=[{...rpcLabelFixture('etiqueta-op-80x50'),id:next,codigo_etiqueta:'SYN-2'}];return {data:{nova_etiqueta_id:next},error:null};}return {data:null,error:null};});
  fireEvent.click(screen.getByRole('button',{name:'Salvar correção'}));await screen.findByText(/SYN-2 · Recipiente/);expect(screen.queryByText(/SYN-1 · Recipiente/)).toBeNull();expect(t.queried[t.queried.length - 1]).toEqual([next]);
  fireEvent.change(screen.getByLabelText('Motivo da impressão ou reimpressão'),{target:{value:'Reimpressão teste'}});fireEvent.click(screen.getByRole('button',{name:'Imprimir selecionados'}));await waitFor(()=>expect(t.rpc).toHaveBeenLastCalledWith('rpc_imprimir_etiquetas_recipientes_v1',{p_ids:[next],p_motivo:'Reimpressão teste'}));
 });
 it.each([{cq_liberado:false},{cq_liberado:null},{status:'cancelada'},{status:'substituida'},{status:'desconhecido'},{substituida_por_id:next}])("nega saída CQ/histórico %j",async(delta)=>{
  t.rows=[{...rpcLabelFixture(),...delta}];render(view());await screen.findByText(/SYN-1 · Recipiente/);fireEvent.change(screen.getByLabelText('Motivo da impressão ou reimpressão'),{target:{value:'Teste bloqueado'}});expect(screen.getByRole('button',{name:'Imprimir selecionados'})).toBeDisabled();expect(screen.getByRole('button',{name:'PDF multipágina'})).toBeDisabled();fireEvent.keyDown(window,{key:'p',ctrlKey:true});expect(t.rpc).not.toHaveBeenCalled();expect(window.print).not.toHaveBeenCalled();
 });
 it("abre permit só após ACK e limpa após afterprint/retorno",async()=>{
  let resolve:(v:any)=>void=()=>{};t.rpc.mockImplementation(()=>new Promise(r=>resolve=r));render(view());await screen.findByText(/SYN-1 · Recipiente/);fireEvent.change(screen.getByLabelText('Motivo da impressão ou reimpressão'),{target:{value:'Impressão teste'}});fireEvent.click(screen.getByRole('button',{name:'Imprimir selecionados'}));
  await waitFor(()=>expect(t.rpc).toHaveBeenCalled());const root=document.getElementById('product-label-print');expect(root?.hasAttribute('data-print-authorized')).toBe(false);
  vi.mocked(window.print).mockImplementation(()=>{expect(root?.getAttribute('data-print-authorized')).toBe('true');window.dispatchEvent(new Event('afterprint'));expect(root?.hasAttribute('data-print-authorized')).toBe(false);});
  await act(async()=>resolve({data:null,error:null}));expect(window.print).toHaveBeenCalledTimes(1);expect(root?.hasAttribute('data-print-authorized')).toBe(false);
 });
 it("Ctrl+P/Meta+P e beforeprint sem permit ficam fechados; dispose remove tudo",()=>{
  const root=document.createElement('div');let current=true;const p=labelPrintPermit(root,()=>current);
  for(const modifier of ['ctrlKey','metaKey']){const e=new KeyboardEvent('keydown',{key:'p',[modifier]:true,cancelable:true});window.dispatchEvent(e);expect(e.defaultPrevented).toBe(true);}
  root.setAttribute('data-print-authorized','true');window.dispatchEvent(new Event('beforeprint'));expect(root.hasAttribute('data-print-authorized')).toBe(false);
  current=false;p.print();expect(window.print).not.toHaveBeenCalled();p.dispose();const e=new KeyboardEvent('keydown',{key:'p',ctrlKey:true,cancelable:true});window.dispatchEvent(e);expect(e.defaultPrevented).toBe(false);
 });
});