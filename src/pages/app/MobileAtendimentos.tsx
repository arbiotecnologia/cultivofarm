import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Search,
  Plus,
  ChevronRight,
  Pencil,
  Inbox,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCivilDateDisplay, formatDateDisplay } from "@/lib/date-utils";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import {
  useAtendimentosTecnicos,
  useAtendimentosResumo,
  ABAS_ATENDIMENTO,
  ORIGEM_LABEL,
  type AtendimentoAba,
  type AtendimentoItem,
} from "@/hooks/useAtendimentosTecnicos";
import { useFluxoVisitaTecnica } from "@/hooks/useFluxoVisitaTecnica";

/**
 * Workspace único de atendimento técnico (consultor técnico e técnico agrônomo).
 *
 * Consolida demandas do produtor, ocorrências de campo e visitas técnicas em
 * uma única tela, consumindo exclusivamente `rpc_listar_atendimentos_tecnicos_v1`.
 * Nenhuma decisão de visibilidade ou editabilidade é feita no cliente.
 */

const PAGE_SIZE = 20;

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  em_andamento: "bg-blue-100 text-blue-700",
  finalizado: "bg-blue-100 text-blue-700",
  enviado_aprovacao: "bg-amber-100 text-amber-700",
  ajuste_solicitado: "bg-amber-100 text-amber-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  reprovado: "bg-destructive/10 text-destructive",
  convertido_os: "bg-purple-100 text-purple-700",
  arquivado: "bg-muted text-muted-foreground",
};

const URGENCIA_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

const URGENCIA_COLORS: Record<string, string> = {
  baixa: "bg-emerald-100 text-emerald-700",
  media: "bg-amber-100 text-amber-700",
  alta: "bg-orange-100 text-orange-700",
  critica: "bg-destructive/10 text-destructive",
};


function statusLabel(item: AtendimentoItem) {
  if (item.kind === "demanda") return "Demanda";
  return (STATUS_LABEL_REGISTRO as Record<string, string>)[item.status] ?? item.status;
}

export default function MobileAtendimentos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [startingId, setStartingId] = useState<string | null>(null);
  const { iniciarVisita } = useFluxoVisitaTecnica();

  const aba = (params.get("aba") as AtendimentoAba) || "todos";

  const { data: resumo } = useAtendimentosResumo();
  const { data, isLoading, isError, refetch, isFetching } = useAtendimentosTecnicos({
    aba,
    search: search || null,
    page,
    pageSize: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const contadores = useMemo<Record<AtendimentoAba, number | null>>(
    () => ({
      todos: resumo?.todos ?? null,
      demandas: resumo?.demandas ?? null,
      ocorrencias: resumo?.ocorrencias ?? null,
      andamento: resumo?.em_andamento ?? null,
      aguardando: resumo?.aguardando ?? null,
      monitoramento: resumo?.monitoramento ?? null,
      concluidos: resumo?.concluidos ?? null,
    }),
    [resumo],
  );


  const trocarAba = (value: AtendimentoAba) => {
    setPage(1);
    const next = new URLSearchParams(params);
    next.set("aba", value);
    setParams(next, { replace: true });
  };

  const abrir = async (item: AtendimentoItem) => {
    if (item.kind === "visita") {
      navigate(item.next_route);
      return;
    }
    // Demanda: inicia o atendimento pela RPC transacional e navega ao wizard.
    setStartingId(item.id);
    try {
      const id = await iniciarVisita(item.id);
      if (id) toast.success("Atendimento iniciado");
      await refetch();
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Atendimentos</h1>
          <p className="text-xs text-muted-foreground">
            Demandas, ocorrências e visitas técnicas em um só lugar
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("/app/registrar")}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por código, produtor, fazenda…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-2 pb-2">
          {ABAS_ATENDIMENTO.map((t) => (
            <button
              key={t.value}
              onClick={() => trocarAba(t.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                aba === t.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {t.label}
              {contadores[t.value] != null && (
                <span className="ml-1 opacity-80">({contadores[t.value]})</span>
              )}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-destructive">Não foi possível carregar os atendimentos.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Inbox className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum atendimento nesta aba</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card
              key={`${item.kind}-${item.id}`}
              className="p-3 space-y-1 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onClick={() => abrir(item)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground truncate">
                    {item.titulo || "Atendimento técnico"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[item.cliente_nome, item.fazenda_nome, item.talhao_nome]
                      .filter(Boolean)
                      .join(" • ") || "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge
                    className={cn("text-[10px]", STATUS_COLORS[item.status] || "")}
                    variant="secondary"
                  >
                    {statusLabel(item)}
                  </Badge>
                  {startingId === item.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : item.kind === "demanda" ? (
                    <PlayCircle className="h-4 w-4 text-primary" />
                  ) : item.can_edit ? (
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                {item.cultura_nome && (
                  <span className="rounded bg-muted px-1.5 py-0.5">{item.cultura_nome}</span>
                )}
                {item.urgencia && (
                  <span className={cn("rounded px-1.5 py-0.5", URGENCIA_COLORS[item.urgencia] ?? "bg-muted")}>
                    {URGENCIA_LABEL[item.urgencia] ?? item.urgencia}
                  </span>
                )}
                {item.responsavel_nome && <span className="truncate">👤 {item.responsavel_nome}</span>}
                {item.data_prevista && (
                  <span>SLA {item.kind === "visita" ? formatCivilDateDisplay(item.data_prevista) : formatDateDisplay(item.data_prevista)}</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate">
                  {item.codigo || "—"}
                  {item.origem ? ` · ${ORIGEM_LABEL[item.origem] ?? item.origem}` : ""}
                </span>
                <span className="shrink-0">
                  {item.data_ref ? (item.kind === "visita" ? formatCivilDateDisplay(item.data_ref) : formatDateDisplay(item.data_ref)) : "—"}
                </span>
              </div>
              {item.proxima_acao && (
                <p className="text-[11px] font-medium text-primary truncate">
                  Próxima ação: {item.proxima_acao}
                </p>
              )}

            </Card>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Página {data?.page ?? page} · {total} item(ns)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!data?.has_more || isFetching}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
