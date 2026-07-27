import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Copy, Save, ShieldAlert, Trash2 } from "lucide-react";
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
  whatsapp: { phone_number_id: string | null; api_version: string | null; access_token_configured: boolean; allowed_api_versions: string[] };
  webhook: { app_secret_configured: boolean; verify_token_configured: boolean; url: string };
  updated_at: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sessão expirada ou sem permissão.",
  forbidden: "Apenas administradores podem alterar essa configuração.",
  rate_limited: "Muitas tentativas em pouco tempo. Aguarde alguns segundos.",
  invalid_payload: "Dados inválidos — revise os campos destacados.",
  invalid_smtp: "Configuração SMTP inválida.",
  invalid_whatsapp: "Configuração WhatsApp inválida.",
  invalid_webhook: "Configuração de webhook inválida.",
  invalid_emails: "Um ou mais e-mails são inválidos.",
  invalid_phones: "Um ou mais telefones são inválidos (use E.164).",
  vault_error: "Falha ao gravar segredo com segurança. Tente novamente.",
  unknown_error: "Erro inesperado. Tente novamente.",
};

function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

async function callSettings(method: "GET" | "PUT", body?: unknown): Promise<ProviderView> {
  const { data, error } = await supabase.functions.invoke("communication-provider-settings", {
    method,
    body: body ?? undefined,
  });
  if (error) {
    const ctxBody = (error as unknown as { context?: { body?: unknown } })?.context?.body;
    let code = error.message;
    if (typeof ctxBody === "string") {
      try { const j = JSON.parse(ctxBody); if (j?.error) code = j.error; } catch { /* keep */ }
    } else if (ctxBody && typeof ctxBody === "object" && "error" in ctxBody) {
      code = String((ctxBody as { error: unknown }).error);
    }
    throw new Error(code);
  }
  if (!data?.ok) throw new Error((data as { error?: string } | null)?.error ?? "unknown_error");
  return data as ProviderView;
}

function SecretStatus({ configured }: { configured: boolean }) {
  return configured
    ? <Badge variant="default">Configurado</Badge>
    : <Badge variant="outline">Não configurado</Badge>;
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive mt-1">{msg}</p>;
}

