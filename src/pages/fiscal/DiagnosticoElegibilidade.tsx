import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/NotFound";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ELIGIBILITY_DIAGNOSTIC_EXPIRES_AT, ELIGIBILITY_SOURCE_TYPES, type EligibilitySourceType, type OverloadSummary,
  databaseHost, isDiagnosticOpen, isValidUuid, runEligibilityDiagnostic,
} from "@/lib/fiscal/eligibilityDiagnostic";

const yn = (v: boolean | null) => (v === null ? "n/a" : v ? "sim" : "não");

export default function DiagnosticoElegibilidade() {
  const { profile, user } = useAuth();
  const [type, setType] = useState<EligibilitySourceType>("PARTNER_ORDER");
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<OverloadSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setRows(null); setErr(null); setBusy(false);
    return () => { generation.current += 1; };
  }, [user?.id, profile]);
  if (!isDiagnosticOpen(window.location.hostname)) return <NotFound />;

  const consultar = async () => {
    const request = ++generation.current;
    setBusy(true); setErr(null); setRows(null);
    try {
      const result = await runEligibilityDiagnostic(type, id);
      if (request === generation.current) setRows(result);
    }
    catch (e) { if (request === generation.current) setErr(e instanceof Error ? e.message : "ERRO"); }
    finally { if (request === generation.current) setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Diagnóstico de elegibilidade fiscal (somente leitura)</h1>
          <p className="text-sm text-muted-foreground">Temporário, prévia apenas, expira em {ELIGIBILITY_DIAGNOSTIC_EXPIRES_AT}.</p>
          <p className="text-sm text-muted-foreground" data-testid="session-context">
            Empresa da sessão: {profile?.organization_id ?? "sem contexto"} · Banco: {databaseHost()}
          </p>
        </header>
        <section className="grid gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="tipo">Tipo</Label>
            <select id="tipo" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
              value={type} disabled={busy} onChange={(e) => { setRows(null); setType(e.target.value as EligibilitySourceType); }}>
              {ELIGIBILITY_SOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="uuid">UUID</Label>
            <Input id="uuid" autoComplete="off" value={id} disabled={busy} onChange={(e) => { setRows(null); setId(e.target.value); }} placeholder="cole o identificador" />
          </div>
          <Button onClick={consultar} disabled={busy || !isValidUuid(id)}>{busy ? "Consultando…" : "Consultar"}</Button>
        </section>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {rows && (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((r) => (
              <article key={r.overload} className="rounded-lg border border-border bg-card p-4 text-sm text-card-foreground" data-testid={`result-${r.overload}`}>
                <h2 className="mb-2 font-medium">{r.overload}</h2>
                {r.ok ? (
                  <dl className="space-y-1">
                    <div><dt className="inline text-muted-foreground">eligible: </dt><dd className="inline">{yn(r.eligible)}</dd></div>
                    <div><dt className="inline text-muted-foreground">códigos: </dt><dd className="inline">{r.codes.length ? r.codes.join(", ") : "nenhum"}</dd></div>
                    <div><dt className="inline text-muted-foreground">pedido retornado: </dt><dd className="inline">{yn(r.hasOrderId)}</dd></div>
                    <div><dt className="inline text-muted-foreground">devedor retornado: </dt><dd className="inline">{yn(r.hasDebtorPartnerId)}</dd></div>
                    <div><dt className="inline text-muted-foreground">pedido = entrada: </dt><dd className="inline">{yn(r.orderMatchesInput)}</dd></div>
                    <div><dt className="font-medium">Aprovação econômica do piloto</dt><dd>{r.economicDiagnosis?.available ? `Comercial explícita vigente: ${yn(r.economicDiagnosis.commercialExplicit)} · Crédito explícito vigente: ${yn(r.economicDiagnosis.creditExplicit)}` : "Diagnóstico indisponível; não comprova ausência nem pendência de aprovação."}</dd></div>
                    <div><dt className="font-medium">Situação operacional e contábil</dt><dd>{r.economicDiagnosis ? `Comercial registrada no pedido: ${yn(r.economicDiagnosis.operationalCommercialRegistered)} · Pendência contábil: ${yn(r.economicDiagnosis.accountingPending)} · Bloqueio operacional: ${yn(r.economicDiagnosis.operationalBlocked)}` : "Diagnóstico operacional adicional indisponível."}</dd></div>
                    {r.eligible === false && <div><dd>Faturamento bloqueado. Aprovação econômica não libera operação nem emissão fiscal.</dd></div>}
                  </dl>
                ) : <p className="text-destructive">erro: {r.error}</p>}
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
