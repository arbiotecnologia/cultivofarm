import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  renderTemplate,
  TemplateRenderError,
  type Canal,
} from "@/features/comunicacao/render/renderTemplate";
import {
  isComunicacaoModuleEnabled,
  isComunicacaoBroadcastTabEnabled,
} from "@/features/comunicacao/flags";
import { useAuth } from "@/hooks/useAuth";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  activateTemplate,
  archiveTemplate,
  listRules,
  listEvents,
  listOutbox,
  listDeadLetter,
  fetchOutboxMetrics,
  replayDeadLetterItem,
  replayDeadLetterBatch,
  listOwnPreferences,
  updateOwnPreference,
  upsertRule,
  previewAdministrativeBroadcast,
  publishAdministrativeBroadcast,
  publishManualProdutoProntoAplicacao,
  listOrdensServicoRegularesParaComunicado,
  setTemplateMetadata,
  fetchCommunicationHealth,
  verifyCommunicationChannel,
} from "@/features/comunicacao/api";
import ConsentimentoWhatsappPanel from "@/features/comunicacao/ui/ConsentimentoWhatsappPanel";
import ObservabilidadePanel from "@/features/comunicacao/ui/ObservabilidadePanel";


import type {
  ComunicacaoTemplate,
  ComunicacaoRegra,
  ComunicacaoEvento,
  ComunicacaoOutbox,
  ComunicacaoPreferencia,
  ComunicacaoCanal,
} from "@/features/comunicacao/types";

type AbaId = "templates" | "regras" | "fila" | "preferencias" | "comunicados" | "consentimentos";


const ROLE_OPTIONS = [
  "administrador","gestor","tecnico_agronomo","consultor_tecnico",
  "aplicador","producao","operador_onfarm","administrativo","financeiro",
  "gestor_comercial","parceiro_b2b","parceiro_b2b_tecnico","cliente_produtor",
] as const;

