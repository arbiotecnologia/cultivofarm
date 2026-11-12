import { useFiscalPisCofinsHistory } from "@/hooks/useFiscalPisCofinsHistory";

const REGIME_LABEL: Record<string, string> = {
  CUMULATIVO: "Cumulativo", NAO_CUMULATIVO: "Não cumulativo", MISTO: "Misto", SIMPLES_NACIONAL: "Simples Nacional",
};
const regime = (v: string | null) => (v ? REGIME_LABEL[v] ?? v : "Não informado");
const civil = (v: string | null) => (v ? v.split("-").reverse().join("/") : "sem data");

export default function PisCofinsHistory({ companySettingsId, currentUserId }: { companySettingsId: string; currentUserId?: string | null }) {
  const q = useFiscalPisCofinsHistory(companySettingsId);
  return (
    <section className="md:col-span-2 space-y-2" aria-labelledby="pis-cofins-history-title" data-testid="pis-cofins-history">
      <h3 id="pis-cofins-history-title" className="text-sm font-medium">Histórico de PIS/COFINS</h3>
      {q.isLoading ? <p className="text-xs text-muted-foreground">Carregando histórico…</p>
        : q.isError ? <p className="text-xs text-destructive" role="alert">Não foi possível carregar o histórico.</p>
        : q.data?.status === "unavailable" ? <p className="text-xs text-muted-foreground">Histórico ainda não disponível neste ambiente.</p>
        : q.data && q.data.entries.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
        : q.data ? (
          <ul className="space-y-1 text-xs">
            {q.data.entries.map((e) => (
              <li key={e.id} className="rounded-md border border-border p-2">
                <span className="block text-muted-foreground">
                  {new Date(e.changed_at).toLocaleString("pt-BR")} · {e.changed_by ? (e.changed_by === currentUserId ? "você" : `usuário ${e.changed_by.slice(0, 8)}`) : "sistema"}
                </span>
                <span className="block">Regime: {regime(e.old_regime)} → {regime(e.new_regime)}</span>
                <span className="block">Início da vigência: {civil(e.old_effective_from)} → {civil(e.new_effective_from)}</span>
              </li>
            ))}
          </ul>
        ) : null}
    </section>
  );
}
