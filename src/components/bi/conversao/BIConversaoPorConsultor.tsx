import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { User, TrendingUp, Zap, Clock, AlertTriangle } from "lucide-react";

interface ConsultorConversao {
  id: string;
  nome: string;
  recomendacoesEmitidas: number;
  recomendacoesLiberadas: number;
  convertidasOS: number;
  aguardandoDecisao: number;
  taxaConversao: string;
  tempoMedioLibOS: string | null;
  oportunidadesParadas: number;
}

interface BIConversaoPorConsultorProps {
  dados: ConsultorConversao[];
  loading?: boolean;
}

export function BIConversaoPorConsultor({ dados, loading }: BIConversaoPorConsultorProps) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhum consultor com recomendações no período." />;

  const sorted = [...dados].sort((a, b) => parseFloat(b.taxaConversao) - parseFloat(a.taxaConversao));

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Consultor</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Emitidas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Liberadas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Em OS</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Taxa Conv.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Lead Time Lib→OS</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Paradas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((c) => (
            <TableRow key={c.id} className="hover:bg-muted/20 text-sm">
              <TableCell className="font-bold flex items-center gap-2">
                <div className="bg-primary/10 p-1.5 rounded-full">
                  <User className="h-3 w-3 text-primary" />
                </div>
                {c.nome}
              </TableCell>
              <TableCell className="text-center">{c.recomendacoesEmitidas}</TableCell>
              <TableCell className="text-center">
                <div className="flex items-center justify-center gap-1 text-purple-600 font-medium">
                  <Zap className="h-3 w-3" /> {c.recomendacoesLiberadas}
                </div>
              </TableCell>
              <TableCell className="text-center font-bold text-emerald-600">{c.convertidasOS}</TableCell>
              <TableCell className="text-center">
                <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold border border-emerald-100">
                  {c.taxaConversao}%
                </div>
              </TableCell>
              <TableCell className="text-center text-muted-foreground">
                {c.tempoMedioLibOS ? `${c.tempoMedioLibOS}h` : "—"}
              </TableCell>
              <TableCell className="text-center">
                {c.oportunidadesParadas > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-xs font-bold">
                    <Clock className="h-3 w-3" /> {c.oportunidadesParadas}
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
