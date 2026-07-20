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
import { AlertTriangle, MapPin, User, ArrowUpRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface VisitaCritica {
  id: string;
  tipo: string;
  cliente: string;
  fazenda: string;
  talhao: string;
  consultor: string;
  status_solicitacao: string;
  status_visita: string;
  proxima_acao: string;
  gravidade: string;
  dias_em_aberto: number;
  solicitacao_id?: string;
  registro_consultor_id?: string;
}

interface BITabelaVisitasCriticasProps {
  dados: VisitaCritica[];
  loading?: boolean;
}

export function BITabelaVisitasCriticas({ dados, loading }: BITabelaVisitasCriticasProps) {
  const navigate = useNavigate();

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
    return <BIEmptyState mensagem="Nenhuma visita ou solicitação crítica pendente." />;
  }

  const handleOpen = (v: VisitaCritica) => {
    if (v.registro_consultor_id) {
      navigate(`/visita-tecnica/${v.registro_consultor_id}`);
    } else if (v.solicitacao_id) {
      navigate(`/solicitacoes`);
    }
  };

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-red-50/50">
          <TableRow>
            <TableHead className="w-[180px] text-xs font-bold uppercase text-red-900">Impedimento</TableHead>
            <TableHead className="text-xs font-bold uppercase">Produtor / Local</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Dias</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Status</TableHead>
            <TableHead className="text-xs font-bold uppercase">Ação Recomendada</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.map((v) => (
            <TableRow key={v.id} className="hover:bg-red-50/20">
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${v.gravidade === 'critica' ? 'text-red-600' : 'text-orange-500'}`} />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold capitalize leading-tight">{v.tipo.replace(/_/g, " ")}</span>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase">{v.consultor || "Sem consultor"}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <User className="h-3 w-3 text-muted-foreground" />
                    {v.cliente}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                    <MapPin className="h-3 w-3" />
                    {v.fazenda} {v.talhao && `• ${v.talhao}`}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <div className={`inline-flex flex-col items-center justify-center p-1 rounded ${v.dias_em_aberto > 5 ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'}`}>
                  <span className="text-sm font-black leading-none">{v.dias_em_aberto || 0}</span>
                  <span className="text-[8px] font-bold uppercase">DIAS</span>
                </div>
              </TableCell>
              <TableCell className="text-center">
                <BIStatusBadge type="visita" status={v.status_visita || v.status_solicitacao} className="text-[9px] px-1.5 h-5" />
              </TableCell>
              <TableCell>
                <p className="text-xs text-primary font-bold italic line-clamp-1">
                  {v.proxima_acao || "Aguardando intervenção técnica"}
                </p>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleOpen(v)}>
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