export default function ComunicacaoAdmin() {
  const [aba, setAba] = useState<AbaId>("templates");
  const auth = useAuth();
  const roles = auth.roles ?? [];
  const isAdmin = roles.includes("administrador" as never);
  const isGestor = roles.includes("gestor" as never);
  const broadcastTabEnabled = isComunicacaoBroadcastTabEnabled();
  const showBroadcastTab = broadcastTabEnabled && (isAdmin || isGestor);

  if (!isComunicacaoModuleEnabled()) return null;

  // Fase 2.3: RLS de eventos/outbox permite apenas administrador. Gestor
  // não deve ver "Fila e histórico" (evita erro previsível de permissão).
  // Preferências permanecem para todos (dados próprios).
  const tabs: AbaId[] = isAdmin
    ? ["templates","regras","fila","preferencias","consentimentos"]
    : ["templates","regras","preferencias"];
  if (showBroadcastTab) tabs.push("comunicados");



  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Comunicação</h1>
        <p className="text-sm text-muted-foreground">
          Fase 2 (proposta). Envios reais permanecem desligados até staging.
        </p>
      </header>

      <nav className="flex gap-2 border-b" role="tablist" aria-label="Seções">
        {tabs.map((k) => (
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

      {aba === "templates" && <TemplatesPanel canMutate={isAdmin} />}
      {aba === "regras" && <RegrasPanel canMutate={isAdmin} />}
      {aba === "fila" && <FilaPanel />}
      {aba === "preferencias" && <PreferenciasPanel />}
      {aba === "comunicados" && showBroadcastTab && (
        <ComunicadosPanel canPublish={isAdmin} />
      )}
      {aba === "consentimentos" && isAdmin && (
        <ConsentimentoWhatsappPanel canMutate={isAdmin} />
      )}


      {isAdmin && (
        <>
          <ObservabilidadePanel />
          <CanalHealthPanel />
          <CanalVerificacaoPanel />
        </>
      )}


      {!isAdmin && (
        <section aria-label="Estado dos canais" className="rounded-md border p-4 text-sm">
          <h2 className="font-medium mb-1">Estado dos canais</h2>
          <p className="text-xs text-muted-foreground">
            Diagnóstico e verificação de canais são restritos ao administrador.
            Nenhum segredo é exibido nesta tela.
          </p>
        </section>
      )}
    </div>
  );
}

function label(k: AbaId) {
  switch (k) {
    case "templates": return "Templates";
    case "regras": return "Regras";
    case "fila": return "Fila e histórico";
    case "preferencias": return "Preferências";
    case "comunicados": return "Comunicados";
    case "consentimentos": return "Consentimentos WhatsApp";
  }
}


// -------------------- Comunicados (broadcast administrativo) --------------------

function ComunicadosPanel({ canPublish }: { canPublish: boolean }) {
  const [role, setRole] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [previewData, setPreviewData] = useState<null | {
    total_users_in_role: number;
    estimated_recipients_by_canal: Record<string, number>;
  }>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<null | { event_id: string; duplicated: boolean }>(null);

  // Nonce UUID persistente por INTENÇÃO — preservado em retries e duplo clique.
  // Renovado após sucesso ou reset completo do formulário.
  const [broadcastNonce, setBroadcastNonce] = useState<string>(() => cryptoRandomUUID());
  const resetForm = () => {
    setRole(""); setTitulo(""); setMensagem("");
    setPreviewData(null); setPreviewError(null);
    setPublished(null); setPublishError(null);
    setBroadcastNonce(cryptoRandomUUID());
  };

  const preview = useMutation({
    mutationFn: async () => {
      setPreviewError(null);
      const r = await previewAdministrativeBroadcast({ p_target_role: role });
      setPreviewData({
        total_users_in_role: r.total_users_in_role,
        estimated_recipients_by_canal: r.estimated_recipients_by_canal ?? {},
      });
      return r;
    },
    onError: (e: Error) => setPreviewError(e.message),
  });

  const publish = useMutation({
    mutationFn: async () => {
      setPublishError(null);
      const r = await publishAdministrativeBroadcast({
        target_role: role, titulo, mensagem,
        idempotency_key: `admin_bcast:${broadcastNonce}`,
      });
      setPublished({ event_id: r.event_id, duplicated: r.duplicated });
      return r;
    },
    onError: (e: Error) => setPublishError(e.message),
    onSuccess: () => {
      // Renova nonce após sucesso — próxima intenção terá novo idempotency key.
      setBroadcastNonce(cryptoRandomUUID());
    },
    onSettled: () => setConfirmOpen(false),
  });

  const disabled =
    !role || titulo.trim().length === 0 || mensagem.trim().length === 0;

  return (
    <section className="grid gap-4 md:grid-cols-[1fr_320px] text-sm">
      <div className="rounded-md border p-4 space-y-3">
        <h2 className="font-medium">Novo comunicado administrativo</h2>
        {!canPublish && (
          <p className="text-xs text-muted-foreground">
            Gestor visualiza pré-visualização e contagem. Somente administrador pode publicar.
          </p>
        )}
        <label className="block text-xs">
          Perfil-alvo (app_role)
          <select className="mt-1 w-full rounded border p-2" value={role} onChange={(e) => { setRole(e.target.value); setPreviewData(null); }}>
            <option value="">—</option>
            {ROLE_OPTIONS.map((r) => (<option key={r} value={r}>{r}</option>))}
          </select>
        </label>
        <label className="block text-xs">
          Título
          <input maxLength={200} className="mt-1 w-full rounded border p-2" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </label>
        <label className="block text-xs">
          Mensagem
          <textarea maxLength={2000} className="mt-1 h-32 w-full rounded border p-2" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            disabled={!role || preview.isPending}
            onClick={() => preview.mutate()}
          >
            {preview.isPending ? "Estimando…" : "Estimar destinatários"}
          </button>
          <button
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={!canPublish || disabled || previewData == null || publish.isPending}
            onClick={() => setConfirmOpen(true)}
            title={!canPublish ? "Apenas administrador" : previewData == null ? "Estime a contagem primeiro" : ""}
          >
            Publicar…
          </button>
          <button
            className="rounded border px-3 py-1.5 text-sm"
            onClick={resetForm}
            type="button"
          >
            Limpar / novo nonce
          </button>
        </div>
        {previewError && <p className="text-xs text-destructive">Erro na estimativa: {previewError}</p>}
        {publishError && <p className="text-xs text-destructive">Erro na publicação: {publishError}</p>}
        {published && (
          <p className="text-xs text-muted-foreground">
            Publicado. event_id={published.event_id}{published.duplicated ? " (duplicado idempotente)" : ""}.
          </p>
        )}
      </div>

      <aside className="rounded-md border p-4 space-y-2">
        <h3 className="font-medium">Pré-visualização</h3>
        <p className="text-xs text-muted-foreground">
          Contagem calculada no servidor: total no perfil + recipientes elegíveis
          por canal (opt-in/verificação/opt-out).
        </p>
        {previewData ? (
          <div className="text-sm space-y-1">
            <div><strong>Perfil:</strong> {role}</div>
            <div><strong>Total no perfil:</strong> {previewData.total_users_in_role}</div>
            <div><strong>Elegíveis por canal:</strong></div>
            <ul className="pl-4 list-disc">
              {Object.entries(previewData.estimated_recipients_by_canal).map(([c, n]) => (
                <li key={c}>{c}: {n}</li>
              ))}
              {Object.keys(previewData.estimated_recipients_by_canal).length === 0 && (
                <li className="text-muted-foreground">Nenhuma regra ativa para este perfil.</li>
              )}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Sem estimativa carregada.</p>
        )}
      </aside>

      {/* Ação manual: produto_pronto_aplicacao (admin, OS regular) */}
      <div className="md:col-span-2">
        <ManualProdutoProntoAplicacaoPanel canPublish={canPublish} />
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-md bg-background p-4 shadow-lg">
            <h3 className="font-medium">Confirmar publicação</h3>
            <p className="mt-2 text-sm">
              Publicar <strong>{titulo}</strong> para <code>{role}</code>?
              Estimativa: {previewData?.total_users_in_role ?? 0} no perfil.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nonce (idempotency): <code className="break-all">admin_bcast:{broadcastNonce}</code>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setConfirmOpen(false)} disabled={publish.isPending}>Cancelar</button>
              <button className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                      disabled={publish.isPending} onClick={() => publish.mutate()}>
                {publish.isPending ? "Publicando…" : "Confirmar publicação"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Gera UUID via WebCrypto quando disponível; fallback determinístico caso não. */
function cryptoRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (dev/older browsers): 128 bits via Math.random — aceitável como nonce local.
  const s = (n: number) => Math.floor(Math.random() * n).toString(16).padStart(4, "0");
  return `${s(0x10000)}${s(0x10000)}-${s(0x10000)}-${s(0x10000)}-${s(0x10000)}-${s(0x10000)}${s(0x10000)}${s(0x10000)}`;
}

// -------------------- Ação manual: produto_pronto_aplicacao --------------------

function ManualProdutoProntoAplicacaoPanel({ canPublish }: { canPublish: boolean }) {
  const [selectedOsId, setSelectedOsId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [nonce, setNonce] = useState<string>(() => cryptoRandomUUID());
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<null | { event_id: string; duplicated: boolean }>(null);

  const q = useQuery({
    queryKey: ["comm", "os_regulares_manual"],
    queryFn: () => listOrdensServicoRegularesParaComunicado(50),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (published) {
      // Renova nonce após sucesso — nova intenção precisa de novo idempotency.
      setNonce(cryptoRandomUUID());
    }
  }, [published]);

  const publish = useMutation({
    mutationFn: async () => {
      setPublishError(null);
      const r = await publishManualProdutoProntoAplicacao({
        os_id: selectedOsId,
        idempotency_key: `manual_pronto_aplic:${nonce}`,
      });
      setPublished({ event_id: r.event_id, duplicated: r.duplicated });
      return r;
    },
    onError: (e: Error) => setPublishError(e.message),
    onSettled: () => setConfirmOpen(false),
  });

  const selectedOs = (q.data ?? []).find((o) => o.id === selectedOsId);

  return (
    <div className="rounded-md border p-4 space-y-3">
      <h2 className="font-medium">Ação manual: produto pronto para aplicação (OS regular)</h2>
      <p className="text-xs text-muted-foreground">
        Publica o evento <code>produto_pronto_aplicacao</code> para uma OS regular.
        On-farm ficará disponível quando houver definição de negócio.
        Servidor valida existência da OS e ignora payload (dados vêm do banco).
      </p>
      {!canPublish && (
        <p className="text-xs text-muted-foreground">
          Gestor visualiza a lista mas não pode publicar.
        </p>
      )}
      <label className="block text-xs">
        Selecionar OS
        <select
          className="mt-1 w-full rounded border p-2"
          value={selectedOsId}
          onChange={(e) => { setSelectedOsId(e.target.value); setPublished(null); }}
          disabled={q.isLoading}
        >
          <option value="">— escolha —</option>
          {(q.data ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.numero_os ?? o.id.slice(0, 8)} · status: {o.status ?? "?"}
            </option>
          ))}
        </select>
      </label>
      {selectedOs && (
        <p className="text-xs">
          <strong>OS selecionada:</strong> {selectedOs.numero_os ?? selectedOs.id} · <strong>status:</strong> {selectedOs.status ?? "?"}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!canPublish || !selectedOsId || publish.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Publicar…
        </button>
        <button
          className="rounded border px-3 py-1.5 text-sm"
          onClick={() => { setSelectedOsId(""); setPublished(null); setNonce(cryptoRandomUUID()); }}
        >
          Limpar / novo nonce
        </button>
      </div>
      {publishError && <p className="text-xs text-destructive">Erro: {publishError}</p>}
      {published && (
        <p className="text-xs text-muted-foreground">
          Publicado. event_id={published.event_id}{published.duplicated ? " (duplicado idempotente)" : ""}.
        </p>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-md bg-background p-4 shadow-lg">
            <h3 className="font-medium">Confirmar publicação manual</h3>
            <p className="mt-2 text-sm">
              Publicar <code>produto_pronto_aplicacao</code> para OS <strong>{selectedOs?.numero_os ?? selectedOsId}</strong>?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Nonce (idempotency): <code className="break-all">manual_pronto_aplic:{nonce}</code>
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded border px-3 py-1.5 text-sm" onClick={() => setConfirmOpen(false)} disabled={publish.isPending}>Cancelar</button>
              <button
                className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                disabled={publish.isPending}
                onClick={() => publish.mutate()}
              >
                {publish.isPending ? "Publicando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------- Templates --------------------

function TemplatesPanel({ canMutate }: { canMutate: boolean }) {
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
            disabled={!canMutate || criar.isPending || !form.chave || !form.nome || !form.corpo}
            onClick={() => criar.mutate()}
            title={!canMutate ? "Somente administrador pode criar/alterar templates" : ""}
          >
            Criar rascunho
          </button>
          {!canMutate && (
            <p className="text-xs text-muted-foreground">Modo somente leitura (gestor).</p>
          )}
          {criar.error && <p className="text-sm text-destructive">Erro: {(criar.error as Error).message}</p>}
        </div>

        <div className="rounded-md border p-4">
          <h2 className="font-medium mb-2">Templates</h2>
          <p className="text-[11px] text-muted-foreground mb-2 rounded bg-muted/50 border border-dashed p-2">
            Sincronização automática do status Meta é aplicada server-side e permanece <strong>indisponível</strong> nesta rodada — o token WABA não está configurado. Ajuste o campo <em>Meta status</em> manualmente após validar na Business Manager.
          </p>

          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {q.error && <p className="text-sm text-destructive">Erro: {q.error.message}</p>}
          {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">Nenhum template.</p>}
          <ul className="divide-y">
            {(q.data ?? []).map((t) => (
              <li key={t.id} className="py-2 text-sm space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono">{t.chave} v{t.versao}</span>
                  <span className="text-muted-foreground">{t.canal}</span>
                  <span className="rounded px-1.5 py-0.5 text-xs border">{t.status}</span>
                  {t.canal === "whatsapp" && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs border ${
                        t.provider_template_status === "approved"
                          ? "border-emerald-500 text-emerald-600"
                          : "border-amber-500 text-amber-600"
                      }`}
                      title="Status Meta"
                    >
                      Meta: {t.provider_template_status ?? "draft"}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    {t.status === "draft" && (
                      <button
                        className="text-xs underline disabled:opacity-40"
                        disabled={
                          !canMutate ||
                          (t.canal === "whatsapp" && t.provider_template_status !== "approved")
                        }
                        title={
                          t.canal === "whatsapp" && t.provider_template_status !== "approved"
                            ? "WhatsApp: só é possível ativar após template aprovado pela Meta"
                            : ""
                        }
                        onClick={() => ativar.mutate(t.id)}
                      >
                        Ativar
                      </button>
                    )}
                    {t.status !== "archived" && (
                      <button className="text-xs underline disabled:opacity-40" disabled={!canMutate} onClick={() => arquivar.mutate(t.id)}>Arquivar</button>
                    )}
                  </span>
                </div>
                {t.canal === "whatsapp" && (
                  <WhatsappTemplateMetadataEditor template={t} canMutate={canMutate} />
                )}
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

// -------------------- Editor de metadados WhatsApp (Meta Cloud API) --------------------
// Admin edita provider_template_name, language_code, parameter_mapping e
// provider_template_status. Gestor vê somente leitura. Envio real só é
// habilitado quando status = 'approved' (regra reforçada no botão Ativar).
// Nenhum token/env é exibido aqui — a config vive nas secrets do worker.
function WhatsappTemplateMetadataEditor({
  template,
  canMutate,
}: {
  template: ComunicacaoTemplate;
  canMutate: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(template.provider_template_name ?? "");
  const [lang, setLang] = useState(template.language_code ?? "pt_BR");
  const [mappingTxt, setMappingTxt] = useState(
    JSON.stringify(template.parameter_mapping ?? [], null, 2),
  );
  const [status, setStatus] = useState<string>(template.provider_template_status ?? "draft");

  // Fase 2.4: status aceitos pelo SQL — sem o valor legado obsoleto.
  const STATUS_ALLOWED = ["draft", "pending", "approved", "rejected", "paused", "disabled"] as const;

  // Fase 2.4: variáveis declaradas no template — usadas para validar mapping.
  const templateVars: string[] = template.variaveis ?? [];
  const varsLen = templateVars.length;
  const prevStatus = template.provider_template_status;
  // Imutabilidade: se o template já foi aprovado alguma vez (status atual ∈
  // approved|paused|disabled), o nome do provider não pode mudar.
  const nameLocked = prevStatus === "approved" || prevStatus === "paused" || prevStatus === "disabled";

  // Máquina de estados aceita pelo SQL (Fase 2.4). Deve espelhar a lista
  // do CHECK/RPC para não frustrar o usuário com erros do servidor.
  const allowedTransitions: Record<string, ReadonlyArray<typeof STATUS_ALLOWED[number]>> = {
    draft: ["draft", "pending"],
    pending: ["draft", "pending", "approved", "rejected"],
    approved: ["approved", "paused", "disabled"],
    paused: ["approved", "paused", "disabled"],
    rejected: ["draft", "pending", "rejected"],
    disabled: ["disabled"],
  };
  const selectableStatuses = allowedTransitions[prevStatus ?? "draft"] ?? STATUS_ALLOWED;

  const parsedMapping = (() => {
    try {
      const arr = JSON.parse(mappingTxt || "[]");
      if (!Array.isArray(arr)) return { ok: false as const, err: "mapping deve ser array" };
      if (varsLen === 0 && arr.length !== 0) {
        return { ok: false as const, err: "template sem variáveis exige mapping []" };
      }
      const sorted = [...arr].sort(
        (a, b) => Number((a as { index?: number }).index) - Number((b as { index?: number }).index),
      );
      const seenVars = new Set<string>();
      for (let i = 0; i < sorted.length; i++) {
        const m = sorted[i] as { index?: unknown; variavel?: unknown };
        if (typeof m.index !== "number" || !Number.isInteger(m.index) || m.index <= 0) {
          return { ok: false as const, err: `índice inválido na posição ${i + 1}` };
        }
        if (m.index !== i + 1) return { ok: false as const, err: `índice ${i + 1} ausente/duplicado` };
        if (typeof m.variavel !== "string" || m.variavel.length === 0) {
          return { ok: false as const, err: `variavel inválida no índice ${i + 1}` };
        }
        if (seenVars.has(m.variavel)) {
          return { ok: false as const, err: `variavel duplicada: ${m.variavel}` };
        }
        seenVars.add(m.variavel);
        if (varsLen > 0 && !templateVars.includes(m.variavel)) {
          return { ok: false as const, err: `variavel "${m.variavel}" não declarada no template` };
        }
      }
      return { ok: true as const, value: sorted as Array<{ index: number; variavel: string; tipo?: string }> };
    } catch (e) {
      return { ok: false as const, err: `JSON inválido: ${(e as Error).message}` };
    }
  })();

  const wantsApproved = status === "approved";
  const mappingComplete = parsedMapping.ok && parsedMapping.value.length === varsLen;
  const canApprove =
    parsedMapping.ok &&
    mappingComplete &&
    name.trim().length > 0 &&
    lang.trim().length > 0;
  const invalidApproval = wantsApproved && !canApprove;
  const invalidTransition = !selectableStatuses.includes(status as typeof STATUS_ALLOWED[number]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!parsedMapping.ok) throw new Error(parsedMapping.err);
      if (invalidApproval) {
        throw new Error("approved exige nome, language_code e mapping completo");
      }
      if (invalidTransition) {
        throw new Error(`transição de status inválida: ${prevStatus ?? "draft"} → ${status}`);
      }
      if (nameLocked && name !== (template.provider_template_name ?? "")) {
        throw new Error("provider_template_name é imutável após aprovação");
      }
      return setTemplateMetadata({
        p_template_id: template.id,
        p_provider_template_name: name.trim() || null,
        p_language_code: lang.trim() || null,
        p_parameter_mapping: parsedMapping.value,
        p_provider_template_status: status,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "templates"] }),
  });

  return (
    <div className="rounded border bg-muted/30 p-2 text-xs">
      <button
        type="button"
        className="underline"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Metadados WhatsApp (Meta) — {canMutate ? "editar" : "somente leitura"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col">
              <span className="text-muted-foreground">
                provider_template_name{nameLocked ? " (imutável após aprovação)" : ""}
              </span>
              <input
                className="rounded border p-1"
                value={name}
                readOnly={!canMutate || nameLocked}
                onChange={(e) => setName(e.target.value)}
                placeholder="produto_pronto_v1"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-muted-foreground">language_code</span>
              <input
                className="rounded border p-1"
                value={lang}
                readOnly={!canMutate}
                onChange={(e) => setLang(e.target.value)}
                placeholder="pt_BR"
              />
            </label>
          </div>
          <label className="flex flex-col">
            <span className="text-muted-foreground">
              parameter_mapping (JSON — variáveis declaradas: {templateVars.join(", ") || "nenhuma"})
            </span>
            <textarea
              className="h-24 rounded border p-1 font-mono"
              value={mappingTxt}
              readOnly={!canMutate}
              onChange={(e) => setMappingTxt(e.target.value)}
            />
            {!parsedMapping.ok && (
              <span className="text-destructive mt-1">mapping: {parsedMapping.err}</span>
            )}
            {parsedMapping.ok && varsLen > 0 && !mappingComplete && (
              <span className="text-amber-600 mt-1">
                mapping incompleto: {parsedMapping.value.length}/{varsLen} variáveis mapeadas.
              </span>
            )}
          </label>
          <label className="flex flex-col">
            <span className="text-muted-foreground">provider_template_status</span>
            <select
              className="rounded border p-1"
              value={status}
              disabled={!canMutate}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_ALLOWED.map((s) => (
                <option
                  key={s}
                  value={s}
                  disabled={!selectableStatuses.includes(s)}
                >
                  {s}{selectableStatuses.includes(s) ? "" : " (indisponível)"}
                </option>
              ))}
            </select>
            <span className="text-muted-foreground mt-1">
              Somente <code>approved</code> permite ativação/envio via WhatsApp.
              Transições permitidas a partir de <code>{prevStatus ?? "draft"}</code>:{" "}
              {selectableStatuses.join(", ")}.
            </span>
            {invalidTransition && (
              <span className="text-destructive mt-1">
                transição inválida: {prevStatus ?? "draft"} → {status}
              </span>
            )}
            {invalidApproval && (
              <span className="text-destructive mt-1">
                approved exige nome, language_code e mapping completo ({varsLen} variáveis).
              </span>
            )}
          </label>
          {canMutate && (
            <button
              type="button"
              className="rounded bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50"
              disabled={
                salvar.isPending || !parsedMapping.ok || invalidApproval || invalidTransition
              }
              onClick={() => salvar.mutate()}
            >
              Salvar metadados
            </button>
          )}
          {salvar.error && (
            <p className="text-destructive">Erro: {(salvar.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}

// -------------------- Saúde dos canais (admin, sob demanda) --------------------
// Chama a Edge Function `communication-health` e renderiza apenas booleans
// configured/enabled + timestamp. Nunca exibe valores de secrets. Falha ou
// função ainda não implantada é tratada de forma amigável (não quebra a tela).
// Sem polling automático.
function CanalHealthPanel() {
  const mut = useMutation({
    mutationFn: () => fetchCommunicationHealth(),
  });
  const d = mut.data;
  return (
    <section aria-label="Saúde dos canais" className="rounded-md border p-4 text-sm space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Saúde dos canais</h2>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          disabled={mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? "Verificando…" : "Verificar agora"}
        </button>
      </div>
      {!d && !mut.isPending && (
        <p className="text-xs text-muted-foreground">
          Nenhuma checagem realizada. Clique em “Verificar agora” para consultar
          a Edge Function communication-health. Nenhum segredo é exibido.
        </p>
      )}
      {d && !d.ok && (
        <p className="text-xs text-amber-600">
          {d.error === "unauthorized"
            ? "Diagnóstico indisponível: acesso não autorizado. Faça login como administrador."
            : d.error === "function_unavailable"
              ? "Diagnóstico indisponível: função communication-health não implantada ou indisponível."
              : "Diagnóstico indisponível: erro inesperado ao consultar o serviço."}
          {" "}(Consultado em {d.fetched_at}.)
        </p>
      )}
      {d && d.ok && (
        <ul className="grid gap-1 text-xs md:grid-cols-2 lg:grid-cols-4">
          <li>
            <strong>E-mail:</strong>{" "}
            {d.email?.configured ? "configurado" : "não configurado"}
          </li>
          <li>
            <strong>WhatsApp:</strong>{" "}
            {d.whatsapp?.configured ? "configurado" : "não configurado"}
          </li>
          <li>
            <strong>In-app:</strong>{" "}
            {d.in_app?.configured ? "configurado" : "não configurado"}
          </li>
          <li>
            <strong>Webhook WhatsApp:</strong>{" "}
            {d.whatsapp_webhook?.configured ? "configurado" : "não configurado"}
            {" · "}
            {d.whatsapp_webhook?.enabled ? "flag ON" : "flag OFF"}
          </li>
          <li className="md:col-span-2 lg:col-span-4 text-muted-foreground">
            Consultado em {d.fetched_at}. Nenhum valor de secret é exposto.
          </li>
        </ul>
      )}
    </section>
  );
}

// -------------------- Verificar canal (admin, RPC Fase 1) --------------------
// Fase 2.4: usa `rpc_verify_communication_channel` já existente. Pelo esquema
// atual, a RPC recebe user_id OU cliente_id (mutuamente exclusivos), canal, e
// flags email_verificado/telefone_verificado. Um seletor de perfis exigiria
// listar profiles com contatos, o que exporia PII a operadores não autorizados
// via RLS ampla — por isso a UI aceita apenas UUIDs colados pelo administrador
// (obtidos na tela de Gestão de Usuários) e não busca listas de terceiros.
// Alternativa segura documentada em restoration/comunicacao-fase2/runbook.md.
function CanalVerificacaoPanel() {
  // Fase 2.5: apenas canais com verificação externa real. in_app/push não têm
  // artefato externo a atestar e ficam fora desta UI.
  type CanalVerificavel = "email" | "whatsapp";
  const [subjectKind, setSubjectKind] = useState<"user" | "cliente">("user");
  const [subjectId, setSubjectId] = useState("");
  const [canal, setCanal] = useState<CanalVerificavel>("email");
  const [lastMarked, setLastMarked] = useState<{ canal: CanalVerificavel; kind: string; id: string } | null>(null);
  const uuidRe = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const uuidOk = uuidRe.test(subjectId.trim());

  const mut = useMutation({
    mutationFn: async () => {
      if (!uuidOk) throw new Error("UUID inválido");
      // Fase 2.5: canal determina a flag (esta tela MARCA verificado; não revoga).
      const args = {
        p_user_id: subjectKind === "user" ? subjectId.trim() : null,
        p_cliente_id: subjectKind === "cliente" ? subjectId.trim() : null,
        p_canal: canal as ComunicacaoCanal,
        p_email_verificado: canal === "email" ? true : null,
        p_telefone_verificado: canal === "whatsapp" ? true : null,
      };
      const res = await verifyCommunicationChannel(args);
      setLastMarked({ canal, kind: subjectKind, id: subjectId.trim() });
      return res;
    },
  });

  return (
    <section aria-label="Verificar canal" className="rounded-md border p-4 text-sm space-y-2">
      <h2 className="font-medium">Verificar canal (admin)</h2>
      <p className="text-xs text-muted-foreground">
        Marca verificação externa de e-mail (canal <code>email</code>) ou telefone
        (canal <code>whatsapp</code>) para um usuário OU cliente. Cole o UUID obtido
        na tela de Gestão de Usuários/Clientes — para preservar privacidade, esta
        tela não lista perfis de terceiros. Gestor não pode verificar terceiros
        (RPC exige administrador). Esta tela apenas marca; para revogar, use o
        fluxo específico documentado no runbook.
      </p>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="flex flex-col text-xs">
          <span>Sujeito</span>
          <select
            className="rounded border p-1"
            value={subjectKind}
            onChange={(e) => setSubjectKind(e.target.value as "user" | "cliente")}
          >
            <option value="user">user_id</option>
            <option value="cliente">cliente_id</option>
          </select>
        </label>
        <label className="flex flex-col text-xs md:col-span-2">
          <span>UUID</span>
          <input
            className="rounded border p-1 font-mono"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          {!uuidOk && subjectId.length > 0 && (
            <span className="text-destructive mt-1">UUID inválido</span>
          )}
        </label>
        <label className="flex flex-col text-xs">
          <span>Canal</span>
          <select
            className="rounded border p-1"
            value={canal}
            onChange={(e) => setCanal(e.target.value as CanalVerificavel)}
          >
            <option value="email">email</option>
            <option value="whatsapp">whatsapp</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
        disabled={!uuidOk || mut.isPending}
        onClick={() => mut.mutate()}
      >
        {mut.isPending ? "Enviando…" : `Marcar ${canal} verificado`}
      </button>
      {mut.error && (
        <p className="text-xs text-destructive">Não foi possível registrar a verificação.</p>
      )}
      {mut.data && lastMarked && (
        <p className="text-xs text-muted-foreground">
          Canal <strong>{lastMarked.canal}</strong> marcado como verificado para{" "}
          <strong>{lastMarked.kind}</strong> <code>{lastMarked.id}</code>.
        </p>
      )}
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

function RegrasPanel({ canMutate }: { canMutate: boolean }) {
  const qc = useQueryClient();
  const q = useQuery<ComunicacaoRegra[], Error>({ queryKey: ["comm", "regras"], queryFn: () => listRules() });

  const [form, setForm] = useState({
    event_key: "produto_pronto_retirada" as
      | "produto_pronto_retirada"
      | "produto_pronto_aplicacao"
      | "administrative_important_update",
    perfil: "" as "" | "cliente_produtor" | "aplicador" | "consultor_tecnico" | "administrador" | "gestor" | "financeiro" | "operador_onfarm" | "producao" | "administrativo" | "gestor_comercial" | "parceiro_b2b" | "parceiro_b2b_tecnico" | "tecnico_agronomo",
    estrategia: "source_participants" as "by_role" | "source_participants" | "broadcast_role",
    canal: "in_app" as ComunicacaoCanal,
    template_chave: "",
    template_versao: "" as string,
    prioridade: 100,
    cooldown_seconds: 0,
    enabled: false,
  });

  const mut = useMutation({
    mutationFn: () =>
      upsertRule({
        p_rule_id: null,
        p_event_key: form.event_key,
        p_perfil: form.perfil === "" ? null : form.perfil,
        p_estrategia: form.estrategia,
        p_canal: form.canal,
        p_template_chave: form.template_chave,
        p_template_versao: form.template_versao ? Number(form.template_versao) : null,
        p_condicoes: {},
        p_prioridade: Number(form.prioridade),
        p_enabled: form.enabled,
        p_cooldown_seconds: Number(form.cooldown_seconds),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "regras"] }),
  });

  const toggle = useMutation({
    mutationFn: (r: ComunicacaoRegra) =>
      upsertRule({
        p_rule_id: r.id,
        p_event_key: r.event_key,
        p_perfil: (r.perfil ?? null) as string | null,
        p_estrategia: r.estrategia as "by_role" | "source_participants" | "broadcast_role",
        p_canal: r.canal,
        p_template_chave: r.template_chave,
        p_template_versao: r.template_versao,
        p_condicoes: (r.condicoes ?? {}) as Record<string, unknown>,
        p_prioridade: r.prioridade,
        p_enabled: !r.enabled,
        p_cooldown_seconds: r.cooldown_seconds,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comm", "regras"] }),
  });

  const isAdmEvent = form.event_key === "administrative_important_update";

  return (
    <section className="space-y-4 text-sm">
      <div className="rounded-md border p-4 space-y-3">
        <h2 className="font-medium">Nova regra</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            Evento
            <select
              className="mt-1 w-full rounded border p-2 text-sm"
              value={form.event_key}
              onChange={(e) => {
                const ev = e.target.value as typeof form.event_key;
                setForm((f) => ({
                  ...f,
                  event_key: ev,
                  estrategia:
                    ev === "administrative_important_update" ? "broadcast_role" : "source_participants",
                }));
              }}
            >
              <option value="produto_pronto_retirada">produto_pronto_retirada</option>
              <option value="produto_pronto_aplicacao">produto_pronto_aplicacao</option>
              <option value="administrative_important_update">administrative_important_update</option>
            </select>
          </label>
          <label className="text-xs">
            Estratégia
            <select
              className="mt-1 w-full rounded border p-2 text-sm"
              value={form.estrategia}
              onChange={(e) => setForm({ ...form, estrategia: e.target.value as typeof form.estrategia })}
            >
              {isAdmEvent ? (
                <option value="broadcast_role">broadcast_role</option>
              ) : (
                <>
                  <option value="source_participants">source_participants</option>
                  <option value="by_role">by_role</option>
                </>
              )}
            </select>
          </label>
          <label className="text-xs">
            Perfil {isAdmEvent || form.estrategia === "by_role" ? "(obrigatório)" : "(opcional)"}
            <select
              className="mt-1 w-full rounded border p-2 text-sm"
              value={form.perfil}
              onChange={(e) => setForm({ ...form, perfil: e.target.value as typeof form.perfil })}
            >
              <option value="">—</option>
              <option value="administrador">Administrador da empresa</option>
              <option value="gestor">gestor</option>
              <option value="tecnico_agronomo">tecnico_agronomo</option>
              <option value="consultor_tecnico">consultor_tecnico</option>
              <option value="aplicador">aplicador</option>
              <option value="producao">producao</option>
              <option value="operador_onfarm">operador_onfarm</option>
              <option value="administrativo">administrativo</option>
              <option value="financeiro">financeiro</option>
              <option value="gestor_comercial">gestor_comercial</option>
              <option value="parceiro_b2b">parceiro_b2b</option>
              <option value="parceiro_b2b_tecnico">parceiro_b2b_tecnico</option>
              <option value="cliente_produtor">cliente_produtor</option>
            </select>
          </label>
          <label className="text-xs">
            Canal
            <select
              className="mt-1 w-full rounded border p-2 text-sm"
              value={form.canal}
              onChange={(e) => setForm({ ...form, canal: e.target.value as ComunicacaoCanal })}
            >
              <option value="in_app">in_app</option>
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="push">push</option>
            </select>
          </label>
          <label className="text-xs">
            Template (chave)
            <input
              className="mt-1 w-full rounded border p-2 text-sm"
              value={form.template_chave}
              onChange={(e) => setForm({ ...form, template_chave: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Versão (vazio = ativa)
            <input
              className="mt-1 w-full rounded border p-2 text-sm"
              type="number"
              min={1}
              value={form.template_versao}
              onChange={(e) => setForm({ ...form, template_versao: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Prioridade
            <input
              className="mt-1 w-full rounded border p-2 text-sm"
              type="number"
              min={0}
              max={1000}
              value={form.prioridade}
              onChange={(e) => setForm({ ...form, prioridade: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs">
            Cooldown (segundos)
            <input
              className="mt-1 w-full rounded border p-2 text-sm"
              type="number"
              min={0}
              max={604800}
              value={form.cooldown_seconds}
              onChange={(e) => setForm({ ...form, cooldown_seconds: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Ligar regra ao criar
        </label>
        <button
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={
            !canMutate ||
            mut.isPending ||
            !form.template_chave ||
            ((isAdmEvent || form.estrategia === "by_role") && !form.perfil)
          }
          onClick={() => mut.mutate()}
          title={!canMutate ? "Somente administrador pode criar/alterar regras" : ""}
        >
          Criar regra
        </button>
        {!canMutate && <p className="text-xs text-muted-foreground">Modo somente leitura (gestor).</p>}
        {mut.error && <p className="text-destructive">Erro: {(mut.error as Error).message}</p>}
      </div>

      <div className="rounded-md border p-4">
        <h2 className="font-medium mb-2">Regras existentes</h2>
        {q.isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {q.error && <p className="text-destructive">Erro: {q.error.message}</p>}
        {q.data && q.data.length === 0 && <p className="text-muted-foreground">Nenhuma regra cadastrada.</p>}
        <ul className="divide-y">
          {(q.data ?? []).map((r) => (
            <li key={r.id} className="py-2 flex items-center gap-3">
              <span className="font-mono text-xs">{r.event_key}</span>
              <span className="text-xs">{r.estrategia}</span>
              <span className="text-xs">{r.canal}</span>
              <code className="text-xs">
                {r.template_chave}
                {r.template_versao ? ` v${r.template_versao}` : " (ativa)"}
              </code>
              <span className="text-xs text-muted-foreground">perfil {r.perfil ?? "—"}</span>
              <span className="ml-auto flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-xs border ${r.enabled ? "bg-primary/10" : ""}`}>
                  {r.enabled ? "ligada" : "desligada"}
                </span>
                <button className="text-xs underline disabled:opacity-40" disabled={!canMutate} onClick={() => toggle.mutate(r)}>
                  {r.enabled ? "Desligar" : "Ligar"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// -------------------- Fila / eventos --------------------

function FilaPanel() {
  const [page, setPage] = useState(0);
  // Fase 4: filtros locais por canal e provider_delivery_status (dados já em memória).
  const [fCanal, setFCanal] = useState<"" | ComunicacaoCanal>("");
  const [fDelivery, setFDelivery] = useState<"" | "sent" | "delivered" | "read" | "failed" | "deleted">("");
  const evs = useQuery<ComunicacaoEvento[], Error>({ queryKey: ["comm", "eventos", page], queryFn: () => listEvents(page) });
  const out = useQuery<ComunicacaoOutbox[], Error>({ queryKey: ["comm", "outbox", page], queryFn: () => listOutbox(page) });
  const rows = (out.data ?? []).filter((o) =>
    (fCanal === "" || o.canal === fCanal) &&
    (fDelivery === "" || (o.provider_delivery_status ?? null) === fDelivery),
  );
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
        <div className="mb-2 flex items-center gap-2">
          <h2 className="font-medium">Outbox</h2>
          <select
            className="ml-auto rounded border bg-background px-1 py-0.5 text-xs"
            value={fCanal}
            onChange={(e) => setFCanal(e.target.value as "" | ComunicacaoCanal)}
            aria-label="Filtrar por canal"
          >
            <option value="">canal: todos</option>
            <option value="email">email</option>
            <option value="whatsapp">whatsapp</option>
            <option value="in_app">in_app</option>
            <option value="push">push</option>
          </select>
          <select
            className="rounded border bg-background px-1 py-0.5 text-xs"
            value={fDelivery}
            onChange={(e) => setFDelivery(e.target.value as typeof fDelivery)}
            aria-label="Filtrar por status do provedor"
          >
            <option value="">provedor: todos</option>
            <option value="sent">sent</option>
            <option value="delivered">delivered</option>
            <option value="read">read</option>
            <option value="failed">failed</option>
            <option value="deleted">deleted</option>
          </select>
        </div>
        {out.isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {out.error && <p className="text-destructive">Erro: {out.error.message}</p>}
        <ul className="divide-y">
          {rows.map((o) => (
            <li key={o.id} className="py-1 flex justify-between gap-2">
              <span className="font-mono text-xs">{o.template_chave} v{o.template_versao}</span>
              <span className="text-xs">
                {o.canal} · {o.status} · tent={o.attempts}
                {o.provider_delivery_status ? (
                  <> · <span title={o.provider_status_at ?? ""}>prov:{o.provider_delivery_status}</span></>
                ) : null}
                {o.canal === "whatsapp" && o.error_code ? (
                  <> · <span className="text-destructive">{o.error_code}</span></>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-2 flex gap-2">
        <button className="rounded border px-2 py-1 text-xs" onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← anterior</button>
        <button className="rounded border px-2 py-1 text-xs" onClick={() => setPage(page + 1)}>próxima →</button>
        <span className="text-xs text-muted-foreground self-center">página {page + 1}</span>
      </div>
      <DlqAdminSection />
    </section>
  );
}

// -------------------- DLQ / Métricas (admin) --------------------

function DlqAdminSection() {
  const auth = useAuth();
  const isAdmin = (auth.roles ?? []).includes("administrador" as never);
  const qc = useQueryClient();
  const metrics = useQuery({
    queryKey: ["comm", "outbox-metrics"],
    queryFn: () => fetchOutboxMetrics(),
    enabled: isAdmin,
    refetchInterval: 30_000,
  });
  const dlq = useQuery({
    queryKey: ["comm", "dead-letter"],
    queryFn: () => listDeadLetter(50, 0),
    enabled: isAdmin,
  });
  const replay = useMutation({
    mutationFn: (id: string) => replayDeadLetterItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm", "dead-letter"] });
      qc.invalidateQueries({ queryKey: ["comm", "outbox-metrics"] });
      qc.invalidateQueries({ queryKey: ["comm", "outbox"] });
    },
  });
  const replayBatch = useMutation({
    mutationFn: () => replayDeadLetterBatch(10),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comm", "dead-letter"] });
      qc.invalidateQueries({ queryKey: ["comm", "outbox-metrics"] });
      qc.invalidateQueries({ queryKey: ["comm", "outbox"] });
    },
  });

  if (!isAdmin) return null;

  const m = metrics.data;
  const rows = dlq.data ?? [];

  return (
    <div className="md:col-span-2 grid gap-4">
      <div className="rounded-md border p-4">
        <h2 className="font-medium mb-2">Métricas do outbox</h2>
        {metrics.isLoading && <p className="text-muted-foreground text-xs">Carregando…</p>}
        {metrics.error && <p className="text-destructive text-xs">Erro: {(metrics.error as Error).message}</p>}
        {m && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <MetricBox label="dead_letter" value={m.dead_letter_count} tone={m.dead_letter_count > 0 ? "warn" : "ok"} />
            <MetricBox label="pending" value={m.pending_count} />
            <MetricBox label="tentativas média (terminal)" value={m.avg_attempts_terminal} />
            <MetricBox label="latência média (ms) — sent" value={m.avg_latency_ms_sent} />
            <div className="col-span-2 md:col-span-4 text-muted-foreground">
              <span className="mr-2">por status: {formatCounts(m.by_status)}</span>
              <span>por canal: {formatCounts(m.by_canal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-md border p-4">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="font-medium">Fila morta (dead-letter)</h2>
          <button
            className="ml-auto rounded border px-2 py-1 text-xs disabled:opacity-50"
            disabled={replayBatch.isPending || rows.length === 0}
            onClick={() => {
              if (!globalThis.confirm("Reenviar até 10 itens da fila morta agora?")) return;
              replayBatch.mutate();
            }}
          >
            {replayBatch.isPending ? "Reenviando…" : "Reenviar lote (10)"}
          </button>
        </div>
        {dlq.isLoading && <p className="text-muted-foreground text-xs">Carregando…</p>}
        {dlq.error && <p className="text-destructive text-xs">Erro: {(dlq.error as Error).message}</p>}
        {!dlq.isLoading && rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum item na fila morta.</p>
        )}
        <ul className="divide-y">
          {rows.map((it) => (
            <li key={it.id} className="py-2 flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
              <span className="font-mono text-xs">{it.template_chave} v{it.template_versao}</span>
              <span className="text-xs">{it.canal} · tent={it.attempts}/{it.max_attempts}</span>
              <span className="text-xs text-destructive truncate max-w-[24rem]" title={it.error_message ?? ""}>
                {it.error_code ?? "sem_codigo"}: {(it.error_message ?? "").slice(0, 120)}
              </span>
              <button
                className="md:ml-auto rounded border px-2 py-1 text-xs disabled:opacity-50"
                disabled={replay.isPending}
                onClick={() => {
                  if (!globalThis.confirm(`Reenviar item ${it.template_chave}?`)) return;
                  replay.mutate(it.id);
                }}
              >
                {replay.isPending ? "…" : "Reenviar"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricBox({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  const cls = tone === "warn" ? "border-destructive/40" : "border-border";
  return (
    <div className={`rounded border ${cls} p-2`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}

function formatCounts(o: Record<string, number> | undefined): string {
  if (!o) return "—";
  const parts = Object.entries(o).map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(" · ") : "—";
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
