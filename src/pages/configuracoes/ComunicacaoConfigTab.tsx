import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  CheckCircle2, CircleX, Copy, Eye, EyeOff, Info, Mail, MessageCircle, PlugZap, Save, ShieldAlert,
  ShieldCheck, Trash2, Webhook,
} from "lucide-react";
import {
  smtpSchema,
  whatsappSchemaFor,
  webhookSecretSchema,
  validateEmailsCsv,
  validatePhonesCsv,
  zodToFieldErrors,
  type SmtpFieldErrors,
  type WhatsappFieldErrors,
} from "./comunicacaoValidation";

type ProviderView = {
  ok: boolean;
  test_mode_enabled: boolean;
  allowed_emails_count: number;
  allowed_phones_count: number;
  allowed_emails_masked: string[];
  allowed_phones_masked: string[];
  flags: {
    delivery_enabled: boolean;
    email_delivery_enabled: boolean;
    whatsapp_delivery_enabled: boolean;
    inapp_delivery_enabled: boolean;
    whatsapp_webhook_enabled: boolean;
  };
  smtp: { host: string | null; port: number | null; user: string | null; from: string | null; password_configured: boolean };
  smtp_readiness: {
    singleton_exists: boolean;
    delivery_enabled: boolean;
    email_delivery_enabled: boolean;
    test_mode_enabled: boolean;
    allowed_email_count: number;
    test_email_allowlisted: boolean;
    smtp_host_configured: boolean;
    smtp_port_configured: boolean;
    smtp_port_runtime_compatible: boolean;
    smtp_user_configured: boolean;
    smtp_password_configured: boolean;
    smtp_from_configured: boolean;
    ready_for_controlled_test: boolean;
    blocking_code: "smtp_port_blocked_by_edge_runtime" | null;
  };
  whatsapp: { phone_number_id: string | null; api_version: string | null; access_token_configured: boolean; allowed_api_versions: string[] };
  webhook: { app_secret_configured: boolean; verify_token_configured: boolean; url: string };
  updated_at: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sessão expirada ou sem permissão.",
  forbidden: "Apenas o Superadmin de Plataforma pode alterar essa configuração.",
  authorization_check_failed: "Não foi possível validar a permissão de plataforma.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.",
  invalid_payload: "Dados inválidos — revise os campos destacados.",
  invalid_json: "Payload inválido.",
  invalid_smtp: "Configuração SMTP inválida.",
  invalid_smtp_from: "Remetente SMTP inválido — informe um e-mail válido.",
  invalid_smtp_port: "Porta SMTP inválida — use um número entre 1 e 65535.",
  invalid_whatsapp: "Configuração WhatsApp inválida.",
  invalid_phone_number_id: "Phone Number ID inválido — use somente dígitos.",
  invalid_api_version: "Versão da API não suportada.",
  invalid_webhook: "Configuração de webhook inválida.",
  invalid_allowed_emails: "Lista de e-mails inválida.",
  invalid_allowed_phones: "Lista de telefones inválida (use E.164).",
  invalid_slot: "Slot de segredo inválido.",
  smtp_password_too_long: "Senha SMTP acima do limite (máx 4096).",
  access_token_too_long: "Access Token acima do limite (máx 8192).",
  app_secret_too_long: "App Secret acima do limite (máx 4096).",
  verify_token_too_long: "Verify Token acima do limite (máx 1024).",
  confirmation_required: "Confirmação explícita obrigatória para ativar esta opção.",
  confirmation_required_disable_test_mode: "Confirmação obrigatória para desativar o Test mode.",
  test_mode_off_requires_email_provider: "Configure o provedor de e-mail antes de desativar o Test mode.",
  test_mode_off_requires_whatsapp_provider: "Configure o provedor de WhatsApp antes de desativar o Test mode.",
  email_enabled_requires_provider_configured: "Configure host, porta, usuário, remetente e senha SMTP antes de ativar a entrega de e-mail.",
  whatsapp_enabled_requires_provider_configured: "Configure Phone Number ID, versão e Access Token antes de ativar a entrega de WhatsApp.",
  settings_row_missing: "Registro de configuração ausente. Contate o suporte.",
  vault_error: "Falha ao gravar segredo com segurança. Tente novamente.",
  atomic_apply_failed: "Falha ao aplicar as alterações. Nenhuma mudança foi persistida.",
  empty_payload: "Nada para salvar.",
  origin_not_allowed: "Origem não autorizada.",
  not_configured: "Serviço não configurado no ambiente.",
  recipient_not_allowed: "Destinatário não autorizado para este teste controlado.",
  smtp_not_ready: "O SMTP ainda não atende a todos os itens de prontidão.",
  smtp_port_blocked_by_edge_runtime: "Porta SMTP incompatível com o runtime. Use uma porta permitida suportada pelo provedor ou uma integração HTTP.",
  smtp_test_failed: "O provedor não aceitou o teste. Revise a configuração e tente novamente.",
  invalid_mode: "Modo de diagnóstico inválido.",
  smtp_connection_ok: "Conexão segura e autenticação confirmadas.",
  smtp_connect_timeout: "O provedor não respondeu dentro do tempo seguro.",
  smtp_connect_failed: "Não foi possível conectar ao provedor.",
  smtp_dns_failed: "Não foi possível localizar o endereço do provedor.",
  smtp_tcp_refused: "O provedor recusou a conexão na porta configurada.",
  smtp_tcp_unreachable: "A rede não conseguiu alcançar o provedor.",
  smtp_tls_certificate_failed: "O certificado TLS do provedor não pôde ser validado.",
  smtp_tls_handshake_failed: "O provedor não concluiu a negociação TLS.",
  smtp_tls_failed: "Não foi possível estabelecer a conexão criptografada.",
  smtp_greeting_failed: "O servidor não apresentou uma resposta SMTP válida.",
  smtp_ehlo_failed: "O servidor não concluiu a negociação SMTP.",
  smtp_starttls_unavailable: "O servidor não oferece criptografia STARTTLS nesta porta.",
  smtp_starttls_failed: "A negociação STARTTLS falhou.",
  smtp_auth_unsupported: "O provedor não anunciou um método de autenticação compatível.",
  smtp_auth_failed: "O provedor recusou a autenticação.",
  smtp_protocol_error: "O servidor retornou uma resposta SMTP incompatível.",
  smtp_config_invalid: "A configuração SMTP está incompleta ou inválida.",
  smtp_send_accepted: "O servidor SMTP aceitou o envio.",
  email_send_ambiguous: "Não foi possível confirmar se o servidor SMTP aceitou o envio.",
  email_send_timeout: "O provedor não respondeu dentro do tempo seguro.",
  unknown_error: "Erro inesperado. Tente novamente.",
};

