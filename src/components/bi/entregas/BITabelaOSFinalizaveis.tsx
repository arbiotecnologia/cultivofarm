import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { MapPin, User, ArrowUpRight, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OSFinalizavel {
  id: string;
  os_id: string;
  numero_os: string;
  origem_os: string;
  cliente: string;
  fazenda: string;
  produto: string;
  entrega_confirmada: boolean;
  pendencias_informativas: string[];
}

interface BITabelaOSFinalizaveisProps {
  dados: OSFinalizavel[];
  loading?: boolean;
}

export function BITabelaOSFinalizaveis({ dados, loading }: BITabelaOSFinalizaveisProps) {
  const navigate = useNavigate();

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded-md" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma OS apta para finalização no momento." />;

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-blue-50/30">
          <TableRow>
            <TableHead className="w-[150px] text-xs font-bold uppercase">Ordem de Serviço</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produtor / Local</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Entrega</TableHead>
            <TableHead className="text-xs font-bold uppercase">Ações / Pendências</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.map((os) => (
            <TableRow key={os.id} className="hover:bg-blue-50/10 text-sm">
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
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                    <MapPin className="h-2.5 w-2.5" /> {os.fazenda}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs font-medium">{os.produto}</TableCell>
              <TableCell className="text-center">
                {os.entrega_confirmada ? (
                  <div className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-green-100 shadow-sm">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Confirmada
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {os.pendencias_informativas?.length > 0 ? (
                    os.pendencias_informativas.map(p => (
                      <TooltipProvider key={p}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="bg-slate-100 text-slate-600 text-[8px] font-bold px-1.5 py-0.5 rounded border cursor-help uppercase tracking-tighter">
                              <Info className="h-2 w-2 inline mr-0.5" /> {p.replace(/_/g, " ").slice(0, 15)}...
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs font-bold uppercase">{p.replace(/_/g, " ")}</p>
                            <p className="text-[10px]">Acompanhamento pós-entrega</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))
                  ) : (
                    <span className="text-[10px] text-emerald-600 font-bold uppercase">Sem pendências</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-primary shadow-sm hover:bg-primary/5 border" 
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
