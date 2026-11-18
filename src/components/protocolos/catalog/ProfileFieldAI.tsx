import { useEffect,useRef,useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { gerarFichaCampo } from '@/lib/fichaIaClient';
import { useCatalogAuthoring } from '@/hooks/useCatalogAuthoring';
interface Props {label:string;value:string;onChange(v:string):void;rows?:number;readOnly?:boolean;entidadeTipo?:'produto'|'microrganismo';entidadeId?:string;campo?:string;canGenerateAI?:boolean;onVersaoCriada?(id:string):void}
const allowed=['resumo_curto','explicacao_tecnica','explicacao_produtor','explicacao_b2b','indicacoes_uso','cuidados_aplicacao','compatibilidade','beneficio_combinado','janela_aplicacao','mecanismo_acao','beneficios_agronomicos','descricao'];
export function ProfileFieldAI(props:Props){const access=useCatalogAuthoring();return <Field key={`${access.editor.scope}:${props.entidadeTipo}:${props.entidadeId}:${props.campo}`} {...props} access={access}/>;}
function Field({label,value,onChange,rows=3,readOnly=false,entidadeTipo,entidadeId,campo,canGenerateAI=false,access}:Props&{access:ReturnType<typeof useCatalogAuthoring>}){
 const [preview,setPreview]=useState<{text:string;base:string}|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const lock=useRef(false);const alive=useRef(true);const abort=useRef<AbortController>();
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;abort.current?.abort();};},[]);
 const eligible=canGenerateAI&&!readOnly&&access.ai&&!!entidadeId&&!!entidadeTipo&&!!campo&&allowed.includes(campo);
 const generate=async()=>{const current=access.editor.capture();if(!eligible||lock.current||!current())return;lock.current=true;setBusy(true);setPreview(null);setError('');const ctrl=new AbortController();abort.current=ctrl;
  try{const {data}=await supabase.auth.getSession();if(!current()||!alive.current||ctrl.signal.aborted)return;const token=data.session?.access_token;if(!token)throw new Error('Sessão indisponível.');
   const result=await gerarFichaCampo({entidadeTipo:entidadeTipo!,entidadeId:entidadeId!,campo:campo!,token,signal:ctrl.signal});
   if(!current()||!alive.current||ctrl.signal.aborted)return;setPreview({text:result.texto,base:value});
  }catch(e){if(current()&&alive.current&&!ctrl.signal.aborted)setError(e instanceof Error?e.message:'Não foi possível gerar.');}
  finally{lock.current=false;if(current()&&alive.current)setBusy(false);}
 };
 return <div className="space-y-2 min-w-0"><div className="flex flex-wrap items-center justify-between gap-2"><Label>{label}</Label>{canGenerateAI&&allowed.includes(campo??'')&&!readOnly&&<Button type="button" variant="outline" disabled={!eligible||busy} onClick={()=>void generate()}>{busy?'Gerando…':'Gerar com IA'}</Button>}</div><Textarea aria-label={label} rows={rows} value={value} readOnly={readOnly} onChange={e=>onChange(e.target.value)}/>
 {preview&&<section className="border rounded p-3 space-y-2" aria-label={`Sugestão para ${label}`}><p className="whitespace-pre-wrap">{preview.text}</p><p className="text-xs">Rascunho consultivo. Revise antes de aplicar; salvar a ficha é uma ação separada.</p><Button type="button" disabled={!eligible||busy} onClick={()=>{if(!eligible||!access.editor.capture()())return;if(value!==preview.base){setError('O texto foi alterado durante a pesquisa. Gere novamente para não sobrescrever o rascunho.');return;}onChange(preview.text);setPreview(null);}}>Aplicar sugestão ao rascunho</Button><Button type="button" variant="ghost" onClick={()=>setPreview(null)}>Descartar sugestão</Button></section>}
 {error&&<p role="alert">{error}</p>}</div>;
}
