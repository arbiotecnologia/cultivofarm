import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { MapPin, User, Truck, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FazendaEntregas {
  id: string;
  nome: string;
  cliente: string;
  entregasPendentes: number;
  entregasConfirmadas: number;
  pendencias: number;
  ultimaEntrega: string | null;
}

interface BIEntregasPorFazendaProps {
  dados: FazendaEntregas[];
  loading?: boolean;
  onRowClick?: (id: string, nome: string) => void;
}

export function BIEntregasPorFazenda({ dados, loading, onRowClick }: BIEntregasPorFazendaProps) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma entrega vinculada a fazendas no período." />;

  const sorted = [...dados].sort((a, b) => b.entregasConfirmadas - a.entregasConfirmadas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Fazenda / Cliente</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Pendentes</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Confirmadas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Pendências</TableHead>
            <TableHead className="text-xs font-bold uppercase">Última Entrega</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((f) => (
            <TableRow
              key={f.id}
              className="hover:bg-muted/20 cursor-pointer text-sm"
              onClick={() => onRowClick?.(f.id, f.nome)}
            >
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> {f.nome}
                  </span>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                    <User className="h-2.5 w-2.5" /> {f.cliente}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {f.entregasPendentes > 0 ? (
                  <div className="inline-flex items-center gap-1 text-orange-600 font-bold">
                    <Truck className="h-3 w-3" /> {f.entregasPendentes}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center font-bold text-emerald-600">{f.entregasConfirmadas}</TableCell>
              <TableCell className="text-center text-red-600">
                {f.pendencias > 0 ? (
                  <div className="inline-flex items-center gap-1 font-bold">
                    <AlertTriangle className="h-3 w-3" /> {f.pendencias}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {f.ultimaEntrega ? format(new Date(f.ultimaEntrega), "dd/MM/yy", { locale: ptBR }) : "—"}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