function friendlyError(code: string, status?: number): string {
  const base = ERROR_MESSAGES[code];
  if (base) return base;
  const prefix = status ? `HTTP ${status} · ` : "";
  return `${prefix}${code || "erro desconhecido"}.`;
}

const SMTP_STAGE_LABELS: Record<string, string> = {
  connect: "Conexão segura",
  greeting: "Saudação do servidor",
  ehlo: "Negociação SMTP",
  starttls: "Ativação do TLS",
  auth: "Autenticação",
  quit: "Encerramento",
};

function friendlyStage(stage: string): string {
  return SMTP_STAGE_LABELS[stage] ?? "Conexão SMTP";
}

const CONTROLLED_TEST_EMAIL = "teste@refilinformatica.com.br";

const FLAG_LABELS: Record<string, { title: string; help: string }> = {
  delivery_enabled: {
    title: "Entrega global",
    help: "Chave-mestra. Se estiver desligada, nenhum canal envia mensagens, independentemente das flags específicas.",
  },
  email_delivery_enabled: {
    title: "Entrega por e-mail (SMTP)",
    help: "Autoriza o worker a enviar e-mails pelo provedor SMTP configurado.",
  },
  whatsapp_delivery_enabled: {
    title: "Entrega por WhatsApp",
    help: "Autoriza o worker a enviar mensagens pela WhatsApp Cloud API (Meta).",
  },
  inapp_delivery_enabled: {
    title: "Notificações in-app",
    help: "Habilita entrega para o sino de notificações dentro do próprio sistema.",
  },
  whatsapp_webhook_enabled: {
    title: "Recibos do WhatsApp (webhook)",
    help: "Permite a Meta enviar recibos de entrega/leitura no endpoint público listado abaixo.",
  },
};

const SMTP_PRESETS: Array<{ label: string; port: string; hint: string }> = [
  { label: "465 · SSL/TLS implícito", port: "465", hint: "Utilizado por alguns provedores legados." },
  { label: "2525 · Alternativa", port: "2525", hint: "Fallback quando 587 é bloqueado pelo hosting." },
];

async function callSettings(method: "GET" | "PUT", body?: unknown): Promise<ProviderView> {
  const { data, error } = await supabase.functions.invoke("communication-provider-settings", {
    method,
    body: body ?? undefined,
    headers: { "Content-Type": "application/json" },
  });
  if (error) {
    const ctx = (error as unknown as { context?: { body?: unknown; status?: number } })?.context;
    const status = ctx?.status;
    let code = error.message;
    if (typeof ctx?.body === "string") {
      try { const j = JSON.parse(ctx.body); if (j?.error) code = j.error; } catch { /* keep */ }
    } else if (ctx?.body && typeof ctx.body === "object" && "error" in (ctx.body as object)) {
      code = String((ctx.body as { error: unknown }).error);
    }
    const err = new Error(code);
    (err as Error & { status?: number }).status = status;
    throw err;
  }
  if (!data?.ok) throw new Error((data as { error?: string } | null)?.error ?? "unknown_error");
  return data as ProviderView;
}

function SecretStatus({ configured }: { configured: boolean }) {
  return configured
    ? <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" />Configurado</Badge>
    : <Badge variant="outline">Não configurado</Badge>;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1"><Info className="h-3 w-3 mt-0.5 shrink-0" /><span>{children}</span></p>;
}

function SecretInput(props: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaInvalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={props.id}
        type={show ? "text" : "password"}
        autoComplete="new-password"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        aria-invalid={props.ariaInvalid}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Ocultar" : "Mostrar"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs font-mono">
      {children}
    </span>
  );
}

