import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { User, Truck, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

interface ClienteEntregas {
  id: string;
  nome: string;
  entregasPendentes: number;
  entregasConfirmadas: number;
  osFinalizaveis: number;
  volumeSolicitadoEntregue: number;
  gargalosExpedicao: number;
}

interface BIEntregasPorClienteProps {
  dados: ClienteEntregas[];
  loading?: boolean;
}

export function BIEntregasPorCliente({ dados, loading }: BIEntregasPorClienteProps) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma entrega vinculada a clientes no período." />;

  const sorted = [...dados].sort((a, b) => b.entregasConfirmadas - a.entregasConfirmadas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Produtor</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Pendentes</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Confirmadas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Aptas Finalizar</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Vol. Sol. Entregue</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Gargalos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => (
            <TableRow key={c.id} className="hover:bg-muted/20 text-sm">
              <TableCell className="font-bold flex items-center gap-2">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                {c.nome}
              </TableCell>
              <TableCell className="text-center">
                {c.entregasPendentes > 0 ? (
                  <div className="inline-flex items-center gap-1 text-orange-600 font-bold">
                    <Truck className="h-3 w-3" /> {c.entregasPendentes}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center font-bold text-emerald-600">{c.entregasConfirmadas}</TableCell>
              <TableCell className="text-center">
                {c.osFinalizaveis > 0 ? (
                  <div className="inline-flex items-center gap-1 text-blue-600 font-bold">
                    <CheckCircle2 className="h-3 w-3" /> {c.osFinalizaveis}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center font-medium">{c.volumeSolicitadoEntregue.toLocaleString()} L</TableCell>
              <TableCell className="text-center">
                {c.gargalosExpedicao > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">
                    <AlertTriangle className="h-3 w-3" /> {c.gargalosExpedicao}
                  </div>
                ) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