export default function ComunicacaoConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ProviderView | null>(null);

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
      toast.error("Erro ao carregar configurações", { description: friendlyError(e.message) });
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
      // limpa campos secretos após save (segredos são write-only)
      setSmtpPassword(""); setWaAccessToken(""); setWebhookAppSecret(""); setWebhookVerifyToken("");
      setEmailsText(""); setPhonesText("");
      return true;
    } catch (e: any) {
      toast.error("Falha ao salvar", { description: friendlyError(e.message) });
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
    if (!r.ok) { setEmailsErr(r.error); toast.error("Lista de e-mails inválida", { description: r.error }); return; }
    setEmailsErr("");
    void save({ allowed_emails: r.value }, "Allowlist de e-mails atualizada", `${r.value.length} destinatário(s) permitido(s).`);
  }

  function handleSavePhones() {
    const r = validatePhonesCsv(phonesText);
    if (!r.ok) { setPhonesErr(r.error); toast.error("Lista de telefones inválida", { description: r.error }); return; }
    setPhonesErr("");
    void save({ allowed_phones: r.value }, "Allowlist de telefones atualizada", `${r.value.length} número(s) permitido(s).`);
  }

  function handleSaveSmtp() {
    const parsed = smtpSchema.safeParse({
      host: smtpHost, port: smtpPort, user: smtpUser, from: smtpFrom,
      password: smtpPassword || undefined,
    });
    if (!parsed.success) {
      const errs = zodToFieldErrors(parsed.error) as SmtpFieldErrors;
      setSmtpErrors(errs);
      toast.error("Revise os campos do SMTP", { description: "Há campos obrigatórios ou inválidos." });
      return;
    }
    setSmtpErrors({});
    const desc = parsed.data.password
      ? "Host, porta, usuário, remetente e nova senha aplicados."
      : "Host, porta, usuário e remetente aplicados. Senha atual preservada.";
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
      "Configurações SMTP salvas",
      desc,
    );
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
      ? "Phone Number ID, versão e novo Access Token aplicados."
      : "Phone Number ID e versão aplicados. Access Token atual preservado.";
    void save(
      {
        whatsapp: {
          phone_number_id: parsed.data.phone_number_id,
          api_version: parsed.data.api_version,
          ...(parsed.data.access_token ? { access_token: parsed.data.access_token } : {}),
        },
      },
      "Configurações WhatsApp salvas",
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
      toast.error("Nada a salvar", { description: "Preencha App Secret e/ou Verify Token." });
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
      `${changed} gravado(s) com segurança.`,
    );
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Carregando configurações…</div>;
  if (!view) return <div className="p-6 text-sm text-destructive">Falha ao carregar.</div>;

  const anyFlagOn =
    view.flags.delivery_enabled || view.flags.email_delivery_enabled ||
    view.flags.whatsapp_delivery_enabled || view.flags.inapp_delivery_enabled ||
    view.flags.whatsapp_webhook_enabled;

  return (
    <div className="space-y-4">
      {/* Estado geral */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Estado dos provedores</CardTitle>
          <CardDescription>Somente booleanos e contagens. Segredos nunca são exibidos.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>Test mode: <Badge variant={view.test_mode_enabled ? "default" : "destructive"}>{view.test_mode_enabled ? "ON (fail-closed)" : "OFF"}</Badge></div>
          <div>Allowlist e-mails: <Badge variant="outline">{view.allowed_emails_count}</Badge></div>
          <div>Allowlist telefones: <Badge variant="outline">{view.allowed_phones_count}</Badge></div>
          <div>Delivery global: <Badge variant={view.flags.delivery_enabled ? "default" : "outline"}>{view.flags.delivery_enabled ? "ON" : "OFF"}</Badge></div>
          <div>E-mail: <Badge variant={view.flags.email_delivery_enabled ? "default" : "outline"}>{view.flags.email_delivery_enabled ? "ON" : "OFF"}</Badge></div>
          <div>WhatsApp: <Badge variant={view.flags.whatsapp_delivery_enabled ? "default" : "outline"}>{view.flags.whatsapp_delivery_enabled ? "ON" : "OFF"}</Badge></div>
          <div>In-app: <Badge variant={view.flags.inapp_delivery_enabled ? "default" : "outline"}>{view.flags.inapp_delivery_enabled ? "ON" : "OFF"}</Badge></div>
          <div>Webhook WhatsApp: <Badge variant={view.flags.whatsapp_webhook_enabled ? "default" : "outline"}>{view.flags.whatsapp_webhook_enabled ? "ON" : "OFF"}</Badge></div>
        </CardContent>
      </Card>

      {/* Homologação */}
      <Card>
        <CardHeader>
          <CardTitle>Homologação (allowlists)</CardTitle>
          <CardDescription>Quando o Test mode está ON e a lista correspondente ao canal está vazia, nada sai.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Test mode ativo</Label>
            <Switch checked={view.test_mode_enabled} onCheckedChange={(b) => {
              if (!b) {
                if (!confirm("Desativar o Test mode permite envios REAIS a qualquer destinatário. Confirmar?")) return;
                void save({ test_mode_enabled: false, confirm_disable_test_mode: "I_UNDERSTAND_REAL_SENDS" }, "Test mode desativado", "Envios reais liberados — atenção às allowlists.");
              } else {
                void save({ test_mode_enabled: true }, "Test mode ativado", "Envios ficam restritos à allowlist.");
              }
            }} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emails-allow">Adicionar/substituir e-mails permitidos (separe por vírgula)</Label>
            <Textarea id="emails-allow" value={emailsText} onChange={(e) => { setEmailsText(e.target.value); if (emailsErr) setEmailsErr(""); }} placeholder="alvo1@ex.com, alvo2@ex.com" rows={2} aria-invalid={!!emailsErr} />
            <FieldError msg={emailsErr} />
            <div className="text-xs text-muted-foreground">Atuais mascarados: {view.allowed_emails_masked.join(", ") || "—"}</div>
            <Button size="sm" disabled={saving || !emailsText.trim()} onClick={handleSaveEmails}>Substituir e-mails</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phones-allow">Adicionar/substituir telefones permitidos (E.164)</Label>
            <Textarea id="phones-allow" value={phonesText} onChange={(e) => { setPhonesText(e.target.value); if (phonesErr) setPhonesErr(""); }} placeholder="+5511999999999, +5511888888888" rows={2} aria-invalid={!!phonesErr} />
            <FieldError msg={phonesErr} />
            <div className="text-xs text-muted-foreground">Atuais mascarados: {view.allowed_phones_masked.join(", ") || "—"}</div>
            <Button size="sm" disabled={saving || !phonesText.trim()} onClick={handleSavePhones}>Substituir telefones</Button>
          </div>
        </CardContent>
      </Card>

      {/* SMTP */}
      <Card>
        <CardHeader>
          <CardTitle>SMTP (e-mail)</CardTitle>
          <CardDescription>Senha é write-only: em branco = preservar valor atual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="smtp-host">Host</Label>
              <Input id="smtp-host" value={smtpHost} onChange={(e) => { setSmtpHost(e.target.value); if (smtpErrors.host) setSmtpErrors({ ...smtpErrors, host: undefined }); }} placeholder="smtp.exemplo.com" aria-invalid={!!smtpErrors.host} />
              <FieldError msg={smtpErrors.host} />
            </div>
            <div>
              <Label htmlFor="smtp-port">Porta</Label>
              <Input id="smtp-port" type="number" inputMode="numeric" min={1} max={65535} value={smtpPort} onChange={(e) => { setSmtpPort(e.target.value); if (smtpErrors.port) setSmtpErrors({ ...smtpErrors, port: undefined }); }} placeholder="587" aria-invalid={!!smtpErrors.port} />
              <FieldError msg={smtpErrors.port} />
            </div>
            <div>
              <Label htmlFor="smtp-user">Usuário</Label>
              <Input id="smtp-user" value={smtpUser} onChange={(e) => { setSmtpUser(e.target.value); if (smtpErrors.user) setSmtpErrors({ ...smtpErrors, user: undefined }); }} autoComplete="username" aria-invalid={!!smtpErrors.user} />
              <FieldError msg={smtpErrors.user} />
            </div>
            <div>
              <Label htmlFor="smtp-from">Remetente (from)</Label>
              <Input id="smtp-from" type="email" value={smtpFrom} onChange={(e) => { setSmtpFrom(e.target.value); if (smtpErrors.from) setSmtpErrors({ ...smtpErrors, from: undefined }); }} placeholder="no-reply@arbio.com.br" aria-invalid={!!smtpErrors.from} />
              <FieldError msg={smtpErrors.from} />
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Senha SMTP</Label>
            <SecretStatus configured={view.smtp.password_configured} />
            {view.smtp.password_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("smtp_password", "Senha SMTP")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input id="smtp-password" type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
          <Button disabled={saving} onClick={handleSaveSmtp}><Save className="h-4 w-4 mr-1" />Salvar SMTP</Button>
        </CardContent>
      </Card>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Cloud API (Meta)</CardTitle>
          <CardDescription>Versões suportadas: {view.whatsapp.allowed_api_versions.join(", ")}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="wa-phone">Phone Number ID</Label>
              <Input id="wa-phone" inputMode="numeric" value={waPhoneId} onChange={(e) => { setWaPhoneId(e.target.value); if (waErrors.phone_number_id) setWaErrors({ ...waErrors, phone_number_id: undefined }); }} placeholder="Ex.: 123456789012345" aria-invalid={!!waErrors.phone_number_id} />
              <FieldError msg={waErrors.phone_number_id} />
            </div>
            <div>
              <Label htmlFor="wa-version">API Version</Label>
              <Input id="wa-version" list="wa-versions" value={waApiVersion} onChange={(e) => { setWaApiVersion(e.target.value); if (waErrors.api_version) setWaErrors({ ...waErrors, api_version: undefined }); }} placeholder={view.whatsapp.allowed_api_versions[0] ?? "v25.0"} aria-invalid={!!waErrors.api_version} />
              <datalist id="wa-versions">{view.whatsapp.allowed_api_versions.map(v => <option key={v} value={v} />)}</datalist>
              <FieldError msg={waErrors.api_version} />
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Access Token</Label>
            <SecretStatus configured={view.whatsapp.access_token_configured} />
            {view.whatsapp.access_token_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_access_token", "Access Token")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input id="wa-token" type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} />
          <Button disabled={saving} onClick={handleSaveWhatsapp}><Save className="h-4 w-4 mr-1" />Salvar WhatsApp</Button>
        </CardContent>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader>
          <CardTitle>Webhook de recibos WhatsApp</CardTitle>
          <CardDescription>Configure o App Secret e o Verify Token antes de ativar a flag do webhook.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Input readOnly value={view.webhook.url} />
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(view.webhook.url); toast.success("URL copiada."); }}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-3">
            <Label className="min-w-40">App Secret</Label>
            <SecretStatus configured={view.webhook.app_secret_configured} />
            {view.webhook.app_secret_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_app_secret", "App Secret")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar (16–512 caracteres)" value={webhookAppSecret} onChange={(e) => { setWebhookAppSecret(e.target.value); if (webhookAppSecretErr) setWebhookAppSecretErr(""); }} aria-invalid={!!webhookAppSecretErr} />
          <FieldError msg={webhookAppSecretErr} />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Verify Token</Label>
            <SecretStatus configured={view.webhook.verify_token_configured} />
            {view.webhook.verify_token_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_verify_token", "Verify Token")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar (16–512 caracteres)" value={webhookVerifyToken} onChange={(e) => { setWebhookVerifyToken(e.target.value); if (webhookVerifyErr) setWebhookVerifyErr(""); }} aria-invalid={!!webhookVerifyErr} />
          <FieldError msg={webhookVerifyErr} />
          <Button disabled={saving || (!webhookAppSecret && !webhookVerifyToken)} onClick={handleSaveWebhook}><Save className="h-4 w-4 mr-1" />Salvar Webhook</Button>
        </CardContent>
      </Card>

      {/* Flags */}
      <Card>
        <CardHeader>
          <CardTitle>Flags de entrega</CardTitle>
          <CardDescription>Ativar qualquer flag exige confirmação explícita. Salvar credenciais NUNCA ativa entrega.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(["delivery_enabled","email_delivery_enabled","whatsapp_delivery_enabled","inapp_delivery_enabled","whatsapp_webhook_enabled"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between">
              <Label>{k}</Label>
              <Switch checked={(view.flags as any)[k]} onCheckedChange={(b) => {
                if (b && !confirm(`Ativar "${k}"? Isso pode iniciar envios reais.`)) return;
                void save({ flags: { [k]: b, confirm_enable: b ? "I_UNDERSTAND" : undefined } }, b ? `Flag "${k}" ativada` : `Flag "${k}" desativada`);
              }} />
            </div>
          ))}
          {anyFlagOn && <div className="text-xs text-amber-600">Uma ou mais flags estão ativas — envios reais podem ocorrer.</div>}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">Última atualização: {view.updated_at ?? "—"}</div>
    </div>
  );
}
