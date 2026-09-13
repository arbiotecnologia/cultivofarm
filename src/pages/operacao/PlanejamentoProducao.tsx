import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProductionPlanning } from "@/hooks/useProductionPlanning";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateDisplay as fmtDate } from "@/lib/date-utils";
import { Eye, Factory, RefreshCw, AlertTriangle, Search } from "lucide-react";
import { useB2BSlaConfigMap } from "@/hooks/useB2BSlaConfig";
import { computeSlaBadge } from "@/lib/b2bSla";
import { FaseSlaBadge } from "@/components/comercial/FaseSlaBadge";
import {
  deduplicarPlanejamentos,
  ehNovo,
  estaAtrasado,
  filtrarPorBusca,
  formatValorOuTraco,
  hojeSaoPaulo,
  mensagemErro,
  ordenarFila,
  resumirKpis,
  rotuloStatus,
  varianteStatus,
} from "@/lib/planejamento-producao/planejamento";

export default function PlanejamentoProducao() {
  const [status, setStatus] = useState<string>("all");
  const [busca, setBusca] = useState("");
  const { data, isLoading, isError, error, refetch, isFetching } = useProductionPlanning(status);
  const { map: slaConfig } = useB2BSlaConfigMap();
  const navigate = useNavigate();

  const hoje = hojeSaoPaulo();

  const { linhas, duplicadasIgnoradas } = useMemo(
    () => deduplicarPlanejamentos(data ?? []),
    [data],
  );
  const kpis = useMemo(() => resumirKpis(linhas, hoje), [linhas, hoje]);
  const visiveis = useMemo(
    () => ordenarFila(filtrarPorBusca(linhas, busca), hoje),
    [linhas, busca, hoje],
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6" aria-hidden="true" /> Planejamento de Produção
          </h1>
          <p className="text-sm text-muted-foreground">Pedidos B2B aprovados aguardando ou em produção</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pedido ou parceiro"
              aria-label="Buscar por número do pedido ou parceiro"
              className="pl-8 w-full sm:w-64"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="aguardando_planejamento">Aguardando</SelectItem>
              <SelectItem value="planejado">Planejado</SelectItem>
              <SelectItem value="em_producao">Em produção</SelectItem>
              <SelectItem value="produzido">Produzido</SelectItem>
              <SelectItem value="entregue">Entregue</SelectItem>
              <SelectItem value="replanejar">Replanejar</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Atualizar lista"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Aguardando", value: kpis.aguardando, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
          { label: "Em produção", value: kpis.em_producao, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
          { label: "Produzido", value: kpis.produzido, tone: "bg-violet-500/10 text-violet-700 dark:text-violet-400" },
          { label: "Entregue", value: kpis.entregue, tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
          { label: "Atrasados", value: kpis.atrasados, tone: "bg-red-500/10 text-red-700 dark:text-red-400" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className={`text-2xl font-bold rounded px-1 inline-block ${k.tone}`}>
                {isLoading || isError ? "—" : k.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Pedidos B2B em planejamento</CardTitle>
          {!isLoading && !isError && (
            <span className="text-xs text-muted-foreground">
              {visiveis.length} de {kpis.total}
              {duplicadasIgnoradas > 0 ? ` · ${duplicadasIgnoradas} duplicada(s) ignorada(s)` : ""}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground" role="status">Carregando…</p>
          ) : isError ? (
            <div className="flex flex-col items-start gap-2 py-4" role="alert">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {mensagemErro(error, "Não foi possível carregar o planejamento de produção.")}
              </p>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                Tentar novamente
              </Button>
            </div>
          ) : kpis.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum planejamento encontrado.</p>
          ) : visiveis.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido corresponde à busca.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pedido</TableHead>
                    <TableHead>Parceiro</TableHead>
                    <TableHead>Aprovação</TableHead>
                    <TableHead>Data desejada</TableHead>
                    <TableHead>Previsão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead><span className="sr-only">Ações</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visiveis.map((p) => {
                    const slaInfo = computeSlaBadge(p.status, p.updated_at, slaConfig);
                    const atrasado = estaAtrasado(p, hoje);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {p.order_numero ?? "—"}
                            {ehNovo(p) && (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30" variant="outline">
                                Novo
                              </Badge>
                            )}
                            {atrasado && <Badge variant="destructive" className="text-[10px]">Atrasado</Badge>}
                            <FaseSlaBadge info={slaInfo} />
                          </div>
                        </TableCell>
                        <TableCell>{p.partner_nome ?? "—"}</TableCell>
                        <TableCell>{p.order_approved_at ? fmtDate(p.order_approved_at) : "—"}</TableCell>
                        <TableCell>{p.order_requested_date ? fmtDate(p.order_requested_date) : "—"}</TableCell>
                        <TableCell>{p.order_estimated_date ? fmtDate(p.order_estimated_date) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant={varianteStatus(p.status)}>{rotuloStatus(p.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatValorOuTraco(p.order_total)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/operacao/planejamento/${p.id}`)}
                            aria-label={`Abrir planejamento do pedido ${p.order_numero ?? ""}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
