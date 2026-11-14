import { useState } from 'react';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRegulatoryProducts, useProductRegulatoryDossier, loadProductRegulatoryDocument, type RegulatoryProduct, type ProductDossier } from '@/hooks/useProductRegulatoryDossiers';
import { useAuthenticatedAttachmentOpener } from '@/hooks/useAuthenticatedAttachmentOpener';

const labels={NONE:'Sem dossiê',DRAFT:'Rascunho',PENDING_REVIEW:'Em revisão',VALIDATED:'Validado',BLOCKED:'Bloqueado'};
export function ProductRegulatoryNavigation({microId,onLegacy}:{microId:string;onLegacy:()=>void}) {
 const products=useRegulatoryProducts(microId);
 const [selected,setSelected]=useState<RegulatoryProduct|null>(null);
 if(selected) return <ProductDetail key={selected.product_id} microId={microId} product={selected} onBack={()=>setSelected(null)}/>;
 return <div className="space-y-4 py-4">
  <h3 className="font-medium">Produtos comerciais vinculados</h3>
  {!products.ready||products.isLoading?<Loading/>:products.isError?<ReadError/>:products.data?.length===0?<p className="text-sm text-muted-foreground">Nenhum produto comercial vinculado a este microrganismo.</p>:<ul className="divide-y">{products.data?.map(p=><li key={p.product_id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium break-words">{p.nome}</p><p className="text-xs text-muted-foreground">{p.codigo??'Código não informado'} · {p.ativo?'Ativo':'Inativo'}</p><Badge variant="outline">{labels[p.dossier_status]}</Badge></div><Button variant="outline" size="sm" onClick={()=>setSelected(p)} aria-label={`Abrir dossiê do produto ${p.nome}`}>Abrir dossiê</Button></li>)}</ul>}
  <Button variant="ghost" size="sm" onClick={onLegacy}>Dossiê legado do microrganismo</Button>
 </div>;
}
function Loading(){return <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando…</p>;}
function ReadError(){return <Alert variant="destructive"><AlertDescription>Não foi possível consultar os registros. Tente novamente mais tarde.</AlertDescription></Alert>;}
function ProductDetail({microId,product,onBack}:{microId:string;product:RegulatoryProduct;onBack:()=>void}) {
 const detail=useProductRegulatoryDossier(microId,product.product_id);
 return <div className="space-y-4 py-4">
  <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4"/>Voltar à lista de produtos</Button>
  <h3 className="font-semibold break-words">{product.nome}</h3>
  <p className="text-sm text-muted-foreground">{product.codigo??'Código não informado'} · {product.ativo?'Ativo':'Inativo'}</p>
  {!detail.ready||detail.isLoading?<Loading/>:detail.isError?<ReadError/>:detail.data===null?<p className="text-sm text-muted-foreground">Nenhum dossiê registrado para este produto.</p>:detail.data?<DossierContent key={detail.data.dossier.id} microId={microId} productId={product.product_id} detail={detail.data}/>:null}
 </div>;
}
function DossierContent({microId,productId,detail}:{microId:string;productId:string;detail:ProductDossier}) {
 const [error,setError]=useState(false);
 const opener=useAuthenticatedAttachmentOpener(`product-dossier:${microId}:${productId}:${detail.dossier.id}`,'fiscal-regulatorio',(id,signal)=>loadProductRegulatoryDocument(microId,productId,id,signal));
 return <div className="space-y-5">
  <div><Badge variant="outline">{labels[detail.dossier.status]}</Badge><span className="ml-2 text-sm text-muted-foreground">Versão {detail.dossier.version}</span></div>
  <dl className="grid gap-3 text-sm sm:grid-cols-2">{[['Categoria regulatória',detail.dossier.regulatory_category],['Registro MAPA',detail.dossier.mapa_registration_number],['Situação MAPA',detail.dossier.mapa_status]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value??'Não informado'}</dd></div>)}</dl>
  {detail.dossier.blocked_reason&&<Alert variant="destructive"><AlertDescription>{detail.dossier.blocked_reason}</AlertDescription></Alert>}
  <section className="space-y-2"><h4 className="font-medium">Documentos</h4>{detail.documents.length===0?<p className="text-sm text-muted-foreground">Nenhum documento disponível neste dossiê.</p>:detail.documents.map(doc=><div className="border-b py-3" key={doc.id}><p className="text-sm font-medium break-words">{doc.title}</p><p className="text-xs text-muted-foreground">{doc.doc_type} · {doc.issuer??'Emissor não informado'}{doc.valid_until?` · Validade: ${doc.valid_until}`:''}</p><Button variant="outline" size="sm" disabled={!opener.ready||opener.loadingPaths.includes(doc.id)} onClick={async()=>{setError(false);opener.discard(doc.id);if(await opener.open(doc.id,()=>setError(true))) opener.download(doc.id,doc.storage_path.split('/').pop()??doc.title);}}><FileText className="mr-2 h-4 w-4"/>{opener.loadingPaths.includes(doc.id)?'Abrindo…':'Abrir documento'}</Button></div>)}{error&&<Alert variant="destructive"><AlertDescription>Documento indisponível ou acesso não autorizado.</AlertDescription></Alert>}</section>
  <section className="space-y-2"><h4 className="font-medium">Pendências deste produto</h4>{detail.gate.pendencies.length===0?<p className="text-sm text-muted-foreground">Nenhuma pendência aberta.</p>:<ul className="space-y-3">{detail.gate.pendencies.map((p,i)=><li key={`${p.code}-${p.field}-${i}`} className="border-b pb-2 text-sm"><Badge variant="outline">{p.layer==='TECHNICAL'?'Técnica':'Regulatória'}</Badge><p className="mt-1">{p.message}</p></li>)}</ul>}</section>
 </div>;
}