import { useEffect,useRef,useState } from 'react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useCatalogAuthoring } from '@/hooks/useCatalogAuthoring';
import { useScopedPortalQuery } from '@/hooks/useScopedPortalQuery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { safeSourceUrl } from '@/lib/catalogo/safeSourceUrl';
const types=['praga','doenca','nematoide','nutricao','solo','estresse','crescimento'] as const;
const rowSchema=z.object({id:z.string().uuid(),nome:z.string(),tipo:z.enum(types),descricao:z.string().nullable(),ativo:z.boolean(),updated_at:z.string()});
const suggestionSchema=z.object({nome:z.string().min(2).max(200),tipo:z.enum(types),prioridade:z.number().int().min(1).max(10),justificativa:z.string().max(4000),fonte_url:z.string().url(),fonte_titulo:z.string()});
type Target=z.infer<typeof rowSchema>;type Suggestion=z.infer<typeof suggestionSchema>;
type Props={entity:'produto'|'microrganismo';parentId:string|null;disabled:boolean;onChoose(row:Target):void;onPending?(value:boolean):void};
export function TenantTargetTools(props:Props){const access=useCatalogAuthoring();return <Tools key={`${access.editor.scope}:${props.entity}:${props.parentId}`} {...props} access={access}/>;}
function Tools({entity,parentId,disabled,onChoose,onPending,access}:Props&{access:ReturnType<typeof useCatalogAuthoring>}){
 const {editor}=access;const [draft,setDraft]=useState<{id:string|null;expected:string|null;nome:string;tipo:typeof types[number];descricao:string;ativo:boolean}|null>(null);
 const [suggestions,setSuggestions]=useState<Suggestion[]>([]);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const lock=useRef(false);const live=useRef(true);const abort=useRef<AbortController>();const attempt=useRef<{signature:string;key:string}>();
 useEffect(()=>{live.current=true;return()=>{live.current=false;abort.current?.abort();};},[]);
 useEffect(()=>{onPending?.(!!draft||busy);},[draft,busy,onPending]);
 const query=useScopedPortalQuery<Target[]>({queryKey:['tenant-target-masters-v2'],enabled:access.targets,queryFn:async(signal)=>{
  const {data,error}=await supabase.from('catalogo_alvos').select('id,nome,tipo,descricao,ativo,updated_at').abortSignal(signal);
  if(error)throw new Error('Alvos indisponíveis.');return z.array(rowSchema).parse(data);
 }});
 const save=async(archive=false)=>{
  const current=editor.capture();if(!draft||!access.targets||disabled||lock.current||!current())return;
  const payload={nome:draft.nome.trim(),tipo:draft.tipo,descricao:draft.descricao,ativo:archive?false:draft.ativo};
  if(payload.nome.length<2){setError('Informe o nome do alvo.');return;}
  const signature=JSON.stringify([draft.id,draft.expected,payload]);
  if(attempt.current&&attempt.current.signature!==signature){setError('Repita a tentativa pendente antes de alterar o cadastro.');return;}
  attempt.current??={signature,key:crypto.randomUUID()};lock.current=true;setBusy(true);setError('');
  try{
   const {data,error}=await (supabase.rpc.bind(supabase) as any)('tenant_catalog_target_save_v2',{p_id:draft.id,p_expected:draft.expected,p_payload:payload,p_key:attempt.current.key});
   if(!current()||!live.current)return;
   if(error){if(['42501','22023','PT409','23505','P0002'].includes(error.code))attempt.current=undefined;throw new Error(error.code==='PT409'?'Cadastro alterado. Feche e releia antes de salvar novamente.':error.code==='23505'?'Este alvo já existe nesta empresa. Selecione o cadastro existente.':'Não foi possível salvar o cadastro.');}
   const ack=z.object({ok:z.literal(true),id:z.string().uuid(),updated_at:z.string()}).passthrough().parse(data);
   if(draft.id&&ack.id!==draft.id)throw new Error('Resposta de outro cadastro.');attempt.current=undefined;
   const row={...payload,id:ack.id,updated_at:ack.updated_at};setDraft(null);
   await query.refetch();if(!current()||!live.current)return;if(!archive)onChoose(row);
  }catch(e){if(current()&&live.current)setError(e instanceof Error?e.message:'Falha no cadastro.');}
  finally{lock.current=false;if(current()&&live.current)setBusy(false);}
 };
 const generate=async()=>{
  const current=editor.capture();if(!parentId||!access.ai||disabled||lock.current||!current())return;
  lock.current=true;setBusy(true);setError('');setSuggestions([]);const ctrl=new AbortController();abort.current=ctrl;
  try{const {data,error}=await supabase.functions.invoke('ai-sugerir-alvos',{body:{entidade_tipo:entity,entidade_id:parentId,max:10},signal:ctrl.signal});
   if(!current()||!live.current||ctrl.signal.aborted)return;if(error)throw new Error('Não foi possível sugerir alvos.');
   const parsed=z.object({rascunho:z.literal(true),alvos:z.array(suggestionSchema).max(10)}).parse(data);
   if(parsed.alvos.some(a=>!safeSourceUrl(a.fonte_url)))throw new Error('Fonte inválida.');setSuggestions(parsed.alvos);
  }catch(e){if(current()&&live.current&&!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Falha na sugestão.');}
  finally{lock.current=false;if(current()&&live.current)setBusy(false);}
 };
 if(!editor.canEdit)return null;
 return <section className="space-y-2 border rounded p-3" aria-label="Alvos da empresa">
  <p className="text-sm">Cadastre alvos da sua empresa. O vínculo só será gravado ao salvar a ficha.</p>
  <div className="flex flex-wrap gap-2"><Button type="button" disabled={!access.targets||disabled||busy||!!draft} onClick={()=>setDraft({id:null,expected:null,nome:'',tipo:'praga',descricao:'',ativo:true})}>Novo alvo da empresa</Button>
  <Button type="button" variant="outline" disabled={!access.ai||!parentId||disabled||busy||!!draft} onClick={()=>void generate()}>Sugerir alvos com IA</Button></div>
  {(!access.targets||!access.ai)&&<p role="status" className="text-xs">Recursos ainda não habilitados para edição assistida neste ambiente.</p>}
  {query.isError&&<p role="alert">Não foi possível consultar os alvos da empresa.</p>}
  {query.isSuccess&&!draft&&<select aria-label="Editar cadastro de alvo" disabled={disabled||busy||!access.targets} value="" onChange={e=>{const r=query.data?.find(x=>x.id===e.target.value);if(r)setDraft({id:r.id,expected:r.updated_at,nome:r.nome,tipo:r.tipo,descricao:r.descricao??'',ativo:r.ativo});}}><option value="">Editar ou arquivar cadastro…</option>{query.data?.map(t=><option key={t.id} value={t.id}>{t.nome}{t.ativo?'':' (arquivado)'}</option>)}</select>}
  {suggestions.map((s,i)=><article key={i} className="border p-2 space-y-1"><b>{s.nome}</b><p>{s.justificativa}</p><a href={safeSourceUrl(s.fonte_url)??undefined} target="_blank" rel="noopener noreferrer">{s.fonte_titulo}</a><Button type="button" disabled={!access.targets||disabled||busy||!!draft} onClick={()=>{const existing=query.data?.find(r=>r.ativo&&r.tipo===s.tipo&&r.nome.toLocaleLowerCase()===s.nome.toLocaleLowerCase());if(existing){onChoose(existing);setSuggestions([]);}else{setDraft({id:null,expected:null,nome:s.nome,tipo:s.tipo,descricao:`${s.justificativa}\nFonte: ${s.fonte_url}`,ativo:true});setSuggestions([]);}}}>Revisar este alvo</Button></article>)}
  {draft&&<fieldset disabled={busy||disabled||!access.targets} className="space-y-2"><Label>Nome do alvo<Input aria-label="Nome do alvo da empresa" value={draft.nome} onChange={e=>setDraft({...draft,nome:e.target.value})}/></Label><Label>Tipo<select aria-label="Tipo do alvo da empresa" value={draft.tipo} onChange={e=>setDraft({...draft,tipo:e.target.value as typeof draft.tipo})}>{types.map(t=><option key={t}>{t}</option>)}</select></Label><Textarea aria-label="Descrição do alvo da empresa" value={draft.descricao} onChange={e=>setDraft({...draft,descricao:e.target.value})}/><div className="flex flex-wrap gap-2"><Button type="button" onClick={()=>void save()}>Salvar cadastro do alvo</Button>{draft.id&&<Button type="button" variant="outline" onClick={()=>void save(true)}>Arquivar alvo</Button>}<Button type="button" variant="ghost" onClick={()=>{if(attempt.current){setError('Tentativa sem confirmação. Repita o envio para reconciliar.');return;}setDraft(null);}}>Cancelar cadastro</Button></div></fieldset>}
  {busy&&<p role="status">Processando…</p>}{error&&<p role="alert">{error}</p>}
 </section>;
}
