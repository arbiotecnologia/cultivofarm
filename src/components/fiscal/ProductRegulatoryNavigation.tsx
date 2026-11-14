import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useStorageAccessScope } from '@/hooks/useStorageAccessScope';
import { ProductDossierManagement } from './ProductDossierManagement';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRegulatoryProducts, type RegulatoryProduct } from '@/hooks/useProductRegulatoryDossiers';

const labels={NONE:'Sem dossiê',DRAFT:'Rascunho',PENDING_REVIEW:'Em revisão',VALIDATED:'Validado',BLOCKED:'Bloqueado'};
export function ProductRegulatoryNavigation({microId}:{microId:string}) {
 const access=useStorageAccessScope('regulatory-products-navigation');
 return <ScopedNavigation key={`${microId}:${access.scope}`} microId={microId}/>;
}
function ScopedNavigation({microId}:{microId:string}) {
 const products=useRegulatoryProducts(microId);
 const [selected,setSelected]=useState<RegulatoryProduct|null>(null);
 if(selected) return <ProductDetail key={selected.product_id} microId={microId} product={selected} onBack={()=>setSelected(null)}/>;
 return <div className="space-y-4 py-4">
  <h3 className="font-medium">Produtos comerciais vinculados</h3>
  {!products.ready||products.isLoading?<Loading/>:products.isError?<ReadError/>:products.data?.length===0?<p className="text-sm text-muted-foreground">Nenhum produto desta empresa está vinculado a este microrganismo.</p>:<ul className="divide-y">{products.data?.map(p=><li key={p.product_id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium break-words">{p.nome}</p><p className="text-xs text-muted-foreground">{p.codigo??'Código não informado'} · {p.ativo?'Ativo':'Inativo'}</p><Badge variant="outline">{labels[p.dossier_status]}</Badge></div><Button variant="outline" size="sm" onClick={()=>setSelected(p)} aria-label={`Abrir dossiê do produto ${p.nome}`}>Abrir dossiê</Button></li>)}</ul>}
 </div>;
}
function Loading(){return <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando…</p>;}
function ReadError(){return <Alert variant="destructive"><AlertDescription>Não foi possível consultar os registros. Tente novamente mais tarde.</AlertDescription></Alert>;}
function ProductDetail({product,onBack}:{microId:string;product:RegulatoryProduct;onBack:()=>void}) {
 const auth=useAuth();
 return <ProductDossierManagement product={{...product,organization_name:'',owner_organization_id:auth.profile?.organization_id??''}} onBack={onBack}/>;
}