export default function ComunicacaoConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ProviderView | null>(null);
  const [testEmailTo] = useState(CONTROLLED_TEST_EMAIL);
  const [testEmailError, setTestEmailError] = useState<string | undefined>(undefined);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    ok: boolean; code: string; stage: string; tls: boolean; authenticated: boolean; latency_ms: number;
  } | null>(null);

  const testEmailSchema = z
    .string()
    .trim()
    .min(1, "Informe o e-mail do destinatário")
    .max(254, "E-mail muito longo (máx. 254 caracteres)")
    .email("E-mail inválido. Ex.: destinatario@exemplo.com");

  function validateTestEmail(value: string): string | undefined {
    const result = testEmailSchema.safeParse(value);
    return result.success ? undefined : result.error.issues[0]?.message;
  }
  const testEmailValid = !testEmailError && testEmailTo.trim().length > 0 && validateTestEmail(testEmailTo) === undefined;

  // Editable state
  const [emailsText, setEmailsText] = useState("");
  const [phonesText, setPhonesText] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<string>("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waApiVersion, setWaApiVersion] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [webhookAppSecret, setWebhookAppSecret] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");

  // Field-level errors
  const [emailsErr, setEmailsErr] = useState<string>("");
  const [phonesErr, setPhonesErr] = useState<string>("");
  const [smtpErrors, setSmtpErrors] = useState<SmtpFieldErrors>({});
  const [waErrors, setWaErrors] = useState<WhatsappFieldErrors>({});
  const [webhookAppSecretErr, setWebhookAppSecretErr] = useState<string>("");
  const [webhookVerifyErr, setWebhookVerifyErr] = useState<string>("");

  async function reload() {
    setLoading(true);
    try {
      const v = await callSettings("GET");
      setView(v);
      setSmtpHost(v.smtp.host ?? "");
      setSmtpPort(v.smtp.port != null ? String(v.smtp.port) : "");
      setSmtpUser(v.smtp.user ?? "");
      setSmtpFrom(v.smtp.from ?? "");
      setWaPhoneId(v.whatsapp.phone_number_id ?? "");
      setWaApiVersion(v.whatsapp.api_version ?? "");
      setEmailsText(""); setPhonesText("");
      setSmtpPassword(""); setWaAccessToken(""); setWebhookAppSecret(""); setWebhookVerifyToken("");
      setEmailsErr(""); setPhonesErr(""); setSmtpErrors({}); setWaErrors({});
      setWebhookAppSecretErr(""); setWebhookVerifyErr("");
    } catch (e: any) {
      toast.error("Erro ao carregar configurações", { description: friendlyError(e.message, e?.status) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function save(payload: Record<string, unknown>, successMsg: string, successDesc?: string) {
    setSaving(true);
    try {
      const v = await callSettings("PUT", payload);
      setView(v);
      toast.success(successMsg, successDesc ? { description: successDesc } : undefined);
      setSmtpPassword(""); setWaAccessToken(""); setWebhookAppSecret(""); setWebhookVerifyToken("");
      setEmailsText(""); setPhonesText("");
      return true;
    } catch (e: any) {
      toast.error("Falha ao salvar", { description: friendlyError(e.message, e?.status) });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(slot: string, label: string) {
    if (!confirm(`Remover permanentemente ${label}? Essa ação não pode ser desfeita.`)) return;
    await save({ action: "clear_secret", slot, confirm: "REMOVE" }, `${label} removido.`);
  }

  function handleSaveEmails() {
    const r = validateEmailsCsv(emailsText);
    if (r.ok) {
      setEmailsErr("");
      void save({ allowed_emails: r.value }, "Lista de e-mails atualizada", `${r.value.length} destinatário(s) permitido(s) em homologação.`);
    } else {
      setEmailsErr(r.error);
      toast.error("Lista de e-mails inválida", { description: r.error });
    }
  }

  function handleSavePhones() {
    const r = validatePhonesCsv(phonesText);
    if (r.ok) {
      setPhonesErr("");
      void save({ allowed_phones: r.value }, "Lista de telefones atualizada", `${r.value.length} número(s) permitido(s) em homologação.`);
    } else {
      setPhonesErr(r.error);
      toast.error("Lista de telefones inválida", { description: r.error });
    }
  }

  function handleSaveSmtp() {
    const parsed = smtpSchema.safeParse({
      host: smtpHost, port: smtpPort, user: smtpUser, from: smtpFrom,
      password: smtpPassword || undefined,
    });
    if (!parsed.success) {
      const errs = zodToFieldErrors(parsed.error) as SmtpFieldErrors;
      setSmtpErrors(errs);
      toast.error("Revise os campos do provedor de e-mail", { description: "Há campos obrigatórios ou inválidos." });
      return;
    }
    setSmtpErrors({});
    const desc = parsed.data.password
      ? "Host, porta, usuário, remetente e nova senha foram aplicados."
      : "Host, porta, usuário e remetente aplicados. A senha atual foi preservada.";
    void save(
      {
        smtp: {
          host: parsed.data.host,
          port: Number(parsed.data.port),
          user: parsed.data.user,
          from: parsed.data.from,
          ...(parsed.data.password ? { password: parsed.data.password } : {}),
        },
      },
      "Provedor de e-mail salvo",
      desc,
    );
  }

  async function callSmtpDiagnostic(payload: Record<string, unknown>) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error("unauthorized");
    const url = `${SUPABASE_URL}/functions/v1/test-communication-email`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify(payload),
    });
    const parsed = await resp.json().catch(() => ({})) as Record<string, unknown>;
    return { resp, parsed };
  }

  async function handleTestConnection() {
    if (testingConnection || testingEmail) return;
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const { resp, parsed } = await callSmtpDiagnostic({ mode: "connection" });
      const result = {
        ok: resp.ok && parsed.ok === true,
        code: typeof parsed.code === "string" ? parsed.code : "smtp_test_failed",
        stage: typeof parsed.stage === "string" ? parsed.stage : "connect",
        tls: parsed.tls === true,
        authenticated: parsed.authenticated === true,
        latency_ms: typeof parsed.latency_ms === "number" ? parsed.latency_ms : 0,
      };
      setConnectionResult(result);
      if (result.ok) {
        toast.success("Conexão do provedor confirmada", { description: `${friendlyError(result.code)} Latência: ${result.latency_ms} ms.` });
      } else {
        toast.error("Conexão não confirmada", { description: friendlyError(result.code, resp.status) });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "smtp_test_failed";
      toast.error("Diagnóstico não concluído", { description: friendlyError(code) });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleTestEmail() {
    if (testingEmail || testingConnection) return;
    const err = validateTestEmail(testEmailTo);
    if (err) {
      setTestEmailError(err);
      toast.error("Destinatário inválido", { description: err });
      return;
    }
    setTestEmailError(undefined);
    const to = testEmailTo.trim().toLowerCase();
    setTestingEmail(true);
    try {
      const { resp, parsed } = await callSmtpDiagnostic({ mode: "send", to, subject: "Teste SMTP Cultivo Farm", message: "E-mail de teste enviado pela aba Comunicação." });

      if (resp.ok && parsed.ok) {
        toast.success("Teste aceito pelo servidor SMTP", {
          description: "O aceite do servidor não comprova a entrega na caixa postal. Verifique a caixa de entrada e o spam.",
        });
      } else {
        const errorCode = typeof parsed.error === "string" && ERROR_MESSAGES[parsed.error]
          ? parsed.error
          : "smtp_test_failed";
        toast.error("Teste SMTP não concluído", { description: friendlyError(errorCode, resp.status) });
      }
    } catch {
      toast.error("Erro de rede ao testar SMTP", { description: "Não foi possível concluir a chamada segura." });
    } finally {
      setTestingEmail(false);
    }
  }

  function handleSaveWhatsapp() {
    if (!view) return;
    const schema = whatsappSchemaFor(view.whatsapp.allowed_api_versions);
    const parsed = schema.safeParse({
      phone_number_id: waPhoneId,
      api_version: waApiVersion,
      access_token: waAccessToken || undefined,
    });
    if (!parsed.success) {
      const errs = zodToFieldErrors(parsed.error) as WhatsappFieldErrors;
      setWaErrors(errs);
      toast.error("Revise os campos do WhatsApp", { description: "Há campos obrigatórios ou inválidos." });
      return;
    }
    setWaErrors({});
    const desc = parsed.data.access_token
      ? "Phone Number ID, versão e novo Access Token foram aplicados."
      : "Phone Number ID e versão aplicados. O Access Token atual foi preservado.";
    void save(
      {
        whatsapp: {
          phone_number_id: parsed.data.phone_number_id,
          api_version: parsed.data.api_version,
          ...(parsed.data.access_token ? { access_token: parsed.data.access_token } : {}),
        },
      },
      "WhatsApp Cloud API salvo",
      desc,
    );
  }

  function handleSaveWebhook() {
    let hasErr = false;
    if (webhookAppSecret) {
      const r = webhookSecretSchema.safeParse(webhookAppSecret);
      if (!r.success) { setWebhookAppSecretErr(r.error.issues[0]?.message ?? "Valor inválido"); hasErr = true; }
      else setWebhookAppSecretErr("");
    } else setWebhookAppSecretErr("");
    if (webhookVerifyToken) {
      const r = webhookSecretSchema.safeParse(webhookVerifyToken);
      if (!r.success) { setWebhookVerifyErr(r.error.issues[0]?.message ?? "Valor inválido"); hasErr = true; }
      else setWebhookVerifyErr("");
    } else setWebhookVerifyErr("");
    if (!webhookAppSecret && !webhookVerifyToken) {
      toast.error("Nada a salvar", { description: "Preencha o App Secret e/ou o Verify Token." });
      return;
    }
    if (hasErr) {
      toast.error("Segredos inválidos", { description: "Cada segredo precisa ter entre 16 e 512 caracteres." });
      return;
    }
    const changed = [webhookAppSecret ? "App Secret" : null, webhookVerifyToken ? "Verify Token" : null].filter(Boolean).join(" e ");
    void save(
      {
        webhook: {
          ...(webhookAppSecret ? { app_secret: webhookAppSecret } : {}),
          ...(webhookVerifyToken ? { verify_token: webhookVerifyToken } : {}),
        },
      },
      "Webhook atualizado",
      `${changed} gravado(s) com segurança no cofre.`,
    );
  }

  const anyFlagOn = useMemo(() => {
    if (!view) return false;
    return view.flags.delivery_enabled || view.flags.email_delivery_enabled ||
      view.flags.whatsapp_delivery_enabled || view.flags.inapp_delivery_enabled ||
      view.flags.whatsapp_webhook_enabled;
  }, [view]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando configurações…</div>;
  if (!view) return <div className="p-6 text-sm text-destructive">Falha ao carregar.</div>;

  const emailsList = emailsText.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const phonesList = phonesText.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const connectionConfigReady = view.smtp_readiness.singleton_exists &&
    view.smtp_readiness.smtp_host_configured &&
    view.smtp_readiness.smtp_port_configured &&
    view.smtp_readiness.smtp_port_runtime_compatible &&
    view.smtp_readiness.smtp_user_configured &&
    view.smtp_readiness.smtp_password_configured &&
    view.smtp_readiness.smtp_from_configured;
  const controlledSendBlockReason = !view.smtp_readiness.smtp_port_runtime_compatible
    ? "A porta configurada não é compatível com o ambiente de execução."
    : !connectionConfigReady || !view.smtp_readiness.smtp_from_configured
      ? "Complete a configuração técnica do provedor."
      : !view.smtp_readiness.test_mode_enabled
        ? "Ative o modo de homologação."
        : !view.smtp_readiness.test_email_allowlisted
          ? "Inclua o destinatário controlado na lista permitida."
          : !view.smtp_readiness.delivery_enabled || !view.smtp_readiness.email_delivery_enabled
            ? "As entregas global e por e-mail permanecem desativadas."
            : "A prontidão completa ainda não foi confirmada.";

  return (
    <div className="space-y-4">
      {/* Estado geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Estado dos provedores</CardTitle>
          <CardDescription>
            Painel somente-leitura. As senhas e tokens ficam no cofre e nunca são exibidos — apenas o status
            <em> configurado / não configurado</em> aparece aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>Modo homologação (Test mode):</span>
            <Badge variant={view.test_mode_enabled ? "default" : "destructive"}>
              {view.test_mode_enabled ? "Ativo — envios restritos" : "DESATIVADO — envios reais"}
            </Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>E-mails permitidos:</span> <Badge variant="outline">{view.allowed_emails_count}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>Telefones permitidos:</span> <Badge variant="outline">{view.allowed_phones_count}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>Entrega global:</span>
            <Badge variant={view.flags.delivery_enabled ? "default" : "outline"}>{view.flags.delivery_enabled ? "ON" : "OFF"}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>E-mail:</span>
            <Badge variant={view.flags.email_delivery_enabled ? "default" : "outline"}>{view.flags.email_delivery_enabled ? "ON" : "OFF"}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>WhatsApp:</span>
            <Badge variant={view.flags.whatsapp_delivery_enabled ? "default" : "outline"}>{view.flags.whatsapp_delivery_enabled ? "ON" : "OFF"}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>In-app (sino):</span>
            <Badge variant={view.flags.inapp_delivery_enabled ? "default" : "outline"}>{view.flags.inapp_delivery_enabled ? "ON" : "OFF"}</Badge>
          </div>
          <div className="flex items-center justify-between md:justify-start md:gap-2">
            <span>Webhook WhatsApp:</span>
            <Badge variant={view.flags.whatsapp_webhook_enabled ? "default" : "outline"}>{view.flags.whatsapp_webhook_enabled ? "ON" : "OFF"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Prontidão SMTP para homologação</CardTitle>
          <CardDescription>Validação somente-leitura para o teste controlado. Nenhuma credencial ou referência secreta é exibida.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {[
              ["Singleton presente", view.smtp_readiness.singleton_exists],
              ["Host configurado", view.smtp_readiness.smtp_host_configured],
              ["Porta configurada", view.smtp_readiness.smtp_port_configured],
              ["Porta compatível com o runtime", view.smtp_readiness.smtp_port_runtime_compatible],
              ["Usuário configurado", view.smtp_readiness.smtp_user_configured],
              ["Senha configurada", view.smtp_readiness.smtp_password_configured],
              ["Remetente configurado", view.smtp_readiness.smtp_from_configured],
              ["Test mode ativo", view.smtp_readiness.test_mode_enabled],
              [`${CONTROLLED_TEST_EMAIL} na allowlist`, view.smtp_readiness.test_email_allowlisted],
              ["Entrega global ativa", view.smtp_readiness.delivery_enabled],
              ["Entrega por e-mail ativa", view.smtp_readiness.email_delivery_enabled],
            ].map(([label, ready]) => (
              <div key={String(label)} className="flex items-center gap-2 rounded-md border p-2">
                <CheckCircle2 className={`h-4 w-4 shrink-0 ${ready ? "text-success" : "text-muted-foreground"}`} aria-hidden="true" />
                <span className={ready ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                <Badge variant={ready ? "default" : "outline"} className="ml-auto">{ready ? "OK" : "Pendente"}</Badge>
              </div>
            ))}
          </div>
          {view.smtp_readiness.blocking_code === "smtp_port_blocked_by_edge_runtime" && (
            <p className="text-sm text-destructive" role="alert">
              Porta SMTP incompatível com o runtime. Use uma porta permitida suportada pelo provedor ou uma integração HTTP.
            </p>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between border-t pt-4">
            <span className="text-sm text-muted-foreground">
              {!view.smtp_readiness.delivery_enabled || !view.smtp_readiness.email_delivery_enabled
                ? "Configuração preservada; envio bloqueado."
                : "As flags de entrega foram habilitadas deliberadamente."}
            </span>
            <Badge variant={view.smtp_readiness.ready_for_controlled_test ? "default" : "outline"}>
              {view.smtp_readiness.ready_for_controlled_test ? "Pronto para teste controlado" : "Não pronto"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Homologação */}
      <Card>
        <CardHeader>
          <CardTitle>Modo homologação e listas permitidas</CardTitle>
          <CardDescription>
            Enquanto o <strong>Test mode</strong> estiver ativo, o sistema só envia para os e-mails e telefones cadastrados
            abaixo. Se a lista do canal estiver vazia, nada sai — nem em produção. Ideal para testes controlados antes de liberar
            envios reais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <Label className="font-medium">Test mode</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado durante a homologação. Desative apenas quando estiver pronto para envios reais em produção.
              </p>
            </div>
            <Switch checked={view.test_mode_enabled} onCheckedChange={(b) => {
              if (!b) {
                if (!confirm("Desativar o Test mode permite envios REAIS a qualquer destinatário. Confirmar?")) return;
                void save({ test_mode_enabled: false, confirm_disable_test_mode: "I_UNDERSTAND_REAL_SENDS" }, "Test mode desativado", "Envios reais liberados — revise as flags e as allowlists.");
              } else {
                void save({ test_mode_enabled: true }, "Test mode ativado", "Envios ficam restritos aos destinatários da allowlist.");
              }
            }} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emails-allow">E-mails permitidos em homologação</Label>
            <Textarea
              id="emails-allow"
              value={emailsText}
              onChange={(e) => { setEmailsText(e.target.value); if (emailsErr) setEmailsErr(""); }}
              placeholder="fulano@empresa.com, ciclano@empresa.com"
              rows={2}
              aria-invalid={!!emailsErr}
            />
            <FieldError msg={emailsErr} />
            <FieldHint>
              Separe por vírgula, ponto-e-vírgula ou espaço. Máximo 100 endereços. <strong>Salvar substitui</strong> a lista atual.
            </FieldHint>
            {emailsList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {emailsList.slice(0, 20).map((e) => <Chip key={e}>{e}</Chip>)}
                {emailsList.length > 20 && <Chip>+{emailsList.length - 20}</Chip>}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Cadastrados hoje (mascarados): {view.allowed_emails_masked.length > 0 ? view.allowed_emails_masked.join(", ") : "— nenhum —"}
            </div>
            <Button size="sm" disabled={saving || !emailsText.trim()} onClick={handleSaveEmails}>
              Substituir lista de e-mails
            </Button>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="phones-allow">Telefones permitidos em homologação (formato E.164)</Label>
            <Textarea
              id="phones-allow"
              value={phonesText}
              onChange={(e) => { setPhonesText(e.target.value); if (phonesErr) setPhonesErr(""); }}
              placeholder="+5511999999999, +5511888888888"
              rows={2}
              aria-invalid={!!phonesErr}
            />
            <FieldError msg={phonesErr} />
            <FieldHint>
              E.164 = sinal <code>+</code>, código do país e DDD sem espaços (ex.: <code>+5511987654321</code>). Máximo 100 números.
            </FieldHint>
            {phonesList.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {phonesList.slice(0, 20).map((p) => <Chip key={p}>{p}</Chip>)}
                {phonesList.length > 20 && <Chip>+{phonesList.length - 20}</Chip>}
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              Cadastrados hoje (mascarados): {view.allowed_phones_masked.length > 0 ? view.allowed_phones_masked.join(", ") : "— nenhum —"}
            </div>
            <Button size="sm" disabled={saving || !phonesText.trim()} onClick={handleSavePhones}>
              Substituir lista de telefones
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* SMTP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-4 w-4" /> Provedor de e-mail (SMTP)</CardTitle>
          <CardDescription>
            Preencha os dados do seu servidor SMTP (ex.: SendGrid, Amazon SES, Mailgun, Zoho, Google Workspace).
            A senha fica em cofre criptografado — ao editar, deixe em branco para <strong>preservar</strong> a senha atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="smtp-host">Servidor (host)</Label>
              <Input
                id="smtp-host"
                value={smtpHost}
                onChange={(e) => { setSmtpHost(e.target.value); if (smtpErrors.host) setSmtpErrors({ ...smtpErrors, host: undefined }); }}
                placeholder="smtp.seuprovedor.com.br"
                aria-invalid={!!smtpErrors.host}
                autoComplete="off"
              />
              <FieldError msg={smtpErrors.host} />
              <FieldHint>Endereço fornecido pelo seu provedor — normalmente começa com <code>smtp.</code>.</FieldHint>
            </div>
            <div>
              <Label htmlFor="smtp-port">Porta</Label>
              <Input
                id="smtp-port"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                value={smtpPort}
                onChange={(e) => { setSmtpPort(e.target.value); if (smtpErrors.port) setSmtpErrors({ ...smtpErrors, port: undefined }); }}
                placeholder="587"
                aria-invalid={!!smtpErrors.port}
              />
              <FieldError msg={smtpErrors.port} />
              <div className="flex flex-wrap gap-1 mt-2">
                {SMTP_PRESETS.map((p) => (
                  <Button
                    key={p.port}
                    type="button"
                    size="sm"
                    variant={smtpPort === p.port ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => { setSmtpPort(p.port); if (smtpErrors.port) setSmtpErrors({ ...smtpErrors, port: undefined }); }}
                    title={p.hint}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="smtp-user">Usuário (login SMTP)</Label>
              <Input
                id="smtp-user"
                value={smtpUser}
                onChange={(e) => { setSmtpUser(e.target.value); if (smtpErrors.user) setSmtpErrors({ ...smtpErrors, user: undefined }); }}
                autoComplete="username"
                placeholder="apikey ou usuário@dominio.com"
                aria-invalid={!!smtpErrors.user}
              />
              <FieldError msg={smtpErrors.user} />
              <FieldHint>Alguns provedores usam a palavra fixa <code>apikey</code> (ex.: SendGrid). Outros pedem o e-mail completo.</FieldHint>
            </div>
            <div>
              <Label htmlFor="smtp-from">E-mail remetente (from)</Label>
              <Input
                id="smtp-from"
                type="email"
                value={smtpFrom}
                onChange={(e) => { setSmtpFrom(e.target.value); if (smtpErrors.from) setSmtpErrors({ ...smtpErrors, from: undefined }); }}
                placeholder="nao-responda@suaempresa.com.br"
                aria-invalid={!!smtpErrors.from}
                autoComplete="email"
              />
              <FieldError msg={smtpErrors.from} />
              <FieldHint>
                Endereço que aparece para o destinatário. Precisa estar verificado no seu provedor (SPF/DKIM) para evitar caixa de spam.
              </FieldHint>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Label htmlFor="smtp-password" className="min-w-40">Senha ou API Key</Label>
              <SecretStatus configured={view.smtp.password_configured} />
              {view.smtp.password_configured && (
                <Button size="sm" variant="outline" onClick={() => clearSecret("smtp_password", "Senha SMTP")}>
                  <Trash2 className="h-3 w-3 mr-1" />Remover
                </Button>
              )}
            </div>
            <SecretInput
              id="smtp-password"
              value={smtpPassword}
              onChange={setSmtpPassword}
              placeholder={view.smtp.password_configured ? "•••••••• (deixe em branco para preservar)" : "Cole a senha SMTP ou API Key"}
            />
            <FieldHint>
              A senha é gravada no cofre <code>vault</code> do Supabase e nunca sai do servidor. O worker só a lê no momento do envio.
            </FieldHint>
          </div>

          <Button disabled={saving} onClick={handleSaveSmtp}>
            <Save className="h-4 w-4 mr-1" />Salvar provedor de e-mail
          </Button>

          <Separator />

          <section className="space-y-3" aria-labelledby="smtp-connection-title">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div>
                <h3 id="smtp-connection-title" className="text-sm font-semibold">Testar conexão do provedor</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Verifica rede, TLS, protocolo SMTP e autenticação. Nenhum e-mail é enviado.
                </p>
                {!connectionConfigReady && (
                  <p className="mt-1 text-xs text-muted-foreground" role="status">
                    Complete a configuração segura do provedor para liberar este diagnóstico.
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={testingConnection || testingEmail || !connectionConfigReady}
                onClick={handleTestConnection}
                aria-busy={testingConnection}
              >
                <PlugZap className="mr-1 h-4 w-4" />
                {testingConnection ? "Testando conexão..." : "Testar conexão"}
              </Button>
            </div>
            {connectionResult && (
              <div aria-live="polite" role="status" className="flex items-start gap-2 rounded-md border p-3 text-sm">
                {connectionResult.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <div className="min-w-0">
                  <p className="font-medium">{connectionResult.ok ? "Conectado e autenticado" : "Falhou"}</p>
                  <p className="text-xs text-muted-foreground">
                    {friendlyStage(connectionResult.stage)} · {friendlyError(connectionResult.code)} · {connectionResult.latency_ms} ms
                  </p>
                </div>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3" aria-labelledby="smtp-send-test-title">
            <div>
              <h3 id="smtp-send-test-title" className="text-sm font-semibold">Enviar e-mail de teste</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Este é um envio real para o destinatário fixo abaixo e exige confirmação explícita. O sucesso significa que o servidor SMTP aceitou a mensagem, não que ela chegou à caixa postal.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                id="smtp-test-to"
                type="email"
                value={testEmailTo}
                readOnly
                autoComplete="off"
                maxLength={254}
                aria-invalid={!!testEmailError}
                aria-describedby={testEmailError ? "smtp-test-to-error" : undefined}
              />
              <Button
                variant="outline"
                disabled={testingEmail || testingConnection || !testEmailValid || !view.smtp_readiness.ready_for_controlled_test}
                onClick={() => setConfirmSendOpen(true)}
                aria-busy={testingEmail}
              >
                <Mail className="mr-1 h-4 w-4" />
                {testingEmail ? "Enviando..." : "Enviar e-mail de teste"}
              </Button>
            </div>
            <FieldError msg={testEmailError} />
            {!view.smtp_readiness.ready_for_controlled_test && (
              <p className="text-xs text-muted-foreground" role="status">
                Envio bloqueado: {controlledSendBlockReason}
              </p>
            )}
          </section>

        </CardContent>
      </Card>

      <AlertDialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar envio real de teste?</AlertDialogTitle>
            <AlertDialogDescription>
              Uma mensagem será enviada exclusivamente ao destinatário controlado. O sucesso confirma apenas o aceite pelo servidor SMTP, não a entrega na caixa postal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleTestEmail()}>Confirmar envio</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><MessageCircle className="h-4 w-4" /> WhatsApp Cloud API (Meta)</CardTitle>
          <CardDescription>
            Integração oficial da Meta via <a href="https://developers.facebook.com/docs/whatsapp/cloud-api" target="_blank" rel="noreferrer" className="underline">WhatsApp Cloud API</a>.
            Você precisa de uma conta WhatsApp Business no Meta for Developers com o número de telefone já verificado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wa-phone">Phone Number ID</Label>
              <Input
                id="wa-phone"
                inputMode="numeric"
                value={waPhoneId}
                onChange={(e) => { setWaPhoneId(e.target.value); if (waErrors.phone_number_id) setWaErrors({ ...waErrors, phone_number_id: undefined }); }}
                placeholder="Ex.: 123456789012345"
                aria-invalid={!!waErrors.phone_number_id}
              />
              <FieldError msg={waErrors.phone_number_id} />
              <FieldHint>
                Localizado em <em>Meta for Developers → seu app → WhatsApp → API Setup</em>. É um número longo, apenas dígitos.
              </FieldHint>
            </div>
            <div>
              <Label htmlFor="wa-version">Versão da API</Label>
              <Select
                value={waApiVersion || undefined}
                onValueChange={(v) => { setWaApiVersion(v); if (waErrors.api_version) setWaErrors({ ...waErrors, api_version: undefined }); }}
              >
                <SelectTrigger id="wa-version" aria-invalid={!!waErrors.api_version}>
                  <SelectValue placeholder="Selecione a versão" />
                </SelectTrigger>
                <SelectContent>
                  {view.whatsapp.allowed_api_versions.map((v) => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError msg={waErrors.api_version} />
              <FieldHint>
                Homologadas:{" "}
                {view.whatsapp.allowed_api_versions.map((v, i) => (
                  <span key={v}>{i > 0 ? " · " : ""}<Chip>{v}</Chip></span>
                ))}
                . Use a mais recente compatível com seu app na Meta.
              </FieldHint>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Label htmlFor="wa-token" className="min-w-40">Access Token</Label>
              <SecretStatus configured={view.whatsapp.access_token_configured} />
              {view.whatsapp.access_token_configured && (
                <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_access_token", "Access Token")}>
                  <Trash2 className="h-3 w-3 mr-1" />Remover
                </Button>
              )}
            </div>
            <SecretInput
              id="wa-token"
              value={waAccessToken}
              onChange={setWaAccessToken}
              placeholder={view.whatsapp.access_token_configured ? "•••••••• (deixe em branco para preservar)" : "Cole o Access Token permanente"}
            />
            <FieldHint>
              Utilize preferencialmente um token <strong>permanente do System User</strong>, com escopo <code>whatsapp_business_messaging</code>.
              Tokens temporários (24h) só servem para teste inicial.
            </FieldHint>
          </div>

          <Button disabled={saving} onClick={handleSaveWhatsapp}>
            <Save className="h-4 w-4 mr-1" />Salvar WhatsApp
          </Button>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook de recibos do WhatsApp</CardTitle>
          <CardDescription>
            Permite que a Meta notifique o Cultivo Farm sobre entrega, leitura e falhas de cada mensagem. Configure os segredos
            <strong> antes</strong> de ativar a flag de webhook.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>URL pública para colar na Meta</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input readOnly value={view.webhook.url} className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(view.webhook.url); toast.success("URL copiada."); }} title="Copiar URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <FieldHint>
              No painel da Meta, em <em>WhatsApp → Configuration → Webhook</em>, cole essa URL, informe o Verify Token abaixo
              e assine o campo <code>messages</code>.
            </FieldHint>
          </div>

          <Separator />

          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Label className="min-w-40">App Secret</Label>
              <SecretStatus configured={view.webhook.app_secret_configured} />
              {view.webhook.app_secret_configured && (
                <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_app_secret", "App Secret")}>
                  <Trash2 className="h-3 w-3 mr-1" />Remover
                </Button>
              )}
            </div>
            <SecretInput
              value={webhookAppSecret}
              onChange={(v) => { setWebhookAppSecret(v); if (webhookAppSecretErr) setWebhookAppSecretErr(""); }}
              placeholder={view.webhook.app_secret_configured ? "•••••••• (deixe em branco para preservar)" : "16–512 caracteres"}
              ariaInvalid={!!webhookAppSecretErr}
            />
            <FieldError msg={webhookAppSecretErr} />
            <FieldHint>
              Encontrado em <em>Meta for Developers → seu app → Configurações → Básico → Chave secreta do app</em>.
              É usado para validar a assinatura HMAC das notificações.
            </FieldHint>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <Label className="min-w-40">Verify Token</Label>
              <SecretStatus configured={view.webhook.verify_token_configured} />
              {view.webhook.verify_token_configured && (
                <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_verify_token", "Verify Token")}>
                  <Trash2 className="h-3 w-3 mr-1" />Remover
                </Button>
              )}
            </div>
            <SecretInput
              value={webhookVerifyToken}
              onChange={(v) => { setWebhookVerifyToken(v); if (webhookVerifyErr) setWebhookVerifyErr(""); }}
              placeholder={view.webhook.verify_token_configured ? "•••••••• (deixe em branco para preservar)" : "16–512 caracteres"}
              ariaInvalid={!!webhookVerifyErr}
            />
            <FieldError msg={webhookVerifyErr} />
            <FieldHint>
              Você <strong>define</strong> esse valor e informa o mesmo texto na tela de configuração do webhook na Meta —
              use uma string aleatória e forte.
            </FieldHint>
          </div>

          <Button disabled={saving || (!webhookAppSecret && !webhookVerifyToken)} onClick={handleSaveWebhook}>
            <Save className="h-4 w-4 mr-1" />Salvar webhook
          </Button>
        </CardContent>
      </Card>

      {/* Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Flags de entrega</CardTitle>
          <CardDescription>
            Ativar qualquer flag exige confirmação explícita. Salvar credenciais <strong>nunca</strong> ativa entrega automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["delivery_enabled","email_delivery_enabled","whatsapp_delivery_enabled","inapp_delivery_enabled","whatsapp_webhook_enabled"] as const).map((k) => {
            const meta = FLAG_LABELS[k];
            const enabled = (view.flags as Record<string, boolean>)[k];
            return (
              <div key={k} className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div>
                  <Label className="font-medium">{meta.title}</Label>
                  <p className="text-xs text-muted-foreground mt-1">{meta.help}</p>
                </div>
                <Switch checked={enabled} onCheckedChange={(b) => {
                  if (b && !confirm(`Ativar "${meta.title}"? Isso pode iniciar envios/recebimentos reais.`)) return;
                  void save(
                    { flags: { [k]: b, confirm_enable: b ? "I_UNDERSTAND" : undefined } },
                    b ? `${meta.title} ativada` : `${meta.title} desativada`,
                  );
                }} />
              </div>
            );
          })}
          {anyFlagOn && (
            <div className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded-md p-2">
              ⚠️ Uma ou mais flags estão ativas — envios reais podem ocorrer conforme o Test mode e as allowlists.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Última atualização das configurações: {view.updated_at ?? "—"}
      </div>
    </div>
  );
}
