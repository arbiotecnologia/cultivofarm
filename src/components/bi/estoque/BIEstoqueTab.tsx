import { useMemo } from "react";
import { BICardKPI } from "../BICardKPI";
import { BIEstoqueChart } from "./BIEstoqueChart";
import { BIMovimentacoesChart } from "./BIMovimentacoesChart";
import { BIGargalosTable } from "../BIGargalosTable";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { BIEmptyState } from "../BIEmptyState";
import { Warehouse, Package, ArrowRightLeft, AlertTriangle, TrendingUp } from "lucide-react";

interface EstoqueItem {
  nome: string;
  volumeEstoque: number;
  volumeSolicitadoEntregue: number;
  osVinculadas: number;
  entregasPendentes: number;
}

interface MovimentacaoItem {
  acao?: string;
  quantidade?: number;
  observacao?: string;
  created_at: string;
  [key: string]: any;
}

interface BIEstoqueTabProps {
  indicadoresEstoque: {
    volumeEmEstoqueReal: number | null;
    volumeSolicitado: number;
    volumeSolicitadoEntregue: number | null;
  };
  estoquePorProduto: EstoqueItem[];
  rawMovimentacoes: MovimentacaoItem[];
  loading?: boolean;
  onRowClick?: (item: EstoqueItem) => void;
}

export function BIEstoqueTab({
  indicadoresEstoque,
  estoquePorProduto,
  rawMovimentacoes,
  loading,
  onRowClick,
}: BIEstoqueTabProps) {
  const totalMovimentacoes = useMemo(() => rawMovimentacoes.length, [rawMovimentacoes]);
  const entradas = useMemo(
    () => rawMovimentacoes.filter((m) => m.acao === "entrada").length,
    [rawMovimentacoes]
  );
  const saidas = useMemo(
    () => rawMovimentacoes.filter((m) => m.acao === "saida").length,
    [rawMovimentacoes]
  );
  const ajustes = useMemo(
    () => rawMovimentacoes.filter((m) => m.acao === "ajuste").length,
    [rawMovimentacoes]
  );

  const produtosCriticos = useMemo(
    () =>
      estoquePorProduto
        .filter((p) => p.entregasPendentes > 0)
        .sort((a, b) => b.entregasPendentes - a.entregasPendentes)
        .slice(0, 5),
    [estoquePorProduto]
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <BICardKPI
          titulo="Volume em Estoque"
          valor={indicadoresEstoque.volumeEmEstoqueReal}
          sufixo="L"
          loading={loading}
          icone={Warehouse}
          descricao="Volume total auditado em estoque"
        />
        <BICardKPI
          titulo="Volume Solicitado"
          valor={indicadoresEstoque.volumeSolicitado}
          sufixo="L"
          loading={loading}
          icone={Package}
          descricao="Soma de todas as OS no período"
        />
        <BICardKPI
          titulo="Solicitado Entregue"
          valor={indicadoresEstoque.volumeSolicitadoEntregue}
          sufixo="L"
          loading={loading}
          icone={TrendingUp}
          descricao="Volume previsto confirmado no campo"
        />
        <BICardKPI
          titulo="Movimentações"
          valor={totalMovimentacoes}
          loading={loading}
          icone={ArrowRightLeft}
          descricao={`${entradas} entradas, ${saidas} saídas, ${ajustes} ajustes`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            Estoque por Produto vs Demanda
          </h3>
          <BIEstoqueChart dados={estoquePorProduto} loading={loading} />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Movimentações de Estoque
          </h3>
          <BIMovimentacoesChart dados={rawMovimentacoes} loading={loading} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Detalhe por Produto / Microrganismo
          </h3>
          <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Estoque (L)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-right">Entregue (L)</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">OS</TableHead>
                  <TableHead className="text-xs font-bold uppercase text-center">Pendentes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estoquePorProduto.map((p) => (
                  <TableRow
                    key={p.nome}
                    className="hover:bg-muted/20 cursor-pointer"
                    onClick={() => onRowClick?.(p)}
                  >
                    <TableCell className="font-medium text-sm">{p.nome}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.volumeEstoque.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.volumeSolicitadoEntregue.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm">{p.osVinculadas}</TableCell>
                    <TableCell className="text-center">
                      {p.entregasPendentes > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          {p.entregasPendentes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {estoquePorProduto.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <BIEmptyState mensagem="Nenhum produto em estoque." />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-black text-foreground uppercase tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Produtos com Entregas Pendentes
          </h3>
          {produtosCriticos.length > 0 ? (
            <div className="rounded-md border bg-white overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="text-xs font-bold uppercase">Produto</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-right">Pendentes</TableHead>
                    <TableHead className="text-xs font-bold uppercase text-right">Estoque (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosCriticos.map((p) => (
                    <TableRow key={p.nome} className="hover:bg-muted/20">
                      <TableCell className="font-medium text-sm">{p.nome}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-1.5 py-0.5 rounded-full text-xs font-bold">
                          {p.entregasPendentes}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {p.volumeEstoque.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <BIEmptyState mensagem="Nenhum produto com entregas pendentes." />
          )}
        </div>
      </div>
    </div>
  );
}
