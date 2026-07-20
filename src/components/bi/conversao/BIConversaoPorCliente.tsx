import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { User, TrendingUp, Zap, Clock, MapPin } from "lucide-react";

interface ClienteConversao {
  id: string;
  nome: string;
  recomendacoesEmitidas: number;
  recomendacoesLiberadas: number;
  convertidasOS: number;
  aguardandoDecisao: number;
  taxaConversao: string;
  fazendasCount: number;
}

interface BIConversaoPorClienteProps {
  dados: ClienteConversao[];
  loading?: boolean;
}

export function BIConversaoPorCliente({ dados, loading }: BIConversaoPorClienteProps) {
  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhum cliente com recomendações no período." />;

  const sorted = [...dados].sort((a, b) => b.recomendacoesEmitidas - a.recomendacoesEmitidas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Produtor</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Fazendas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Recom.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Liberadas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Conv. OS</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Taxa Conv.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Em Decisão</TableHead>
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
                <div className="inline-flex items-center gap-1 text-muted-foreground text-xs font-bold">
                  <MapPin className="h-3 w-3" /> {c.fazendasCount}
                </div>
              </TableCell>
              <TableCell className="text-center">{c.recomendacoesEmitidas}</TableCell>
              <TableCell className="text-center">{c.recomendacoesLiberadas}</TableCell>
              <TableCell className="text-center font-bold text-emerald-600">{c.convertidasOS}</TableCell>
              <TableCell className="text-center">
                <div className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  {c.taxaConversao}%
                </div>
              </TableCell>
              <TableCell className="text-center">
                {c.aguardandoDecisao > 0 ? (
                  <div className="inline-flex items-center gap-1 text-orange-600 font-bold">
                    <Clock className="h-3 w-3" /> {c.aguardandoDecisao}
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
