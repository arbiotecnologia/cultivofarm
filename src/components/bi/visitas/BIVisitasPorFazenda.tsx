import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { MapPin, User, Calendar, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FazendaData {
  id: string;
  nome: string;
  cliente: string;
  solicitacoes: number;
  visitas: number;
  recomendacoes: number;
  gargalos: number;
  ultimaVisita: string;
}

interface BIVisitasPorFazendaProps {
  dados: FazendaData[];
  loading?: boolean;
  onRowClick?: (id: string, nome: string) => void;
}

export function BIVisitasPorFazenda({ dados, loading, onRowClick }: BIVisitasPorFazendaProps) {
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
    return <BIEmptyState mensagem="Nenhuma fazenda com atendimentos no período." />;
  }

  const sorted = [...dados].sort((a, b) => b.visitas - a.visitas);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Fazenda / Cliente</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Visitas</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Recom.</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Gargalos</TableHead>
            <TableHead className="text-xs font-bold uppercase">Última Atividade</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((f) => (
            <TableRow
              key={f.id}
              className="hover:bg-muted/20 cursor-pointer"
              onClick={() => onRowClick?.(f.id, f.nome)}
            >
              <TableCell className="font-medium">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-bold">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {f.nome}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-medium">
                    <User className="h-2.5 w-2.5" />
                    {f.cliente}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center font-bold">{f.visitas}</TableCell>
              <TableCell className="text-center">{f.recomendacoes}</TableCell>
              <TableCell className="text-center">
                {f.gargalos > 0 ? (
                  <div className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {f.gargalos}
                  </div>
                ) : "—"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {f.ultimaVisita ? format(new Date(f.ultimaVisita), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
