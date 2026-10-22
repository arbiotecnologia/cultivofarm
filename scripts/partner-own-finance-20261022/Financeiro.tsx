import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Table,TableHeader,TableHead,TableRow,TableBody,TableCell } from "@/components/ui/table";
import { brl,fmtDate } from "@/lib/financial/format";
import { useOwnFinance } from "./useOwnFinance";
function OwnFinancePage({partnerId, capability = false}:{partnerId:string; capability?:boolean}) {
  const [cursor,setCursor]=useState<{at:string;id:string}>();
  const query=useOwnFinance(partnerId,cursor,capability);
  const rows=query.data?.rows ?? [];
  const last=rows.at(-1);
  return <section className="space-y-4"><h1 className="text-xl font-semibold">Minhas obrigações com o fornecedor</h1>
    {!query.ready ? <p role="status">Acesso indisponível.</p> : query.isError ? <div role="alert">Financeiro indisponível.<Button variant="outline" onClick={()=>{void query.refetch();}}>Tentar novamente</Button></div>
    : query.isLoading ? <p role="status">Carregando títulos...</p> : <>
      <Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Valor do título</TableHead><TableHead>Status</TableHead><TableHead>Parcelas</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(row=><TableRow key={row.id}><TableCell>{row.numero}</TableCell><TableCell>{brl(row.total)}</TableCell><TableCell>{row.status}</TableCell><TableCell><ul>{row.installments?.map(i=><li key={i.id}>{i.numero} · {fmtDate(i.vencimento)} · {brl(i.valor)} · Pagamento registrado: {brl(i.recebido)} · {i.status}</li>)}</ul></TableCell></TableRow>)}</TableBody>
      </Table>
      {!rows.length && <p>Nenhum título autorizado nesta página.</p>}
      <div className="flex gap-2"><Button variant="outline" disabled={!cursor} onClick={()=>setCursor(undefined)}>Mais recentes</Button><Button variant="outline" disabled={query.isFetching || rows.length!==50 || !last} onClick={()=>{if(typeof last?.created_at==='string' && typeof last.id==='string')setCursor({at:last.created_at,id:last.id});}}>Mais antigos</Button></div>
    </>}
  </section>;
}
export default function Financeiro(){
 const {partner}=useOutletContext<{partner:{id:string;financeRead?:boolean}}>();
 return <OwnFinancePage key={partner.id} partnerId={partner.id} capability={partner.financeRead === true}/>;
}