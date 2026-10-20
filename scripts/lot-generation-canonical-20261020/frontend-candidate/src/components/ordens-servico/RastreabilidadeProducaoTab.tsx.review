import { supabase } from "@/integrations/supabase/client";
import { COCKPIT_LIST_RPC, useCockpitQuery } from "@/hooks/useCockpitQuery";
import { cockpitReaderStatus } from "@/lib/cockpit/readerStatus";
import { formatDateDisplay } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";

interface Props {
  osId: string;
  osTipo: string;
  numeroOS?: string | null;
  /** Bumped by the parent after a confirmed canonical write. */
  refreshKey?: number;
  /** Reports the current authorized reader row (or null while unavailable/pending/error). Never authorizes. */
  onItem?: (item: TraceItem | null) => void;
}

export interface TraceItem {
  lote_id?: string | null;
  programacao_id?: string | null;
  os_id: string; origem_os: string; numero_os?: string | null; status_os?: string | null;
  status_esteira_oficial?: string | null; data_programada?: string | null; codigo_lote?: string | null;
  volume_solicitado_l?: number | null; responsavel_nome?: string | null;
}

const label = (value?: string | null) => value ? value.replace(/_/g, " ") : "Não informado";

/**
 * Reuses only the canonical Cockpit list RPC (tenant/epoch-scoped cache and
 * late-response fences). Direct view/table reads stay closed; it never
 * authorizes an operation nor claims full traceability.
 */
export function RastreabilidadeProducaoTab({ osId, osTipo, numeroOS, refreshKey = 0, onItem }: Props) {
  const origem = osTipo === "onfarm" ? "onfarm" : osTipo === "manual" ? "manual" : null;
  const busca = typeof numeroOS === "string" ? numeroOS.trim() : "";
  const filters = { p_busca: busca, p_stages: null, p_origens: origem ? [origem] : null, p_prioridades: null, p_incluir_finalizadas: true, p_limit: 200, p_offset: 0 };
  const query = useCockpitQuery<TraceItem | null>({
    queryKey: ["cockpit-laboratorio", COCKPIT_LIST_RPC, filters, "os-trace", osId, refreshKey],
    reader: "listRPC",
    enabled: !!osId && !!origem && !!busca,
    refetchInterval: false,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc(COCKPIT_LIST_RPC as never, filters as never).abortSignal(signal);
      if (error) throw error;
      const result = data as unknown as { items?: unknown } | null;
      if (!result || !Array.isArray(result.items)) throw new Error("cockpit_list_invalid_response");
      const matches = (result.items as TraceItem[]).filter((item) => item?.os_id === osId && item?.origem_os === origem);
      if (matches.length > 1) throw new Error("cockpit_trace_ambiguous");
      return matches[0] ?? null;
    },
  });

  const reported = query.available && !query.isPending && !query.isFetching && !query.isError ? query.data ?? null : null;
  useEffect(() => { onItem?.(reported); }, [onItem, reported]);
  useEffect(() => () => onItem?.(null), [onItem]);

  if (!origem || !busca) return <p role="status">Consulta de rastreabilidade indisponível para esta OS.</p>;
  if (!query.available) return <p role="status">Consulta de rastreabilidade indisponível para o contexto atual.</p>;
  if (query.isPending) return <div className="space-y-4">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (query.isError) return <div role="alert" className="space-y-3"><p>Não foi possível consultar o estado desta OS agora.</p><Button onClick={() => void query.refetch()}>Tentar novamente</Button></div>;
  const item = query.data;
  if (!item) return <p role="status">OS não localizada na consulta autorizada.</p>;
  const status = cockpitReaderStatus(item.status_os, item.status_esteira_oficial);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Status da OS</dt><dd className="font-semibold">{label(item.status_os)}</dd></div>
        <div><dt className="text-muted-foreground">Etapa da esteira</dt><dd className="font-semibold">{label(status)}</dd></div>
        <div><dt className="text-muted-foreground">Data programada</dt><dd>{item.data_programada ? formatDateDisplay(item.data_programada) : "Não informado"}</dd></div>
        <div><dt className="text-muted-foreground">Lote</dt><dd>{item.codigo_lote || "Não informado"}</dd></div>
        <div><dt className="text-muted-foreground">Volume</dt><dd>{typeof item.volume_solicitado_l === "number" && Number.isFinite(item.volume_solicitado_l) ? `${item.volume_solicitado_l.toLocaleString("pt-BR")} L` : "Não informado"}</dd></div>
        <div><dt className="text-muted-foreground">Responsável</dt><dd>{item.responsavel_nome || "Não informado"}</dd></div>
      </dl>
      <p role="note" className="text-sm text-muted-foreground border-l-4 border-primary pl-3">
        Detalhes de lote, controle de qualidade, envase, estoque, entrega, aplicação e histórico de eventos não estão disponíveis nesta consulta.
      </p>
    </div>
  );
}
