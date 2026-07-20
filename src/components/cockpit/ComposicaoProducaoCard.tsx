import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useProductProfile } from "@/hooks/useProductProfile";
import { useDisponibilidadeOS } from "@/hooks/useDisponibilidadeOS";
import {
  TOLERANCIA_MIN_L,
  calcular,
  classify,
  buildBucketPorLinha,
  agregarGlobal,
  emptyBucket,
  type LinhaCalc,
  type LinhaComStatus,
  type LineStatus,
} from "./composicaoCalc";

interface Props {
  osId: string;
  produtoId?: string | null;
  microrganismoFallback?: { id: string; nome: string } | null;
  volumeTotalL: number;
}

const fmtL = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtML = (v: number) => Math.round(v).toLocaleString("pt-BR");
const fmtPct = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });

function StatusBadge({ status, deltaL }: { status: LineStatus; deltaL: number }) {
  const abs = Math.abs(deltaL);
  switch (status) {
    case "ok":
      return (
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3" /> OK
        </Badge>
      );
    case "falta":
      return (
        <Badge variant="destructive" className="gap-1 text-[10px] font-mono">
          <ArrowDown className="h-3 w-3" /> FALTA {fmtL(abs)} L
        </Badge>
      );
    case "excedente":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] font-mono border-amber-500 text-amber-700">
          <ArrowUp className="h-3 w-3" /> EXCED. {fmtL(abs)} L
        </Badge>
      );
    case "sem_estoque":
      return (
        <Badge variant="destructive" className="gap-1 text-[10px]">
          <AlertTriangle className="h-3 w-3" /> SEM ESTOQUE LIVRE
        </Badge>
      );
    case "aguardando_envase":
      return (
        <Badge variant="outline" className="gap-1 text-[10px]">
          AGUARDANDO ENVASE
        </Badge>
      );
    case "sem_producao":
      return (
        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
          SEM PRODUÇÃO
        </Badge>
      );
  }
}


