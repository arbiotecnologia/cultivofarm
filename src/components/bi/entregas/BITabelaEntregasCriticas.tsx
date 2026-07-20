import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIStatusBadge } from "../BIStatusBadge";
import { BIEmptyState } from "../BIEmptyState";
import { AlertTriangle, MapPin, User, ArrowUpRight, Truck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface EntregaCritica {
  id: string;
  os_id: string;
  numero_os: string;
  origem_os: string;
  cliente: string;
  fazenda: string;
  produto: string;
  status_esteira_oficial: string;
  entrega_status: string;
  entrega_confirmada: boolean;
  proxima_acao: string;
  bloqueios: string[];
  gravidade: string;
}

interface BITabelaEntregasCriticasProps {
  dados: EntregaCritica[];
  loading?: boolean;
}

export function BITabelaEntregasCriticas({ dados, loading }: BITabelaEntregasCriticasProps) {
  const navigate = useNavigate();

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma entrega crítica identificada." />;

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-red-50/30">
          <TableRow>
            <TableHead className="w-[150px] text-xs font-bold uppercase">OS / Origem</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produtor / Local</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Status Entrega</TableHead>
            <TableHead className="text-xs font-bold uppercase">Gargalos / Impedimentos</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.map((e) => (
            <TableRow key={e.id} className="hover:bg-red-50/10 text-sm">
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-black text-foreground">#{e.numero_os}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">{e.origem_os}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" /> {e.cliente}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium truncate max-w-[150px]">
                    <MapPin className="h-2.5 w-2.5" /> {e.fazenda}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs font-medium">{e.produto}</TableCell>
              <TableCell className="text-center">
                <div className="flex flex-col items-center gap-1">
                  <BIStatusBadge type="esteira" status={e.status_esteira_oficial} className="text-[9px] h-5" />
                  {e.entrega_confirmada ? (
                    <div className="flex items-center gap-1 text-[8px] font-black text-emerald-600 uppercase">
                      <CheckCircle2 className="h-2 w-2" /> Confirmada
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[8px] font-black text-orange-600 uppercase">
                      <Truck className="h-2 w-2" /> Pendente
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {e.bloqueios?.map(b => (
                    <div key={b} className="bg-red-50 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 capitalize">
                      {b.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-primary italic font-medium mt-1">
                  Ação: {e.proxima_acao}
                </div>
              </TableCell>
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-primary" 
                  onClick={() => navigate(`/entregas?os=${e.os_id}`)}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
