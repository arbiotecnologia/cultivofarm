import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, ChevronRight, Plus, Pencil, Search } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";
import { STATUS_LABEL_REGISTRO } from "@/lib/registroTransitions";
import {
  useVisitasTecnicasLista,
  periodoParaIntervalo,
} from "@/hooks/useVisitasTecnicasLista";

/**
 * Lista técnica mobile de visitas (registros_consultor).
 *
 * Consome exclusivamente `rpc_listar_visitas_tecnicas_v1`: projeção segura,
 * paginação, busca e filtros no servidor. Rótulos vêm de STATUS_LABEL_REGISTRO
 * (fonte única) e a editabilidade vem de `can_edit` retornado pelo backend.
 */

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  finalizado: "bg-blue-100 text-blue-700",
  enviado_aprovacao: "bg-amber-100 text-amber-700",
  aprovado: "bg-emerald-100 text-emerald-700",
  reprovado: "bg-destructive/10 text-destructive",
  convertido_os: "bg-purple-100 text-purple-700",
  arquivado: "bg-muted text-muted-foreground",
};

const PAGE_SIZE = 20;

export default function MobileRegistrosTecnico() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [periodo, setPeriodo] = useState<string>("all");
  const [page, setPage] = useState(1);

  const intervalo = useMemo(() => periodoParaIntervalo(periodo), [periodo]);

  const { data, isLoading, isError, refetch, isFetching } = useVisitasTecnicasLista({
    search: search.trim() || null,
    status: statusFilter === "all" ? null : [statusFilter],
    de: intervalo.de,
    ate: intervalo.ate,
    page,
    pageSize: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const openRoteiro = (id: string) => navigate(`/app/visita/${id}?step=7`);
  const openEdicao = (id: string) => navigate(`/app/visita/${id}`);

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1);
    setter(v);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-foreground">Registros técnicos</h1>
        <Button size="sm" onClick={() => navigate("/app/visita/novo")}>
          <Plus className="h-4 w-4 mr-1" /> Nova visita
        </Button>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por código, produtor, fazenda…"
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={statusFilter} onValueChange={resetPage(setStatusFilter)}>
            <SelectTrigger aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABEL_REGISTRO).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodo} onValueChange={resetPage(setPeriodo)}>
            <SelectTrigger aria-label="Filtrar por período"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo o período</SelectItem>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Últimos 7 dias</SelectItem>
              <SelectItem value="month">Mês atual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-destructive">Não foi possível carregar os registros.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <Card
              key={r.id}
              className="p-3 space-y-1 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
              onClick={() => (r.can_edit ? openEdicao(r.id) : openRoteiro(r.id))}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-foreground">
                    {r.objetivo_visita || r.problema_principal || "Registro de vistoria"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[r.cliente_nome, r.fazenda_nome, r.talhao_nome].filter(Boolean).join(" • ")}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge className={`text-[10px] ${STATUS_COLORS[r.status] || ""}`} variant="secondary">
                    {STATUS_LABEL_REGISTRO[r.status as never] || r.status}
                  </Badge>
                  {r.can_edit ? (
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{r.codigo_visita || "—"}</span>
                <span>{r.data_vistoria ? formatDateDisplay(r.data_vistoria) : "—"}</span>
              </div>
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
            Página {data?.page ?? page} · {total} registro(s)
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
