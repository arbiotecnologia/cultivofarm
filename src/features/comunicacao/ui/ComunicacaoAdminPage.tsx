import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  renderTemplate,
  TemplateRenderError,
  type Canal,
} from "@/features/comunicacao/render/renderTemplate";
import { isComunicacaoModuleEnabled } from "@/features/comunicacao/flags";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  activateTemplate,
  archiveTemplate,
  listRules,
  listEvents,
  listOutbox,
  listOwnPreferences,
  updateOwnPreference,
} from "@/features/comunicacao/api";
import type {
  ComunicacaoTemplate,
  ComunicacaoRegra,
  ComunicacaoEvento,
  ComunicacaoOutbox,
  ComunicacaoPreferencia,
  ComunicacaoCanal,
} from "@/features/comunicacao/types";

type AbaId = "templates" | "regras" | "fila" | "preferencias";

export default function ComunicacaoAdmin() {
  const [aba, setAba] = useState<AbaId>("templates");

  if (!isComunicacaoModuleEnabled()) return null;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Comunicação</h1>
        <p className="text-sm text-muted-foreground">
          Fundação Fase 1. Envios reais desativados (DELIVERY_ENABLED=false).
        </p>
      </header>

      <nav className="flex gap-2 border-b" role="tablist" aria-label="Seções">
        {(["templates", "regras", "fila", "preferencias"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={aba === k}
            className={`px-3 py-2 text-sm ${aba === k ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setAba(k)}
          >
            {label(k)}
          </button>
        ))}
      </nav>

      {aba === "templates" && <TemplatesPanel />}
      {aba === "regras" && <RegrasPanel />}
      {aba === "fila" && <FilaPanel />}
      {aba === "preferencias" && <PreferenciasPanel />}

      <section aria-label="Estado dos canais" className="rounded-md border p-4 text-sm">
        <h2 className="font-medium mb-1">Estado dos canais</h2>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>E-mail: não configurado</li>
          <li>WhatsApp: não configurado</li>
          <li>In-app: desativado</li>
          <li>Push: não configurado</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-2">Nenhum segredo é exibido nesta tela.</p>
      </section>
    </div>
  );
}

function label(k: AbaId) {
  return k === "templates" ? "Templates" : k === "regras" ? "Regras" : k === "fila" ? "Fila e histórico" : "Preferências";
}

// -------------------- Templates --------------------

function TemplatesPanel() {
  const qc = useQueryClient();
  const q = useQuery<ComunicacaoTemplate[], Error>({
    queryKey: ["comm", "templates"],
    queryFn: () => listTemplates(),
  });

  const [form, setForm] = useState({
    chave: "",
    nome: "",
    canal: "email" as Canal,
    assunto: "",
    corpo: "",
    variaveisTxt: "",
  });

  const criar = useMutation({
    mutationFn: async () => {
      const variaveis = form.variaveisTxt.split(",").map((v) => v.trim()).filter(Boolean);
      return createTemplate({
        p_chave: form.chave,
        p_nome: form.nome,
        p_canal: form.canal as ComunicacaoCanal,
        p_assunto: form.assunto || null,
        p_corpo: form.corpo,
        p_variaveis: variaveis,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "templates"] }),
  });

  const ativar = useMutation({
    mutationFn: (id: string) => activateTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "templates"] }),
  });
  const arquivar = useMutation({
    mutationFn: (id: string) => archiveTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "templates"] }),
  });

  const preview = tryRender(form);

  return (
    <section className="grid gap-6 md:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="rounded-md border p-4 space-y-3">
          <h2 className="font-medium">Novo template</h2>
          <div className="grid grid-cols-2 gap-2">
            <input className="rounded border p-2 text-sm" placeholder="chave" value={form.chave} onChange={(e) => setForm({ ...form, chave: e.target.value })} />
            <input className="rounded border p-2 text-sm" placeholder="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <select className="rounded border p-2 text-sm" value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value as Canal })}>
              <option value="email">E-mail</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in_app">Portal</option>
              <option value="push">Push</option>
            </select>
            <input className="rounded border p-2 text-sm" placeholder="variáveis (a,b,c)" value={form.variaveisTxt} onChange={(e) => setForm({ ...form, variaveisTxt: e.target.value })} />
          </div>
          <input className="w-full rounded border p-2 text-sm" placeholder="assunto (opcional)" value={form.assunto} onChange={(e) => setForm({ ...form, assunto: e.target.value })} />
          <textarea className="h-32 w-full rounded border p-2 text-sm" placeholder="corpo" value={form.corpo} onChange={(e) => setForm({ ...form, corpo: e.target.value })} />
          <button
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={criar.isPending || !form.chave || !form.nome || !form.corpo}
            onClick={() => criar.mutate()}
          >
            Criar rascunho
          </button>
          {criar.error && <p className="text-sm text-destructive">Erro: {(criar.error as Error).message}</p>}
        </div>

        <div className="rounded-md border p-4">
          <h2 className="font-medium mb-2">Templates</h2>
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {q.error && <p className="text-sm text-destructive">Erro: {q.error.message}</p>}
          {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum template.</p>}
          <ul className="divide-y">
            {(q.data ?? []).map((t) => (
              <li key={t.id} className="py-2 flex items-center gap-3 text-sm">
                <span className="font-mono">{t.chave} v{t.versao}</span>
                <span className="text-muted-foreground">{t.canal}</span>
                <span className="rounded px-1.5 py-0.5 text-xs border">{t.status}</span>
                <span className="ml-auto flex gap-2">
                  {t.status === "draft" && (
                    <button className="text-xs underline" onClick={() => ativar.mutate(t.id)}>Ativar</button>
                  )}
                  {t.status !== "archived" && (
                    <button className="text-xs underline" onClick={() => arquivar.mutate(t.id)}>Arquivar</button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="rounded-md border p-4">
        <h3 className="font-medium">Preview seguro</h3>
        {"erro" in preview ? (
          <p className="mt-2 text-sm text-destructive">{preview.erro}</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            {preview.assunto && <div><strong>Assunto:</strong> {preview.assunto}</div>}
            <pre className="whitespace-pre-wrap font-sans">{preview.corpo}</pre>
            {preview.missing.length > 0 && (
              <p className="text-xs text-muted-foreground">Faltando: {preview.missing.join(", ")}</p>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}

function tryRender(form: { canal: Canal; assunto: string; corpo: string; variaveisTxt: string }):
  | { assunto?: string; corpo: string; missing: string[] }
  | { erro: string } {
  try {
    const variaveisPermitidas = form.variaveisTxt.split(",").map((v) => v.trim()).filter(Boolean);
    return renderTemplate(
      { canal: form.canal, assunto: form.assunto || null, corpo: form.corpo || "", variaveisPermitidas },
      { variaveis: {} },
    );
  } catch (e) {
    return { erro: e instanceof TemplateRenderError ? `${e.code}: ${e.message}` : (e as Error).message };
  }
}

// -------------------- Regras --------------------

function RegrasPanel() {
  const q = useQuery<ComunicacaoRegra[], Error>({ queryKey: ["comm", "regras"], queryFn: () => listRules() });
  return (
    <section className="rounded-md border p-4 text-sm">
      <h2 className="font-medium mb-2">Regras por evento</h2>
      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {q.error && <p className="text-destructive">Erro: {q.error.message}</p>}
      {q.data && q.data.length === 0 && <p className="text-muted-foreground">Nenhuma regra cadastrada.</p>}
      <ul className="divide-y">
        {(q.data ?? []).map((r) => (
          <li key={r.id} className="py-2">
            <span className="font-mono">{r.event_key}</span> · {r.canal} · template <code>{r.template_chave}</code>
            {r.template_versao ? ` v${r.template_versao}` : " (ativa)"} · perfil {r.perfil ?? "—"} · {r.enabled ? "ligada" : "desligada"}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Upsert de regras via rpc_upsert_communication_rule (formulário completo a implementar quando migration
        estiver aplicada em staging).
      </p>
    </section>
  );
}

// -------------------- Fila / eventos --------------------

function FilaPanel() {
  const [page, setPage] = useState(0);
  const evs = useQuery<ComunicacaoEvento[], Error>({ queryKey: ["comm", "eventos", page], queryFn: () => listEvents(page) });
  const out = useQuery<ComunicacaoOutbox[], Error>({ queryKey: ["comm", "outbox", page], queryFn: () => listOutbox(page) });
  return (
    <section className="grid gap-4 md:grid-cols-2 text-sm">
      <div className="rounded-md border p-4">
        <h2 className="font-medium mb-2">Eventos</h2>
        {evs.isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {evs.error && <p className="text-destructive">Erro: {evs.error.message}</p>}
        <ul className="divide-y">
          {(evs.data ?? []).map((e) => (
            <li key={e.id} className="py-1 flex justify-between">
              <span>{e.event_key}</span>
              <span className="text-xs text-muted-foreground">{e.status} · enq={e.outbox_enqueued}/skip={e.outbox_skipped}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-md border p-4">
        <h2 className="font-medium mb-2">Outbox</h2>
        {out.isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {out.error && <p className="text-destructive">Erro: {out.error.message}</p>}
        <ul className="divide-y">
          {(out.data ?? []).map((o) => (
            <li key={o.id} className="py-1 flex justify-between">
              <span className="font-mono text-xs">{o.template_chave} v{o.template_versao}</span>
              <span className="text-xs">{o.canal} · {o.status} · tent={o.attempts}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-2 flex gap-2">
        <button className="rounded border px-2 py-1 text-xs" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← anterior</button>
        <button className="rounded border px-2 py-1 text-xs" onClick={() => setPage(page + 1)}>próxima →</button>
        <span className="text-xs text-muted-foreground self-center">página {page + 1}</span>
      </div>
    </section>
  );
}

// -------------------- Preferências --------------------

function PreferenciasPanel() {
  const qc = useQueryClient();
  const q = useQuery<ComunicacaoPreferencia[], Error>({ queryKey: ["comm", "prefs"], queryFn: () => listOwnPreferences() });
  const mut = useMutation({
    mutationFn: (args: { canal: ComunicacaoCanal; enabled: boolean; opt: boolean | null }) =>
      updateOwnPreference({ p_canal: args.canal, p_enabled: args.enabled, p_whatsapp_opt_in: args.opt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "prefs"] }),
  });
  return (
    <section className="rounded-md border p-4 text-sm">
      <h2 className="font-medium mb-2">Minhas preferências</h2>
      {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
      {q.error && <p className="text-destructive">Erro: {q.error.message}</p>}
      <ul className="divide-y">
        {(["email", "whatsapp", "in_app", "push"] as ComunicacaoCanal[]).map((canal) => {
          const p = (q.data ?? []).find((x) => x.canal === canal);
          const enabled = p?.enabled ?? true;
          return (
            <li key={canal} className="py-2 flex items-center gap-3">
              <span className="font-medium w-20">{canal}</span>
              <span className="text-xs text-muted-foreground">
                {p?.email_verificado ? "e-mail verificado" : ""}
                {p?.telefone_verificado ? " · fone verificado" : ""}
                {p?.whatsapp_opt_out_at ? " · opt-out" : ""}
              </span>
              <button
                className="ml-auto rounded border px-2 py-1 text-xs"
                onClick={() => mut.mutate({ canal, enabled: !enabled, opt: null })}
              >
                {enabled ? "Desativar" : "Ativar"}
              </button>
              {canal === "whatsapp" && (
                <>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => mut.mutate({ canal, enabled: true, opt: true })}>Opt-in</button>
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => mut.mutate({ canal, enabled: false, opt: false })}>Opt-out</button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Verificação de e-mail/telefone é feita apenas por administrador com evidência externa
        (rpc_verify_communication_channel). Opt-out prevalece.
      </p>
    </section>
  );
}
