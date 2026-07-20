import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIStatusBadge } from "./BIStatusBadge";
import { BIEmptyState } from "./BIEmptyState";
import { AlertTriangle, MapPin, User, ArrowRight } from "lucide-react";

interface Gargalo {
  id: string;
  tipo: string;
  cliente: string;
  fazenda: string;
  etapa: string;
  proxima_acao: string;
  gravidade: string;
  origem: string;
}

interface BIGargalosTableProps {
  dados: Gargalo[];
  loading?: boolean;
}

export function BIGargalosTable({ dados, loading }: BIGargalosTableProps) {
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
    return <BIEmptyState mensagem="Nenhum gargalo crítico identificado nos filtros atuais." />;
  }

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="w-[200px] text-xs font-bold uppercase">Gargalo / Impedimento</TableHead>
            <TableHead className="text-xs font-bold uppercase">Localização</TableHead>
            <TableHead className="text-xs font-bold uppercase">Etapa do Fluxo</TableHead>
            <TableHead className="text-xs font-bold uppercase">Gravidade</TableHead>
            <TableHead className="text-xs font-bold uppercase">Próxima Ação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.map((g) => (
            <TableRow key={g.id} className="hover:bg-muted/20">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${g.gravidade === 'critica' ? 'text-red-600' : 'text-orange-500'}`} />
                  <span className="text-sm leading-tight capitalize">{g.tipo.replace(/_/g, " ")}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {g.cliente}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {g.fazenda}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold">{g.etapa}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{g.origem}</span>
                </div>
              </TableCell>
              <TableCell>
                <BIStatusBadge type="gravidade" status={g.gravidade} className="text-[10px]" />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2 text-primary font-bold text-xs bg-primary/5 px-2 py-1 rounded border border-primary/10">
                  <ArrowRight className="h-3 w-3" />
                  {g.proxima_acao || "Verificar pendência"}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
