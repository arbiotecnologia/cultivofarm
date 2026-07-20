import { formatDateDisplay } from "@/lib/date-utils";
import type { CondutaState } from "@/lib/condutaSerializer";
import { Badge } from "@/components/ui/badge";

const PRIO_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  baixa: "secondary",
  media: "outline",
  alta: "default",
  critica: "destructive",
};

const RETORNO_LABEL: Record<string, string> = {
  sim: "Necessita retorno",
  nao: "Sem necessidade de retorno",
  avaliar_depois: "Reavaliar depois",
};

export function RoteiroCondutaBlock({ conduta }: { conduta: CondutaState }) {
  const rows: Array<{ label: string; value?: string | null }> = [
    { label: "Ação realizada em campo", value: conduta.acaoRealizada },
    { label: "Orientação ao cliente", value: conduta.orientacaoCliente },
    { label: "Recomendação preliminar", value: conduta.recomendacaoPreliminar },
    { label: "Observações finais", value: conduta.observacoesFinais },
  ].filter((r) => r.value && r.value.trim());

  return (
    <div className="mt-2 rounded-lg border bg-card p-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Badge variant={PRIO_VARIANT[conduta.prioridadeOperacional] || "outline"}>
          Prioridade: {conduta.prioridadeOperacional}
        </Badge>
        <Badge variant="outline">
          {RETORNO_LABEL[conduta.necessidadeRetorno] || conduta.necessidadeRetorno}
        </Badge>
        {conduta.dataSugeridaRetorno && (
          <Badge variant="outline">
            Retorno: {formatDateDisplay(conduta.dataSugeridaRetorno)}
          </Badge>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="text-xs space-y-1.5 mt-1">
          {rows.map((r) => (
            <div key={r.label}>
              <dt className="font-semibold text-muted-foreground">{r.label}</dt>
              <dd className="whitespace-pre-wrap text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
