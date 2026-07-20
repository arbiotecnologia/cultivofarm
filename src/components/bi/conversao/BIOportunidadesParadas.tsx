import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { MapPin, User, Clock, ArrowUpRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OportunidadeParada {
  id: string;
  cliente: string;
  fazenda: string;
  talhao: string;
  consultor: string;
  data_liberacao: string;
  dias_em_aberto: number;
  proxima_acao: string;
  status_solicitacao: string;
  tipo: string;
  registro_consultor_id?: string;
  solicitacao_id?: string;
}

interface BIOportunidadesParadasProps {
  dados: OportunidadeParada[];
  loading?: boolean;
}

export function BIOportunidadesParadas({ dados, loading }: BIOportunidadesParadasProps) {
  const navigate = useNavigate();

  if (loading) return <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 w-full bg-muted animate-pulse rounded-lg" />)}</div>;

  if (dados.length === 0) return <BIEmptyState mensagem="Nenhuma oportunidade liberada aguardando decisão." />;

  const sorted = [...dados].sort((a, b) => b.dias_em_aberto - a.dias_em_aberto);

  return (
    <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
      <Table>
        <TableHeader className="bg-orange-50/30">
          <TableRow>
            <TableHead className="text-xs font-bold uppercase">Produtor / Local</TableHead>
            <TableHead className="text-xs font-bold uppercase">Consultor</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Liberação</TableHead>
            <TableHead className="text-xs font-bold uppercase text-center">Dias</TableHead>
            <TableHead className="text-xs font-bold uppercase">Status / Ação</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((o) => (
            <TableRow key={o.id} className="hover:bg-muted/10 text-sm">
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-bold flex items-center gap-1">
                    <User className="h-3 w-3 text-muted-foreground" /> {o.cliente}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                    <MapPin className="h-2.5 w-2.5" /> {o.fazenda} {o.talhao && `• ${o.talhao}`}
                  </span>
                </div>
              </TableCell>
              <TableCell className="text-xs font-medium uppercase text-muted-foreground">{o.consultor || "—"}</TableCell>
              <TableCell className="text-center text-xs">
                {o.data_liberacao ? format(new Date(o.data_liberacao), "dd/MM/yy", { locale: ptBR }) : "—"}
              </TableCell>
              <TableCell className="text-center">
                <div className={`inline-flex flex-col items-center px-2 py-0.5 rounded ${o.dias_em_aberto > 7 ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
                  <span className="text-xs font-black">{o.dias_em_aberto || 0}</span>
                  <span className="text-[8px] font-bold uppercase leading-none">dias</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className={`text-[10px] font-bold uppercase ${o.tipo === 'recomendacao_liberada_sem_os_apos_prazo' ? 'text-red-600' : 'text-orange-600'}`}>
                    {o.tipo === 'recomendacao_liberada_sem_os_apos_prazo' ? 'Prazo Vencido' : 'Em Decisão'}
                  </span>
                  <span className="text-[11px] text-primary italic font-medium truncate max-w-[200px]">
                    {o.proxima_acao || "Aguardando aceite no portal"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-primary" 
                  onClick={() => o.registro_consultor_id && navigate(`/visita-tecnica/${o.registro_consultor_id}`)}
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
