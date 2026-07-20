import { BILaboratorioKPIs } from "./BILaboratorioKPIs";
import { BIQualidadeCQ } from "./BIQualidadeCQ";
import { BITemposEsteira } from "./BITemposEsteira";
import { BITabelaOSCriticas } from "./BITabelaOSCriticas";
import { BIGargalosTable } from "../BIGargalosTable";
import { BIEmptyState } from "../BIEmptyState";
import { 
  FlaskConical, 
  Beaker, 
  Timer, 
  AlertTriangle, 
  LayoutGrid, 
  Users, 
  Filter,
  BarChart3,
  Box
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { BIStatusBadge } from "../BIStatusBadge";

interface BILaboratorioResumoProps {
  indicadores: any;
  indicadoresQualidade: any;
  indicadoresTempo: any;
  laboratorioPorStatus: any[];
  laboratorioPorProduto: any[];
  laboratorioPorCliente: any[];
  osCriticas: any[];
  gargalosLaboratorio: any[];
  loading?: boolean;
  onProdutoClick?: (nome: string) => void;
  onClienteClick?: (nome: string) => void;
}

export function BILaboratorioResumo({ 
  indicadores, 
  indicadoresQualidade, 
  indicadoresTempo,
  laboratorioPorStatus,
  laboratorioPorProduto,
  laboratorioPorCliente,
  osCriticas,
  gargalosLaboratorio,
  loading,
  onProdutoClick,
  onClienteClick
}: BILaboratorioResumoProps) {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Status Operacional da Esteira
        </h3>
        <BILaboratorioKPIs indicadores={indicadores} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            Qualidade e Lotes (CQ)
          </h3>
          <BIQualidadeCQ indicadores={indicadoresQualidade} loading={loading} />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            Eficiência e Tempos Médios
          </h3>
          <BITemposEsteira tempos={indicadoresTempo} loading={loading} />
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Ordens de Serviço Críticas
        </h3>
        <BITabelaOSCriticas dados={osCriticas} loading={loading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Box className="h-5 w-5 text-primary" />
            Produção por Produto / Microrganismo
          </h3>
          <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">OS</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Vol. Solicitado (L)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Vol. Sol. Aprovado (L)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">CQ Aprov</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {laboratorioPorProduto.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={5}><BIEmptyState /></TableCell></TableRow>
                )}
                {laboratorioPorProduto.slice(0, 8).map((p) => (
                  <TableRow key={p.nome} className="hover:bg-muted/10 text-sm cursor-pointer" onClick={() => onProdutoClick?.(p.nome)}>
                    <TableCell className="font-bold">{p.nome}</TableCell>
                    <TableCell className="text-center font-medium">{p.osCount}</TableCell>
                    <TableCell className="text-center font-black text-slate-600">{p.volumeSolicitado.toLocaleString()}</TableCell>
                    <TableCell className="text-center font-black text-primary">{p.volumeSolicitadoAprovado.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-bold border border-green-100">
                        {p.cqAprovado}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Demanda por Produtor
          </h3>
          <div className="rounded-md border bg-white overflow-hidden overflow-x-auto shadow-sm">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase">Produtor</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">OS Total</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Entregues</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Gargalos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {laboratorioPorCliente.length === 0 && !loading && (
                  <TableRow><TableCell colSpan={4}><BIEmptyState /></TableCell></TableRow>
                )}
                {laboratorioPorCliente.slice(0, 8).map((c) => (
                  <TableRow key={c.nome} className="hover:bg-muted/10 text-sm cursor-pointer" onClick={() => onClienteClick?.(c.nome)}>
                    <TableCell className="font-bold">{c.nome}</TableCell>
                    <TableCell className="text-center">{c.osTotal}</TableCell>
                    <TableCell className="text-center font-bold text-emerald-600">{c.osEntregue}</TableCell>
                    <TableCell className="text-center text-red-600 font-bold">{c.gargalos > 0 ? c.gargalos : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
