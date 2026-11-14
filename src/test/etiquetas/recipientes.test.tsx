import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { generationIds, generationPayload, LABEL_TEMPLATES, labelTemplate, snapshotCompany, type LabelData } from "@/lib/etiquetas";
const t = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), auth: { user: { id: 'actor' }, profile: { user_id: 'actor', organization_id: 'AR', ativo: true }, roles: ['gestor'], loading: false } as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => t.auth }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: t.rpc, from: t.from } }));
import PrintPage from '@/pages/etiquetas/EtiquetaProdutoPrintPage';
import { EtiquetaProdutoPrint } from '@/components/etiquetas/EtiquetaProdutoPrint';
import { EtiquetaProdutoActions } from '@/components/etiquetas/EtiquetaProdutoActions';
import { buildRastreioUrl } from '@/components/etiquetas/QRCodeRastreioProduto';
const id = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222';
const label: LabelData = { id, codigo_etiqueta:'SYN-1', produto_nome:'Produto sintético', lote_codigo:'L1', trace_token:id2, status:'gerada', tipo_etiqueta:'principal', validade_em:'2027-01-01', snapshot:{empresa:{nome:'Empresa sintética'}, composicao:['Bacillus'], recipiente:{numero:1}} };
beforeEach(() => { vi.clearAllMocks(); t.rpc.mockResolvedValue({ data:null,error:null }); t.from.mockImplementation(() => ({select:()=>({in:()=>Promise.resolve({data:[label],error:null})})})); vi.spyOn(window,'print').mockImplementation(()=>{}); t.auth.profile.organization_id='AR'; });
describe('etiquetas por recipiente',()=>{
 it.each(Object.entries(LABEL_TEMPLATES))('formato exato %s', (code,d)=>{ expect(d).toEqual(code.endsWith('100x150')?{width:100,height:150}:code.endsWith('100x100')?{width:100,height:100}:code.endsWith('80x50')?{width:80,height:50}:{width:50,height:30}); expect(labelTemplate({...label,template_codigo:code})).toBe(code); });
 it('exatamente um root sem campos extras',()=>{ expect(generationPayload(id,undefined,'principal','etiqueta-op-80x50')).toEqual({envase_id:id,tipo_etiqueta:'principal',template_codigo:'etiqueta-op-80x50'});expect(()=>generationPayload(id,id2,'principal','etiqueta-op-80x50')).toThrow();expect(()=>generationPayload(undefined,undefined,'principal','etiqueta-op-80x50')).toThrow(); });
 it('nega ACK inconsistente e duplicado',()=>{expect(generationIds({etiqueta_ids:[id,id2],total_geradas:1,total_reaproveitadas:1})).toEqual([id,id2]);expect(()=>generationIds({etiqueta_ids:[id,id],total_geradas:2,total_reaproveitadas:0})).toThrow();expect(()=>generationIds({etiqueta_ids:[id],total_geradas:0,total_reaproveitadas:0})).toThrow();});
 it('QR só URL opaca canônica com zona silenciosa',()=>{render(<EtiquetaProdutoPrint etiqueta={label}/>);expect(buildRastreioUrl(id2)).toBe(`https://app.cultivofarm.com.br/rastrear-produto/${id2}`);const svg=document.querySelector('svg');expect(svg?.getAttribute('viewBox')).toBeTruthy();expect(screen.getByText('Empresa sintética')).toBeInTheDocument();expect(snapshotCompany({...label,snapshot:null}).name).toBe('');});
 it('geração usa apenas contrato novo e preserva falha',async()=>{t.rpc.mockResolvedValue({data:null,error:new Error('negado')});render(<EtiquetaProdutoActions envaseId={id}/>);fireEvent.click(screen.getByRole('button',{name:'Gerar etiquetas'}));fireEvent.click(screen.getByRole('button',{name:'Gerar e selecionar recipientes'}));await screen.findByText('negado');expect(t.rpc).toHaveBeenCalledWith('rpc_gerar_etiquetas_recipientes_v1',{p_payload:{envase_id:id,tipo_etiqueta:'principal',template_codigo:'etiqueta-op-100x150'}});});
 it('imprime somente depois do ACK e exige motivo',async()=>{render(<MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir`]}><Routes><Route path='/etiquetas/:id/imprimir' element={<PrintPage/>}/></Routes></MemoryRouter>);await screen.findByText(/SYN-1 · Recipiente/);const button=screen.getByRole('button',{name:'Imprimir selecionados'});expect(button).toBeDisabled();fireEvent.change(screen.getByLabelText('Motivo da impressão ou reimpressão'),{target:{value:'Primeira impressão'}});t.rpc.mockResolvedValueOnce({error:new Error('negado')});fireEvent.click(button);await screen.findByText('negado');expect(window.print).not.toHaveBeenCalled();fireEvent.click(button);await waitFor(()=>expect(window.print).toHaveBeenCalledTimes(1));expect(t.rpc).toHaveBeenLastCalledWith('rpc_imprimir_etiquetas_recipientes_v1',{p_ids:[id],p_motivo:'Primeira impressão'});});
 it('troca de tenant remove conteúdo do snapshot',async()=>{const view=<MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir`]}><Routes><Route path='/etiquetas/:id/imprimir' element={<PrintPage/>}/></Routes></MemoryRouter>;const h=render(view);await screen.findByText(/SYN-1 · Recipiente/);t.auth.profile.organization_id='FSF';t.from.mockImplementation(()=>({select:()=>({in:()=>new Promise(()=>{})})}));h.rerender(<MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir`]}><Routes><Route path='/etiquetas/:id/imprimir' element={<PrintPage/>}/></Routes></MemoryRouter>);expect(screen.queryByText('Empresa sintética')).toBeNull();});
 it('seleção de um recipiente não inclui os outros no writer',async()=>{
  t.from.mockImplementation(()=>({select:()=>({in:()=>Promise.resolve({data:[label,{...label,id:id2,codigo_etiqueta:'SYN-2'}],error:null})})}));
  render(<MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir?ids=${id2}`]}><Routes><Route path='/etiquetas/:id/imprimir' element={<PrintPage/>}/></Routes></MemoryRouter>);
  await screen.findByText(/SYN-2 · Recipiente/);fireEvent.click(screen.getByLabelText('Selecionar SYN-2'));
  fireEvent.change(screen.getByLabelText('Motivo da impressão ou reimpressão'),{target:{value:'Impressão individual'}});
  fireEvent.click(screen.getByRole('button',{name:'Imprimir selecionados'}));
  await waitFor(()=>expect(t.rpc).toHaveBeenCalledWith('rpc_imprimir_etiquetas_recipientes_v1',{p_ids:[id],p_motivo:'Impressão individual'}));
 });
 it('correção preserva chave e intenção após falha e bloqueia alteração ambígua',async()=>{
  render(<MemoryRouter initialEntries={[`/etiquetas/${id}/imprimir`]}><Routes><Route path='/etiquetas/:id/imprimir' element={<PrintPage/>}/></Routes></MemoryRouter>);
  await screen.findByText(/SYN-1 · Recipiente/);fireEvent.click(screen.getByRole('button',{name:'Corrigir'}));
  fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Novo texto'}});fireEvent.change(screen.getByLabelText('Motivo da correção'),{target:{value:'Texto corrigido'}});
  t.rpc.mockResolvedValue({error:new Error('incerta')});fireEvent.click(screen.getByRole('button',{name:'Salvar correção'}));await screen.findByText('incerta');
  const first=t.rpc.mock.calls[0];fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Outra intenção'}});fireEvent.click(screen.getByRole('button',{name:'Salvar correção'}));await screen.findByText(/Tentativa anterior não confirmada/);expect(t.rpc).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('Observações'),{target:{value:'Novo texto'}});fireEvent.click(screen.getByRole('button',{name:'Salvar correção'}));await waitFor(()=>expect(t.rpc).toHaveBeenCalledTimes(2));expect(t.rpc.mock.calls[1]).toEqual(first);
 });

});
