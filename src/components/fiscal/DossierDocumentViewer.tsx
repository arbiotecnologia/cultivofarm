import {useEffect,useState} from 'react';
import {Download,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useAuthenticatedAttachmentOpener} from '@/hooks/useAuthenticatedAttachmentOpener';
import {regulatoryDocumentTransport} from '@/hooks/useProductDossierManagement';
import type {ProductDossier} from '@/hooks/useProductRegulatoryDossiers';

type VerifiedMime='image/png'|'image/jpeg'|'application/pdf';
export async function verifyDossierBlob(blob:Blob,expectedHash:string):Promise<Blob>{
 if(blob.size<1||blob.size>20*1024*1024)throw new Error('Documento inválido.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 const starts=(signature:number[])=>signature.every((v,i)=>bytes[i]===v);
 const mime:VerifiedMime|null=starts([137,80,78,71,13,10,26,10])?'image/png':starts([255,216,255])?'image/jpeg':starts([37,80,68,70,45])?'application/pdf':null;
 if(!mime)throw new Error('Formato não autorizado.');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 if(!/^[a-f0-9]{64}$/i.test(expectedHash)||hash!==expectedHash.toLowerCase())throw new Error('Integridade não confirmada.');
 return new Blob([bytes],{type:mime});
}

export function DossierDocumentViewer({document:doc,productId,microId,onClose}:{document:ProductDossier['documents'][number];productId:string;microId:string;onClose:()=>void}){
 const [mime,setMime]=useState('');const [error,setError]=useState(false);
 const opener=useAuthenticatedAttachmentOpener(`dossier-view:${productId}:${doc.dossier_id}:${doc.id}`,'fiscal-regulatorio',async(id,signal)=>{
  const result=await regulatoryDocumentTransport('open',{product_id:productId,microorganism_id:microId,document_id:id});
  if(signal.aborted||!(result instanceof Blob))throw new Error('Documento indisponível.');
  const verified=await verifyDossierBlob(result,doc.content_sha256);
  if(signal.aborted)throw new Error('Consulta encerrada.');
  setMime(verified.type);return verified;
 });
 useEffect(()=>{if(!opener.ready)return;const controller=new AbortController();void opener.open(doc.id,()=>setError(true),controller.signal);return()=>{controller.abort();opener.discard(doc.id);};},[opener.ready,doc.id]);
 const url=opener.urls[doc.id];
 return <section aria-label="Visualizador de documento" className="space-y-3 border-t pt-4">
  <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-medium break-words">{doc.title}</h4><div className="flex gap-2"><Button variant="outline" disabled={!url} onClick={()=>opener.download(doc.id,doc.storage_path.split('/').pop()??doc.title)}><Download className="mr-2 h-4 w-4"/>Baixar documento</Button><Button variant="ghost" aria-label="Fechar documento" onClick={()=>{opener.discard(doc.id);onClose();}}><X className="h-4 w-4"/></Button></div></div>
  {!opener.ready?<p role="alert">Acesso ao documento indisponível.</p>:error?<p role="alert">Documento indisponível, formato inválido ou integridade não confirmada.</p>:!url?<p role="status">Carregando documento…</p>:mime==='application/pdf'?<object data={url} type="application/pdf" aria-label={`PDF: ${doc.title}`} className="h-[65vh] min-h-80 w-full"><p>Visualização de PDF indisponível neste navegador. <Button variant="link" onClick={()=>opener.download(doc.id,doc.storage_path.split('/').pop()??doc.title)}>Baixar documento</Button></p></object>:<img src={url} alt={doc.title} className="max-h-[65vh] w-full object-contain" onError={()=>setError(true)}/>}
 </section>;
}