import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTenantCatalogEditor } from '@/hooks/useTenantCatalogEditor';
import { useAuth } from '@/hooks/useAuth';
import { useScopedPortalQuery } from '@/hooks/useScopedPortalQuery';
import { useMicroorganismProfile } from '@/hooks/useMicroorganismProfile';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProductRegulatoryNavigation } from '@/components/fiscal/ProductRegulatoryNavigation';
import { MicroorganismFiscalGuide } from '@/components/fiscal/FiscalGuidePanel';
import { DocumentaryAI } from './catalog/DocumentaryAI';
import { SourcesManager } from './catalog/SourcesManager';
import { VersoesHistoricoTab } from './catalog/VersoesHistoricoTab';
import { TargetsManager } from './catalog/TargetsManager';
import { CropsManager } from './catalog/CropsManager';
import { MICRO_CONTENT_FIELDS, MICRO_SECTIONS, microDraft, saveMicroFicha, type MicroFichaRow } from '@/lib/catalogo/microorganismFicha';
import type { DocumentaryEvidence } from '@/lib/catalogo/documentarySuggestions';
const labels: Record<string,string> = {culturas_uso:'Culturas — uso documentado',alvos_uso:'Alvos — uso documentado',documentos_pendentes:'Documentos e fatos faltantes',codigo:'Código',nome:'Nome',nome_cientifico:'Nome científico',sinonimos:'Sinônimos',cepa:'Cepa / estirpe',tipo:'Tipo',origem:'Origem',fornecedor:'Fornecedor / titular',funcao_agronomica:'Função / finalidade agronômica',concentracao_label:'Concentração declarada',concentracao_unidade:'Unidade da concentração',apresentacao:'Apresentação',descricao:'Descrição do catálogo',observacoes:'Observações',resumo_curto:'Resumo curto',mecanismo_acao:'Mecanismo de ação',beneficios_agronomicos:'Benefícios agronômicos',explicacao_tecnica:'Texto técnico',explicacao_produtor:'Texto para produtor',explicacao_b2b:'Texto B2B',indicacoes_uso:'Indicações de uso',cuidados_aplicacao:'Cuidados',compatibilidade:'Compatibilidade',armazenamento:'Armazenamento',observacoes_regulatorias:'Observações regulatórias'};
export function MicroorganismFichaEditor({item,onClose,onSaved}:{item:MicroFichaRow|null;onClose():void;onSaved(row:MicroFichaRow):void}) {
 const editor=useTenantCatalogEditor(); const {profile}=useAuth(); const qc=useQueryClient();
 const editable=editor.canEdit && (!item || (!!item.owner_organization_id && item.owner_organization_id===profile?.organization_id));
 const technical=useMicroorganismProfile(item?.id);
 const detail=useScopedPortalQuery<{row:Record<string,unknown>;evidence:DocumentaryEvidence[]}>({queryKey:['micro-ficha',item?.id],enabled:!!item,retry:false,queryFn:async signal=>{
   if(!item) throw new Error('Registro ausente');
   const {data,error}=await supabase.from('microrganismos').select('*').eq('id',item.id).abortSignal(signal).single();
   if(error) throw error;
   const provenance=await supabase.rpc('tenant_microorganism_ficha_read_v1' as never,{p_id:item.id} as never).abortSignal(signal);
   if(provenance.error && provenance.error.code !== 'PGRST202') throw provenance.error;
   const p=provenance.data as unknown as {extra?:Record<string,unknown>;evidence?:DocumentaryEvidence[]}|null;
   return {row:{...data,...p?.extra},evidence:p?.evidence??[]};
 }});
 const [values,setValues]=useState(()=>microDraft(item)); const baseline=useRef(microDraft(item));
 const version=useRef(item?.updated_at??null); const profileVersion=useRef<string|null>(null);
 const [evidence,setEvidence]=useState<DocumentaryEvidence[]>([]); const [section,setSection]=useState('Identificação');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [exit,setExit]=useState(false);
 const dirty=useRef(false);const hydrated=useRef(!item);const lock=useRef(false);const attempt=useRef<{key:string;signature:string}>();
 const loaded=!item || (detail.isSuccess && technical.isSuccess);
 useEffect(()=>{if(!item || !loaded || dirty.current || hydrated.current)return;const row=detail.data?.row??item;const draft=microDraft(row,technical.data?.profile as unknown as Record<string,unknown>);setValues(draft);baseline.current=draft;version.current=String(row.updated_at??'')||null;profileVersion.current=technical.data?.profile?.updated_at??null;setEvidence(detail.data?.evidence??[]);hydrated.current=true;},[loaded,detail.data,technical.data,item]);
 const change=(field:string,value:string)=>{dirty.current=true;setValues(old=>({...old,[field]:value}));};
 const save=async()=>{if(!editable || lock.current || !loaded)return;const current=editor.capture();lock.current=true;setBusy(true);setError('');const signature=JSON.stringify([item?.id,version.current,profileVersion.current,values,evidence]);
  if(attempt.current && attempt.current.signature!==signature){lock.current=false;setBusy(false);setError('Tentativa inconclusiva. Preserve os campos para reconciliar a mesma solicitação.');return;}
  attempt.current??={key:crypto.randomUUID(),signature};
  try{const ack=await saveMicroFicha(supabase,item?.id??null,version.current,profileVersion.current,values,baseline.current,evidence,attempt.current.key);if(!current())return;dirty.current=false;attempt.current=undefined;void qc.invalidateQueries({queryKey:['micro-profile']});void qc.invalidateQueries({queryKey:['micro-ficha']});onSaved({...item,...values,id:ack.id,nome:values.nome,descricao:values.descricao||null,updated_at:ack.updated_at});}
  catch(e){if(current()){setError(e instanceof Error?e.message:'Rascunho preservado.');if((e as {serverCode?:string}).serverCode)attempt.current=undefined;}}
  finally{lock.current=false;if(current())setBusy(false);}
 };
 const field=(f:string,multiline=false)=><div key={f} className="min-w-0 space-y-1"><Label htmlFor={`micro-${f}`}>{labels[f]??f}</Label>{multiline?<Textarea id={`micro-${f}`} rows={4} readOnly={!editable||busy} value={values[f]??''} onChange={e=>change(f,e.target.value)}/>:<Input id={`micro-${f}`} readOnly={!editable||busy} value={values[f]??''} onChange={e=>change(f,e.target.value)}/>}</div>;
 return <Dialog open onOpenChange={open=>{if(!open&&!busy){if(dirty.current)setExit(true);else onClose();}}}><DialogContent aria-describedby={undefined} className="flex h-[94dvh] w-[96vw] max-w-6xl flex-col gap-3 overflow-hidden">
 <DialogHeader className="shrink-0"><DialogTitle className="break-words">{item?`Ficha — ${item.nome}`:'Adicionar microrganismo'}</DialogTitle></DialogHeader>
 <nav aria-label="Seções da ficha" className="grid shrink-0 grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">{MICRO_SECTIONS.map(s=><Button key={s} variant={section===s?'secondary':'ghost'} className="h-auto min-h-11 whitespace-normal text-xs" aria-pressed={section===s} onClick={()=>setSection(s)}>{s}</Button>)}</nav>
 <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
 {item&&(detail.isError||technical.isError)?<div role="alert">Não foi possível carregar a ficha. <Button variant="outline" onClick={()=>{void detail.refetch();void technical.refetch();}}>Tentar novamente</Button></div>:!loaded?<p role="status">Carregando ficha…</p>:<div className="space-y-4">
 {section==='Identificação'&&<div className="grid gap-4 sm:grid-cols-2">{['codigo','nome','nome_cientifico','sinonimos','cepa','origem','fornecedor'].map(f=>field(f))}<div><Label>Tipo</Label><Select disabled={!editable||busy} value={values.tipo} onValueChange={v=>change('tipo',v)}><SelectTrigger aria-label="Tipo"><SelectValue/></SelectTrigger><SelectContent>{['bacteria','fungo','levedura','consorcio'].map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div></div>}
 {section==='Características técnicas'&&<>{['concentracao_label','concentracao_unidade','apresentacao','funcao_agronomica'].map(f=>field(f))}{['mecanismo_acao','beneficios_agronomicos'].map(f=>field(f,true))}</>}
 {section==='Uso agronômico'&&<>{['culturas_uso','alvos_uso','indicacoes_uso','compatibilidade','cuidados_aplicacao','armazenamento'].map(f=>field(f,true))}{item&&<><CropsManager kind="micro" parentId={item.id} canEdit={false}/><TargetsManager kind="micro" parentId={item.id} canEdit={false}/></>}</>}
 {section==='Conteúdo do catálogo'&&<>{editable&&<DocumentaryAI identity={{name:values.nome,scientificName:values.nome_cientifico,strain:values.cepa,synonyms:values.sinonimos,purpose:values.funcao_agronomica,manufacturer:values.fornecedor,registration:'',concentration:values.concentracao_label,presentation:values.apresentacao,entity:'microrganismo',id:item?.id}} values={values} allowed={['descricao',...MICRO_CONTENT_FIELDS]} onApply={fields=>{dirty.current=true;setValues(v=>({...v,...fields}));}} onEvidence={rows=>{dirty.current=true;setEvidence(old=>[...old.filter(e=>!rows.some(r=>r.field===e.field)),...rows]);}}/>}{['descricao','resumo_curto','explicacao_tecnica','explicacao_produtor','explicacao_b2b','observacoes'].map(f=>field(f,true))}</>}
 {section==='Fiscal e regulatório'&&<>{field('observacoes_regulatorias',true)}{field('documentos_pendentes',true)}{item?<MicroorganismFiscalGuide embedded microorganismId={item.id} displayName={item.nome} displayCodigo={String(item.codigo??'')}/>:<p>Perfil fiscal ainda não cadastrado.</p>}{item&&<ProductRegulatoryNavigation microId={item.id}/>}<p className="text-sm text-muted-foreground">Registro, laudo, cepa e finalidade não documentados permanecem pendentes. Nenhuma aprovação técnica ou contábil é criada nesta ficha.</p></>}
 {section==='Fontes e histórico'&&<>{evidence.length===0&&<p>Sem fontes aceitas nesta ficha.</p>}{evidence.map((e,i)=><div key={`${e.field}-${i}`} className="space-y-1 border-b py-3"><h3 className="font-medium">{labels[e.field]??e.field}</h3><p className="whitespace-pre-wrap break-words text-sm">{e.value}</p>{values[e.field]!==e.value&&<p className="text-sm text-muted-foreground">Conteúdo editado manualmente após a sugestão; a fonte não valida a alteração.</p>}{e.sources.map(s=><div key={s.url} className="break-words text-sm"><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{s.title}</a><p>{s.excerpt}</p></div>)}</div>)}{item&&<><SourcesManager entidadeTipo="microrganismo" entidadeId={item.id} canEdit={false} canDelete={false}/><VersoesHistoricoTab entidadeTipo="microrganismo" entidadeId={item.id} canApprove={false}/></>}</>}
 </div>}</div>
 <footer className="shrink-0 space-y-2 border-t pt-3">{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{exit?<div className="flex flex-wrap items-center justify-end gap-2"><span>Descartar rascunho?</span><Button variant="outline" onClick={()=>setExit(false)}>Continuar editando</Button><Button variant="destructive" onClick={onClose}>Descartar</Button></div>:<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>dirty.current?setExit(true):onClose()}>{editable?'Cancelar':'Fechar'}</Button>{editable&&<Button disabled={busy||!loaded} onClick={()=>void save()}>{busy?'Salvando…':'Salvar ficha'}</Button>}</div>}</footer>
 </DialogContent></Dialog>;
}
