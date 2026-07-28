import { useQuery } from "@tanstack/react-query";
import { fetchHealthSnapshot, type ComunicacaoHealthSnapshot } from "@/features/comunicacao/api";

function fmtDuration(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}min`;
  return `${(s / 3600).toFixed(1)}h`;
}

function Card({
  title, value, hint, tone = "neutral",
}: { title: string; value: React.ReactNode; hint?: string; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const toneCls =
    tone === "ok" ? "border-emerald-500/40" :
    tone === "warn" ? "border-amber-500/50" :
    tone === "bad" ? "border-destructive/60" :
    "border-border";
  return (
    <div className={`rounded-md border p-3 ${toneCls}`} role="group" aria-label={title}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Bool({ v }: { v: boolean }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${v ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
      {v ? "ligado" : "desligado"}
    </span>
  );
}

function toneForWorker(status: string): "ok" | "warn" | "bad" | "neutral" {
  if (status === "active") return "ok";
  if (status === "idle") return "warn";
  if (status === "stale") return "bad";
  return "neutral";
}

function toneForOldest(sec: number): "ok" | "warn" | "bad" {
  if (sec === 0) return "ok";
  if (sec < 600) return "warn";
  return "bad";
}

/**
 * Painel administrativo de observabilidade do Módulo de Comunicação.
 * Consome `fetchHealthSnapshot` (RPC admin-only). Não exibe secrets/PII.
 */
export default function ObservabilidadePanel() {
  const q = useQuery<ComunicacaoHealthSnapshot>({
    queryKey: ["comunicacao-health-snapshot"],
    queryFn: fetchHealthSnapshot,
    refetchInterval: 30_000,
    retry: 1,
  });

  if (q.isLoading) {
    return (
      <section aria-label="Observabilidade" className="rounded-md border p-4">
        <h2 className="font-medium">Observabilidade</h2>
        <p className="mt-2 text-sm text-muted-foreground">Carregando snapshot…</p>
      </section>
    );
  }

  if (q.isError || !q.data) {
    return (
      <section aria-label="Observabilidade" className="rounded-md border border-destructive/50 p-4">
        <h2 className="font-medium">Observabilidade</h2>
        <p className="mt-2 text-sm text-destructive">
          Não foi possível carregar o snapshot: {q.error instanceof Error ? q.error.message : "erro desconhecido"}
        </p>
        <button
          type="button"
          className="mt-2 rounded border px-2 py-1 text-xs"
          onClick={() => q.refetch()}
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  const s = q.data;
  const eventKeys = Object.keys(s.queue.by_event_key_7d ?? {}).sort();
  const canalStatus = Object.entries(s.queue.by_canal_status_7d ?? {}).sort();
  const hasData = s.queue.pending + s.queue.processing + s.queue.dead_letter +
    Object.values(s.queue.by_status ?? {}).reduce((a, b) => a + b, 0) > 0;

  return (
    <section aria-label="Observabilidade do módulo de comunicação" className="space-y-4 rounded-md border p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-medium">Observabilidade</h2>
          <p className="text-xs text-muted-foreground">
            Snapshot admin-only. Atualiza a cada 30s. Sem exibir segredos ou PII.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Gerado em <time dateTime={s.generated_at}>{new Date(s.generated_at).toLocaleString()}</time>
        </div>
      </header>

      <div>
        <h3 className="mb-2 text-sm font-medium">Flags de entrega</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">Delivery</div><Bool v={s.flags.delivery_enabled} /></div>
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">E-mail</div><Bool v={s.flags.email_enabled} /></div>
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">WhatsApp</div><Bool v={s.flags.whatsapp_enabled} /></div>
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">In-app</div><Bool v={s.flags.in_app_enabled} /></div>
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">Webhook WA</div><Bool v={s.flags.whatsapp_webhook_enabled} /></div>
          <div className="rounded border p-2 text-sm"><div className="text-xs text-muted-foreground">Test mode</div><Bool v={s.flags.test_mode_enabled} /></div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Providers</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded border p-2 text-sm">
            <div className="text-xs text-muted-foreground">E-mail (SMTP)</div>
            <div>Configurado: <Bool v={s.providers.email.configured} /></div>
            <div>Habilitado: <Bool v={s.providers.email.enabled} /></div>
          </div>
          <div className="rounded border p-2 text-sm">
            <div className="text-xs text-muted-foreground">WhatsApp</div>
            <div>Configurado: <Bool v={s.providers.whatsapp.configured} /></div>
            <div>Habilitado: <Bool v={s.providers.whatsapp.enabled} /></div>
            <div>Webhook config: <Bool v={s.providers.whatsapp.webhook_configured} /></div>
            <div>Webhook on: <Bool v={s.providers.whatsapp.webhook_enabled} /></div>
          </div>
          <div className="rounded border p-2 text-sm">
            <div className="text-xs text-muted-foreground">In-app</div>
            <div>Configurado: <Bool v={s.providers.in_app.configured} /></div>
            <div>Habilitado: <Bool v={s.providers.in_app.enabled} /></div>
            <div>Realtime pronto: <Bool v={s.realtime.ready} /></div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Fila</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Card title="Pending" value={s.queue.pending} />
          <Card title="Processing" value={s.queue.processing} />
          <Card title="Dead-letter" value={s.queue.dead_letter} tone={s.queue.dead_letter > 0 ? "warn" : "ok"} />
          <Card title="Item antigo (pending)" value={fmtDuration(s.queue.oldest_pending_age_seconds)} tone={toneForOldest(s.queue.oldest_pending_age_seconds)} />
          <Card title="Item antigo (processing)" value={fmtDuration(s.queue.oldest_processing_age_seconds)} tone={toneForOldest(s.queue.oldest_processing_age_seconds)} />
          <Card title="Último replay DLQ" value={s.dlq_admin.last_replay_at ? new Date(s.dlq_admin.last_replay_at).toLocaleString() : "—"} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Throughput 24h</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Card title="Enviados" value={s.throughput_24h.sent} />
          <Card title="Falhas/DLQ" value={s.throughput_24h.failed_or_dlq} tone={s.throughput_24h.failed_or_dlq > 0 ? "warn" : "ok"} />
          <Card title="Sucesso %" value={s.throughput_24h.success_rate_pct == null ? "—" : `${s.throughput_24h.success_rate_pct}%`} />
          <Card title="Tentativas (média)" value={s.throughput_24h.avg_attempts_sent ?? "—"} hint={`max ${s.throughput_24h.max_attempts ?? "—"}`} />
          <Card title="Latência média" value={s.throughput_24h.avg_latency_ms == null ? "—" : `${s.throughput_24h.avg_latency_ms}ms`} />
          <Card title="Latência p95" value={s.throughput_24h.p95_latency_ms == null ? "—" : `${s.throughput_24h.p95_latency_ms}ms`} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Worker</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Card title="Status" value={s.worker.status} tone={toneForWorker(s.worker.status)} hint={s.worker.status === "unknown" ? "sem dados na fila" : undefined} />
          <Card title="Última atividade" value={s.worker.last_activity_at ? new Date(s.worker.last_activity_at).toLocaleString() : "—"} hint={s.worker.last_activity_age_seconds != null ? `há ${fmtDuration(s.worker.last_activity_age_seconds)}` : undefined} />
          <Card title="Último envio" value={s.worker.last_sent_at ? new Date(s.worker.last_sent_at).toLocaleString() : "—"} />
        </div>
      </div>

      {!hasData ? (
        <p className="text-xs text-muted-foreground">
          Nenhum evento processado ainda. As tabelas abaixo aparecerão quando houver atividade.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Por event_key (7 dias)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="p-1 text-left">event_key</th><th>total</th><th>sent</th><th>pending</th><th>failed</th><th>DLQ</th></tr></thead>
                <tbody>
                  {eventKeys.map((k) => {
                    const r = s.queue.by_event_key_7d[k];
                    return (
                      <tr key={k} className="border-t">
                        <td className="p-1 font-mono">{k}</td>
                        <td className="text-center">{r.total}</td>
                        <td className="text-center">{r.sent}</td>
                        <td className="text-center">{r.pending}</td>
                        <td className="text-center">{r.failed}</td>
                        <td className="text-center">{r.dead_letter}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Canal × status (7 dias)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground"><tr><th className="p-1 text-left">canal.status</th><th>total</th></tr></thead>
                <tbody>
                  {canalStatus.map(([k, v]) => (
                    <tr key={k} className="border-t">
                      <td className="p-1 font-mono">{k}</td>
                      <td className="text-center">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
