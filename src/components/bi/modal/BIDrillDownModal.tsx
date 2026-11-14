import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { BIEmptyState } from "../BIEmptyState";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  User, Building2, MapPin, Sprout, Package, FlaskConical,
  ClipboardCheck, FileCheck, AlertTriangle, Timer, Calendar
} from "lucide-react";

export type DrillDownTipo =
  | "consultor"
  | "cliente"
  | "fazenda"
  | "talhao"
  | "produto"
  | "microrganismo";

interface BIDrillDownModalProps {
  open: boolean;
  onClose: () => void;
  tipo: DrillDownTipo;
  id: string;
  nome: string;
  dados: any[];
  origem: "visitas" | "esteira";
}

const tipoConfig: Record<DrillDownTipo, { label: string; icon: any }> = {
  consultor: { label: "Consultor", icon: User },
  cliente: { label: "Cliente", icon: Building2 },
  fazenda: { label: "Fazenda", icon: MapPin },
  talhao: { label: "Talhão", icon: Sprout },
  produto: { label: "Produto", icon: Package },
  microrganismo: { label: "Microrganismo", icon: FlaskConical },
};

function formatStatus(status: string) {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    aberta: "bg-blue-50 text-blue-700",
    agendada: "bg-indigo-50 text-indigo-700",
    atribuida: "bg-purple-50 text-purple-700",
    finalizado: "bg-green-50 text-green-700",
    aprovado: "bg-emerald-50 text-emerald-700",
    reprovado: "bg-red-50 text-red-700",
    convertido_os: "bg-cyan-50 text-cyan-700",
    em_producao: "bg-amber-50 text-amber-700",
    pronto_entrega: "bg-teal-50 text-teal-700",
    entrega_pendente: "bg-orange-50 text-orange-700",
    entregue: "bg-green-50 text-green-700",
    finalizada: "bg-slate-50 text-slate-700",
  };
  const cls = colorMap[status] || "bg-gray-50 text-gray-700";
  return <Badge variant="outline" className={`text-[10px] ${cls}`}>{formatStatus(status)}</Badge>;
}

export function BIDrillDownModal({ open, onClose, tipo, id, nome, dados, origem }: BIDrillDownModalProps) {
  const config = tipoConfig[tipo];
  const Icon = config.icon;

  const visitaFields = [
    { key: "cliente_nome", label: "Cliente" },
    { key: "fazenda_nome", label: "Fazenda" },
    { key: "talhao_nome", label: "Talhão" },
    { key: "consultor_nome", label: "Consultor" },
    { key: "status_solicitacao", label: "Status Solicitação" },
    { key: "status_visita", label: "Status Visita" },
    { key: "data_vistoria", label: "Data Visita", format: (v: string) => v ? format(new Date(v), "dd/MM/yyyy", { locale: ptBR }) : "—" },
    { key: "possui_recomendacao", label: "Recomendação", format: (v: boolean) => v ? "Sim" : "Não" },
    { key: "possui_os", label: "OS", format: (v: boolean) => v ? "Sim" : "Não" },
  ];

  const esteiraFields = [
    { key: "numero_os", label: "OS" },
    { key: "cliente_nome", label: "Cliente" },
    { key: "fazenda_nome", label: "Fazenda" },
    { key: "produto_nome", label: "Produto" },
    { key: "microrganismo_nome", label: "Microrganismo" },
    { key: "status_esteira_oficial", label: "Status" },
    { key: "volume_solicitado_l", label: "Volume (L)" },
    { key: "entrega_confirmada", label: "Entrega", format: (v: boolean) => v ? "Confirmada" : "Pendente" },
    { key: "atrasado", label: "Atraso", format: (v: boolean) => v ? "Sim" : "Não" },
  ];

  const fields = origem === "visitas" ? visitaFields : esteiraFields;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex min-w-0 items-start gap-2 pr-8 text-lg">
            <div className="shrink-0 bg-primary/10 p-1.5 rounded-full">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="min-w-0 flex-1 break-words whitespace-normal">
              {config.label}: <span className="font-bold">{nome}</span>
              <span className="block text-xs text-muted-foreground font-normal">
                ({dados.length} registro{dados.length !== 1 ? "s" : ""})
              </span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto mt-2">
          {dados.length === 0 ? (
            <BIEmptyState mensagem="Nenhum registro encontrado para este filtro." />
          ) : (
            <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50 sticky top-0">
                  <TableRow>
                    {fields.map((f) => (
                      <TableHead key={f.key} className="text-[10px] font-bold uppercase whitespace-nowrap">
                        {f.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.map((row, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20">
                      {fields.map((f) => {
                        const raw = row[f.key];
                        const val = f.format ? f.format(raw) : raw ?? "—";
                        if (f.key === "status_visita" || f.key === "status_esteira_oficial" || f.key === "status_solicitacao") {
                          return (
                            <TableCell key={f.key} className="text-xs">
                              <StatusBadge status={String(raw ?? "")} />
                            </TableCell>
                          );
                        }
                        if (f.key === "possui_recomendacao" || f.key === "possui_os" || f.key === "entrega_confirmada" || f.key === "atrasado") {
                          const isPositive = !!raw;
                          return (
                            <TableCell key={f.key} className="text-xs">
                              <span className={isPositive ? "text-green-700 font-bold" : "text-muted-foreground"}>{val}</span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={f.key} className="text-xs whitespace-nowrap">
                            {val}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
