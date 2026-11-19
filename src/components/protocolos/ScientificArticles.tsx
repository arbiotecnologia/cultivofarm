import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStorageAccessScope } from '@/hooks/useStorageAccessScope';
import { useAuthenticatedAttachmentOpener } from '@/hooks/useAuthenticatedAttachmentOpener';
import { articleBytes, listArticles, uploadArticle, verifyArticle, type ArticleAttempt, type ArticleEntity, type ScientificArticle } from '@/lib/catalogo/scientificArticles';
type Props={entity:ArticleEntity;parent:string;organization:string;editable:boolean;blocked?:boolean;onWorking?(value:boolean):void};
export function ScientificArticles(props:Props){
 const access=useStorageAccessScope(`scientific-articles:${props.entity}:${props.parent}`);
 return <ArticleLibrary key={access.scope} {...props}/>;
}
function ArticleLibrary({entity,parent,organization,editable,blocked=false,onWorking}:Props){
 const access=useStorageAccessScope(`scientific-articles:${entity}:${parent}`);
 const [rows,setRows]=useState<ScientificArticle[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const [title,setTitle]=useState(''),[file,setFile]=useState<File|null>(null),[selected,setSelected]=useState<ScientificArticle|null>(null),[pending,setPending]=useState(false);
 const lock=useRef(false),attempt=useRef<ArticleAttempt|null>(null),read=useRef<AbortController|null>(null),operation=useRef<AbortController|null>(null),fileInput=useRef<HTMLInputElement>(null);
 const onWorkingRef=useRef(onWorking);onWorkingRef.current=onWorking;
 const opener=useAuthenticatedAttachmentOpener(`scientific-article-view:${entity}:${parent}`,'catalog-scientific-articles',async(id,signal)=>{
  const row=rows.find(x=>x.id===id);if(!row)throw Error('Artigo não encontrado.');
  const blob=await articleBytes('open',entity,parent,id,signal);if(!(blob instanceof Blob))throw Error('Arquivo inválido.');return (await verifyArticle(blob,row)).blob;
 });
 const refresh=async()=>{
  if(!access.ready||lock.current)return;read.current?.abort();const controller=new AbortController();read.current=controller;const current=access.capture();
  setLoading(true);setError('');const timeout=setTimeout(()=>controller.abort(),20000);
  try{const result=await listArticles(entity,parent,organization,controller.signal);if(current()&&!controller.signal.aborted&&read.current===controller)setRows(result);}
  catch(e){if(current()&&read.current===controller){setRows([]);if(selected)opener.discard(selected.id);setSelected(null);setError(e instanceof Error?e.message:'Consulta indisponível.');}}
  finally{clearTimeout(timeout);if(current()&&read.current===controller)setLoading(false);}
 };
 useEffect(()=>{void refresh();return()=>{read.current?.abort();operation.current?.abort();attempt.current=null;onWorkingRef.current?.(false);};},[entity,parent,organization,access.scope]);
 const submit=async()=>{
  if(!editable||blocked||!access.ready||lock.current||(!attempt.current&&(!file||!title.trim())))return;
  lock.current=true;setBusy(true);onWorkingRef.current?.(true);setError('');read.current?.abort();
  const controller=new AbortController();operation.current=controller;const current=access.capture();const timeout=setTimeout(()=>controller.abort(),60000);
  try{
   if(!attempt.current&&file){if(!file.name.toLowerCase().endsWith('.pdf'))throw Error('Selecione um arquivo .pdf.');const v=await verifyArticle(file);if(!current()||controller.signal.aborted)return;attempt.current={id:crypto.randomUUID(),entity,parent,org:organization,title:title.trim(),file_name:file.name,...v};setPending(true);}
   if(!attempt.current)return;await uploadArticle(attempt.current,controller.signal,current);
   if(!current()||controller.signal.aborted)return;attempt.current=null;setPending(false);setTitle('');setFile(null);if(fileInput.current)fileInput.current.value='';lock.current=false;await refresh();
  }catch(e){if(current())setError(e instanceof Error?e.message:'Envio inconclusivo.');}
  finally{clearTimeout(timeout);lock.current=false;if(current()){setBusy(false);onWorkingRef.current?.(!!attempt.current);}}
 };
 const open=async(row:ScientificArticle)=>{
  if(!access.ready||lock.current)return;if(selected)opener.discard(selected.id);setSelected(row);setError('');
  const current=access.capture();const controller=new AbortController();operation.current=controller;const timeout=setTimeout(()=>controller.abort(),45000);
  try{await opener.open(row.id,()=>{if(current())setError('Não foi possível abrir o artigo. Verifique o acesso e tente novamente.');},controller.signal);}finally{clearTimeout(timeout);}
 };
 const url=selected?opener.urls[selected.id]:undefined;
 return <section aria-label="Artigos científicos" className="min-w-0 space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Artigos científicos</h3><Button variant="outline" disabled={busy||loading||!access.ready} onClick={()=>void refresh()}>Atualizar artigos</Button></div>
  <p className="text-sm text-muted-foreground">Biblioteca da empresa vinculada a esta ficha. Os artigos recebidos aguardam estudo; anexar um PDF não aprova alegações nem altera a ficha técnica.</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {loading?<p role="status">Consultando artigos…</p>:!error&&!rows.length?<p>Nenhum artigo enviado para esta ficha.</p>:null}
  {rows.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"><div className="min-w-0"><h4 className="break-words font-medium">{row.title}</h4><p className="break-words text-sm text-muted-foreground">{row.file_name} · {(row.size_bytes/1024).toFixed(1)} KiB · Recebido — aguardando estudo</p></div><Button variant="outline" disabled={busy||!access.ready} onClick={()=>void open(row)}>Ler PDF</Button></article>)}
  {selected&&<section aria-label="Leitura do artigo" className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="break-words font-medium">{selected.title}</h4><div className="flex gap-2"><Button variant="outline" disabled={!url} onClick={()=>opener.download(selected.id,selected.file_name)}>Baixar PDF</Button><Button variant="ghost" onClick={()=>{opener.discard(selected.id);setSelected(null);}}>Fechar leitura</Button></div></div>{url?<iframe title={selected.title} src={url} className="h-[55vh] w-full rounded border"/>:<p role="status">PDF ainda não carregado. Use Ler PDF para tentar novamente.</p>}</section>}
  {editable&&<div className="space-y-3 rounded border p-3"><h4 className="font-medium">Enviar artigo para esta ficha</h4>{blocked&&<p>Conclua as alterações da ficha antes de enviar um artigo.</p>}<Label htmlFor={`article-title-${parent}`}>Título do artigo</Label><Input id={`article-title-${parent}`} value={title} maxLength={200} disabled={busy||pending||blocked} onChange={e=>setTitle(e.target.value)}/><Label htmlFor={`article-file-${parent}`}>PDF — até 10 MiB</Label><Input ref={fileInput} id={`article-file-${parent}`} type="file" accept=".pdf,application/pdf" disabled={busy||pending||blocked} onChange={e=>setFile(e.target.files?.[0]??null)}/><div className="flex flex-wrap gap-2"><Button disabled={busy||blocked||!access.ready||(!pending&&(!file||!title.trim()))} onClick={()=>void submit()}>{busy?'Enviando…':pending?'Reconciliar envio':'Enviar PDF'}</Button>{pending&&!busy&&<Button variant="outline" onClick={()=>{attempt.current=null;setPending(false);setFile(null);setTitle('');if(fileInput.current)fileInput.current.value='';onWorkingRef.current?.(false);setError('Tentativa encerrada localmente. Atualize a lista antes de enviar novamente; um envio inconclusivo pode ter sido recebido.');}}>Encerrar tentativa local</Button>}</div></div>}
 </section>;
}

