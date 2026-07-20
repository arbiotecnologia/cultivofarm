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
import { AlertTriangle, MapPin, User, ArrowUpRight, Beaker, Package, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OSCritica {
  id: string;
  os_id: string;
  numero_os: string;
  origem_os: string;
  cliente: string;
  fazenda: string;
  talhao: string;
  produto: string;
  status_esteira_oficial: string;
  proxima_acao: string;
  bloqueios: string[];
  pendencias_informativas: string[];
  atrasado: boolean;
  pode_finalizar: boolean;
  gravidade: string;
}

interface BITabelaOSCriticasProps {
  dados: OSCritica[];
  loading?: boolean;
}

export function BITabelaOSCriticas({ dados, loading }: BITabelaOSCriticasProps) {
  const navigate = useNavigate();

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma OS com gargalo crítico identificado." />;

  const sorted = [...dados].sort((a, b) => (a.atrasado === b.atrasado ? 0 : a.atrasado ? -1 : 1));

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-red-50/30">
          <TableRow>
            <TableHead className="w-[150px] text-xs font-bold uppercase">Ordem de Serviço</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produtor / Local</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Status / Etapa</TableHead>
            <TableHead className="text-xs font-bold uppercase">Impedimentos</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((os) => (
            <TableRow key={os.id} className="hover:bg-red-50/10 text-sm">
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-black text-foreground">#{os.numero_os}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-bold">{os.origem_os}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" /> {os.cliente}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium truncate max-w-[150px]">
                    <MapPin className="h-2.5 w-2.5" /> {os.fazenda} {os.talhao && `• ${os.talhao}`}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-xs font-medium">
                  <Beaker className="h-3 w-3 text-primary" /> {os.produto}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <BIStatusBadge type="esteira" status={os.status_esteira_oficial} className="text-[9px] h-5" />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {os.atrasado && (
                    <div className="bg-red-100 text-red-700 text-[9px] font-black px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-tighter">
                      <AlertTriangle className="h-2 w-2" /> Atrasado
                    </div>
                  )}
                  {os.bloqueios?.map(b => (
                    <div key={b} className="bg-red-50 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-100 capitalize">
                      {b.replace(/_/g, " ")}
                    </div>
                  ))}
                  {os.pendencias_informativas?.map(p => (
                    <TooltipProvider key={p}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="bg-blue-50 text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-100 cursor-help">
                            <Info className="h-2.5 w-2.5 inline mr-1" /> Informativa
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs uppercase font-bold">{p.replace(/_/g, " ")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
                <div className="text-[10px] text-primary italic font-medium mt-1">
                  Ação: {os.proxima_acao}
                </div>
              </TableCell>
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-primary" 
                  onClick={() => navigate(`/cockpit-laboratorio?os=${os.os_id}`)}
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
