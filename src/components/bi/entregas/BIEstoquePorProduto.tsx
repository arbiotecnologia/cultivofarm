import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { Box, Truck, CheckCircle2, Clock } from "lucide-react";

interface EstoqueProduto {
  nome: string;
  volumeEstoque: number | null;
  volumeReservado: number | null;
  volumeSolicitadoEntregue: number | null;
  osVinculadas: number;
  entregasPendentes: number;
}

interface BIEstoquePorProdutoProps {
  dados: EstoqueProduto[];
  loading?: boolean;
}

export function BIEstoquePorProduto({ dados, loading }: BIEstoquePorProdutoProps) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhum dado de estoque por produto." />;

  const sorted = [...dados].sort((a, b) => (b.volumeEstoque || 0) - (a.volumeEstoque || 0));

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Produto / Microrganismo</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Volume Total (L)</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Reservado</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Vol. Sol. Entregue</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">OS</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Pendentes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => (
            <TableRow key={p.nome} className="hover:bg-muted/20 text-sm">
              <TableCell className="font-bold flex items-center gap-2">
                <Box className="h-3.5 w-3.5 text-primary" />
                {p.nome}
              </TableCell>
              <TableCell className="text-center font-black">{p.volumeEstoque !== null ? p.volumeEstoque.toLocaleString() : "—"}</TableCell>
              <TableCell className="text-center text-orange-600 font-medium">{p.volumeReservado !== null ? p.volumeReservado.toLocaleString() : "—"}</TableCell>
              <TableCell className="text-center text-emerald-600">{p.volumeSolicitadoEntregue !== null ? p.volumeSolicitadoEntregue.toLocaleString() : "—"}</TableCell>
              <TableCell className="text-center">{p.osVinculadas}</TableCell>
              <TableCell className="text-center">
                {p.entregasPendentes > 0 ? (
                  <div className="inline-flex items-center gap-1 text-orange-600 font-bold">
                    <Truck className="h-3 w-3" /> {p.entregasPendentes}
                  </div>
                ) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="p-2 border-t bg-slate-50 text-[10px] text-muted-foreground italic">
        * Volume Total (L) calculado a partir do estoque físico auditado (ml / 1000). Reservas sem volume explícito são exibidas como "—".
      </div>
    </div>
  );
}
