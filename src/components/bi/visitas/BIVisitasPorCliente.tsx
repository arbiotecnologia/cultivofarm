import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { User, Calendar, ClipboardCheck, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ClienteData {
  id: string;
  nome: string;
  solicitacoes: number;
  visitas: number;
  recomendacoes: number;
  visitasPendentes: number;
  gargalos: number;
  ultimaVisita: string;
}

interface BIVisitasPorClienteProps {
  dados: ClienteData[];
  loading?: boolean;
  onRowClick?: (id: string, nome: string) => void;
}

export function BIVisitasPorCliente({ dados, loading, onRowClick }: BIVisitasPorClienteProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  if (dados.length === 0) {
    return <BIEmptyState mensagem="Nenhum cliente com atendimentos no período." />;
  }

  const sorted = [...dados].sort((a, b) => b.visitas - a.visitas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Cliente</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Visitas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Recom.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Pendentes</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Gargalos</TableHead>
            <TableHead className="text-xs font-bold uppercase">Última Atividade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => (
            <TableRow
              key={c.id}
              className="hover:bg-muted/20 cursor-pointer"
              onClick={() => onRowClick?.(c.id, c.nome)}
            >
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-bold">{c.nome}</span>
                </div>
              </TableCell>
              <TableCell className="text-center font-bold text-green-700">{c.visitas}</TableCell>
              <TableCell className="text-center">{c.recomendacoes}</TableCell>
              <TableCell className="text-center">
                {c.visitasPendentes > 0 ? (
                  <span className="text-orange-600 font-bold">{c.visitasPendentes}</span>
                ) : "—"}
              </TableCell>
              <TableCell className="text-center">
                {c.gargalos > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {c.gargalos}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {c.ultimaVisita ? format(new Date(c.ultimaVisita), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