export function ComposicaoProducaoCard({ osId, produtoId, microrganismoFallback, volumeTotalL }: Props) {
  const [open, setOpen] = useState(false);
  const { data: productData, isLoading } = useProductProfile(produtoId ?? null);
  const { data: disp } = useDisponibilidadeOS(osId);
  const composicao = productData?.composicao ?? [];

  const linhasBase = useMemo<LinhaCalc[]>(() => {
    if (!produtoId && microrganismoFallback) {
      return [
        {
          key: microrganismoFallback.id,
          microId: microrganismoFallback.id,
          nome: microrganismoFallback.nome,
          tipo: "microrganismo",
          pct: 100,
          volumeL: volumeTotalL,
          volumeML: volumeTotalL * 1000,
        },
      ];
    }
    return calcular(composicao, volumeTotalL);
  }, [composicao, volumeTotalL, produtoId, microrganismoFallback]);

  const linhas = useMemo<LinhaComStatus[]>(() => {
    if (!disp)
      return linhasBase.map((l) => ({
        ...l,
        bucket: emptyBucket(),
        status: "sem_producao" as const,
        deltaL: -l.volumeL,
        motivo: "carregando…",
      }));

    const buckets = buildBucketPorLinha(linhasBase, disp);
    return linhasBase.map((l, i) => {
      const bucket = buckets[i];
      const { status, deltaL, motivo } = classify(l.volumeL, bucket, disp.temLote);
      return { ...l, bucket, status, deltaL, motivo };
    });
  }, [linhasBase, disp]);


  if (!produtoId && !microrganismoFallback) return null;

  if (isLoading && produtoId) {
    return (
      <div className="rounded-md border bg-background/60 p-2.5 mt-2 text-xs text-muted-foreground">
        Carregando composição…
      </div>
    );
  }

  if (linhasBase.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-background/60 p-2.5 mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
        Composição pendente — cadastre as formulações em Protocolos.
      </div>
    );
  }

  const microsCount = linhas.filter((l) => l.tipo === "microrganismo").length;
  const somaPct = linhas.reduce((s, l) => s + l.pct, 0);
  const desbalanceado = produtoId ? Math.abs(somaPct - 100) > 0.5 : false;

  const { globalStatus, totalPlan, totalEnv, totalRes, totalDisp, totalDelta, countAguard } =
    agregarGlobal(linhas, !!disp?.temLote);


  const globalBadge = (() => {
    switch (globalStatus) {
      case "ok":
        return <Badge variant="secondary" className="gap-1 text-[10px]"><CheckCircle2 className="h-3 w-3" /> OK</Badge>;
      case "falta":
        return <Badge variant="destructive" className="gap-1 text-[10px]"><ArrowDown className="h-3 w-3" /> FALTA</Badge>;
      case "excedente":
        return <Badge variant="outline" className="gap-1 text-[10px] border-amber-500 text-amber-700"><ArrowUp className="h-3 w-3" /> EXCEDENTE</Badge>;
      case "aguardando":
        return <Badge variant="outline" className="gap-1 text-[10px]">AGUARDANDO</Badge>;
      case "sem_producao":
        return <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">SEM PRODUÇÃO</Badge>;
    }
  })();

  // Motivo global em linguagem natural (mostrado quando status != ok)
  const motivoGlobal: string | null = (() => {
    if (globalStatus === "ok") return null;
    if (globalStatus === "sem_producao")
      return "Sem produção — nenhum lote vinculado a esta OS.";
    const lotesTxt = disp && disp.lotes.length > 0
      ? ` · ${disp.lotes.length} lote${disp.lotes.length > 1 ? "s" : ""} vinculado${disp.lotes.length > 1 ? "s" : ""}${disp.lotes[0]?.codigo_lote ? ` (${disp.lotes[0].codigo_lote}${disp.lotes.length > 1 ? "…" : ""})` : ""}`
      : "";
    if (globalStatus === "aguardando")
      return `Aguardando envase de ${countAguard} componente${countAguard !== 1 ? "s" : ""} — lote produzido mas sem envase registrado${lotesTxt}.`;
    if (globalStatus === "falta") {
      const pior = [...linhas]
        .filter((l) => l.status === "falta" || l.status === "sem_estoque")
        .sort((a, b) => a.deltaL - b.deltaL)[0];
      if (pior)
        return `Faltam ${fmtL(Math.abs(pior.deltaL))} L para ${pior.nome}${lotesTxt}.`;
      return `Estoque livre insuficiente${lotesTxt}.`;
    }
    if (globalStatus === "excedente") {
      return `Excedente de ${fmtL(totalDelta)} L acima do planejado${lotesTxt}.`;
    }
    return null;
  })();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="rounded-md border bg-background/60 mt-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex flex-wrap items-center gap-x-2 gap-y-1 p-2.5 hover:bg-muted/40 transition-colors rounded-md"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">
            Composição do lote
          </span>
          <Badge variant="outline" className="text-[10px] font-mono">
            {microsCount} micro{microsCount !== 1 ? "s" : ""}
            {linhas.length > microsCount ? ` + ${linhas.length - microsCount} insumo(s)` : ""}
          </Badge>
          <span className="text-[10px] font-mono-data text-muted-foreground hidden sm:inline">
            envasado <span className="text-foreground font-semibold">{fmtL(totalEnv)} L</span>
            <span className="mx-1">·</span>
            disponível <span className="text-foreground font-semibold">{fmtL(totalDisp)} L</span>
            <span className="mx-1">·</span>
            Δ <span className={`font-semibold ${totalDelta < -TOLERANCIA_MIN_L ? "text-destructive" : totalDelta > TOLERANCIA_MIN_L ? "text-amber-700" : "text-foreground"}`}>
              {totalDelta >= 0 ? "+" : ""}{fmtL(totalDelta)} L
            </span>
          </span>
          <span className="ml-auto">{globalBadge}</span>
        </button>

        {motivoGlobal && (
          <div className={`px-2.5 pb-2 -mt-1 text-[11px] flex items-start gap-1.5 ${
            globalStatus === "falta" || globalStatus === "sem_producao"
              ? "text-destructive"
              : globalStatus === "excedente"
                ? "text-amber-700"
                : "text-muted-foreground"
          }`}>
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{motivoGlobal}</span>
          </div>
        )}

        {open && (
          <div className="border-t px-2.5 pt-2 pb-2.5">
            {disp?.temLoteConsolidado && (
              <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1">
                <Info className="h-3 w-3" />
                Lote consolidado — distribuição por microrganismo é proporcional à fórmula.
              </div>
            )}
            <table className="w-full text-xs">
              <caption className="sr-only">Composição e disponibilidade do lote</caption>
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="text-left font-semibold pb-1">Componente</th>
                  <th className="text-right font-semibold pb-1 px-1">%</th>
                  <th className="text-right font-semibold pb-1 px-1">Planejado</th>
                  <th className="text-right font-semibold pb-1 px-1">Disponível</th>
                  <th className="text-right font-semibold pb-1 px-1">Status</th>
                  <th className="text-left font-semibold pb-1 pl-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.key} className="border-t align-top">
                    <td className="py-1.5 pr-2">
                      <div className="font-medium leading-tight">{l.nome}</div>
                      {l.cientifico && (
                        <div className="text-[10px] italic text-muted-foreground leading-tight">{l.cientifico}</div>
                      )}
                      {l.tipo === "insumo" && (
                        <div className="text-[10px] text-muted-foreground">Insumo / matéria-prima</div>
                      )}
                    </td>
                    <td className="py-1.5 px-1 text-right font-mono-data text-muted-foreground w-12">
                      {fmtPct(l.pct)}%
                    </td>
                    <td className="py-1.5 px-1 text-right font-mono-data w-24">
                      <div className="font-semibold">{fmtL(l.volumeL)} L</div>
                    </td>
                    <td className="py-1.5 px-1 text-right font-mono-data w-24">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">
                            <div className="font-semibold">{fmtL(l.bucket.disponivelL)} L</div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-[11px]">
                          <div className="space-y-0.5 font-mono-data">
                            <div>Envasado: {fmtL(l.bucket.envasadoL)} L</div>
                            <div>Reservado: {fmtL(l.bucket.reservadoL)} L</div>
                            <div>Vencido/expedido: {fmtL(l.bucket.vencidoL)} L</div>
                            <div className="border-t pt-0.5 font-semibold">
                              Disponível: {fmtL(l.bucket.disponivelL)} L
                            </div>
                            <div className="text-muted-foreground">Δ vs planejado: {l.deltaL >= 0 ? "+" : ""}{fmtL(l.deltaL)} L</div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="py-1.5 px-1 text-right">
                      <StatusBadge status={l.status} deltaL={l.deltaL} />
                    </td>
                    <td className="py-1.5 pl-2 text-[10px] text-muted-foreground font-mono-data leading-tight">
                      {l.motivo}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t">
                  <td colSpan={2} className="pt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Total
                  </td>
                  <td className="pt-1.5 text-right font-mono-data text-[11px] font-semibold">{fmtL(totalPlan)} L</td>
                  <td className="pt-1.5 text-right font-mono-data text-[11px] font-semibold">{fmtL(totalDisp)} L</td>
                  <td className="pt-1.5 text-right font-mono-data text-[10px] text-muted-foreground">
                    Δ {totalDelta >= 0 ? "+" : ""}{fmtL(totalDelta)} L
                  </td>
                  <td className="pt-1.5 pl-2 text-[10px] text-muted-foreground font-mono-data">
                    envasado {fmtL(totalEnv)} L · reservado {fmtL(totalRes)} L
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Lotes vinculados */}
            <div className="mt-2 text-[10px] text-muted-foreground">
              {disp?.temLote && disp.lotes.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="uppercase tracking-wider font-semibold">Lotes:</span>
                  {disp.lotes.map((lt) => (
                    <Tooltip key={lt.id}>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="font-mono text-[10px] gap-1 cursor-help">
                          {lt.codigo_lote ?? lt.id.slice(0, 8)}
                          <span className="text-muted-foreground">
                            · {fmtL(Number(lt.volume_produzido) || 0)} L
                          </span>
                          {lt.status && (
                            <span className="text-muted-foreground">· {lt.status}</span>
                          )}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-[11px] font-mono-data">
                        <div>Envasado: {fmtL(disp.porLote[lt.id]?.envasadoL ?? 0)} L</div>
                        <div>Reservado: {fmtL(disp.porLote[lt.id]?.reservadoL ?? 0)} L</div>
                        <div>Disponível: {fmtL(disp.porLote[lt.id]?.disponivelL ?? 0)} L</div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Info className="h-3 w-3" />
                  Nenhum lote vinculado — produção ainda não iniciada.
                </div>
              )}
            </div>

            {desbalanceado && (
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                Fórmula soma {fmtPct(somaPct)}% — revise as proporções em Protocolos.
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
