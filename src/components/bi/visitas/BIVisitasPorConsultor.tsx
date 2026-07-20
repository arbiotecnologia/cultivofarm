import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { User, ClipboardCheck, FileCheck, TrendingUp, Timer, AlertTriangle } from "lucide-react";

interface ConsultorData {
  id: string;
  nome: string;
  solicitacoes: number;
  checkins: number;
  visitasFinalizadas: number;
  recomendacoesEmitidas: number;
  recomendacoesLiberadas: number;
  convertidasOS: number;
  tempoMedio: string | null;
  gargalos: number;
}

interface BIVisitasPorConsultorProps {
  dados: ConsultorData[];
  loading?: boolean;
  onRowClick?: (id: string, nome: string) => void;
}

export function BIVisitasPorConsultor({ dados, loading, onRowClick }: BIVisitasPorConsultorProps) {
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
    return <BIEmptyState mensagem="Nenhum consultor com atividades no período." />;
  }

  // Ordenar por visitas finalizadas
  const sorted = [...dados].sort((a, b) => b.visitasFinalizadas - a.visitasFinalizadas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Consultor</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Solicitações</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Check-ins</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Visitas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Recom.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Conv. OS</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">T. Médio</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Gargalos</TableHead>
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
                  <div className="bg-primary/10 p-1.5 rounded-full">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-bold truncate max-w-[150px]">{c.nome}</span>
                </div>
              </TableCell>
              <TableCell className="text-center font-medium">{c.solicitacoes}</TableCell>
              <TableCell className="text-center">{c.checkins}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <ClipboardCheck className="h-3 w-3 text-green-600" />
                  <span className="font-bold">{c.visitasFinalizadas}</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <FileCheck className="h-3 w-3 text-blue-600" />
                  {c.recomendacoesEmitidas}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                  {c.convertidasOS}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Timer className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{c.tempoMedio ? `${c.tempoMedio}h` : "—"}</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                {c.gargalos > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {c.gargalos}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
