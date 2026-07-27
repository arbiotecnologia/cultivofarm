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
import { useToast } from "@/hooks/use-toast";
import { Copy, Save, ShieldAlert, Trash2 } from "lucide-react";

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

async function callSettings(method: "GET" | "PUT", body?: unknown): Promise<ProviderView> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Sem sessão autenticada.");
  const url = `${(supabase as any).supabaseUrl}/functions/v1/communication-provider-settings`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "apikey": (supabase as any).supabaseKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(json?.error || `Falha (${res.status}).`);
  }
  return json as ProviderView;
}

function SecretStatus({ configured }: { configured: boolean }) {
  return configured
    ? <Badge variant="default">Configurado</Badge>
    : <Badge variant="outline">Não configurado</Badge>;
}

export default function ComunicacaoConfigTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ProviderView | null>(null);

  // Local editable state
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
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  function parseCsv(v: string): string[] | undefined {
    if (!v.trim()) return undefined;
    return v.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  }

  async function save(payload: Record<string, unknown>, msg = "Configuração salva.") {
    setSaving(true);
    try {
      const v = await callSettings("PUT", payload);
      setView(v);
      toast({ title: msg });
      // limpa campos secretos e listas após save
      setSmtpPassword(""); setWaAccessToken(""); setWebhookAppSecret(""); setWebhookVerifyToken("");
      setEmailsText(""); setPhonesText("");
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(slot: string) {
    if (!confirm(`Remover permanentemente o segredo "${slot}"?`)) return;
    await save({ action: "clear_secret", slot, confirm: "REMOVE" }, "Segredo removido.");
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

      {/* Modo homologação */}
      <Card>
        <CardHeader>
          <CardTitle>Homologação (allowlists)</CardTitle>
          <CardDescription>Quando o Test mode está ON e a lista correspondente ao canal está vazia, nada sai.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Test mode ativo</Label>
            <Switch checked={view.test_mode_enabled} onCheckedChange={(b) => save({ test_mode_enabled: b })} />
          </div>
          <div className="space-y-2">
            <Label>Adicionar/substituir e-mails permitidos (separe por vírgula)</Label>
            <Textarea value={emailsText} onChange={(e) => setEmailsText(e.target.value)} placeholder="alvo1@ex.com, alvo2@ex.com" rows={2} />
            <div className="text-xs text-muted-foreground">Atuais mascarados: {view.allowed_emails_masked.join(", ") || "—"}</div>
            <Button size="sm" disabled={saving || !emailsText.trim()} onClick={() => save({ allowed_emails: parseCsv(emailsText) })}>Substituir e-mails</Button>
          </div>
          <div className="space-y-2">
            <Label>Adicionar/substituir telefones permitidos (E.164)</Label>
            <Textarea value={phonesText} onChange={(e) => setPhonesText(e.target.value)} placeholder="+5511999999999, +5511888888888" rows={2} />
            <div className="text-xs text-muted-foreground">Atuais mascarados: {view.allowed_phones_masked.join(", ") || "—"}</div>
            <Button size="sm" disabled={saving || !phonesText.trim()} onClick={() => save({ allowed_phones: parseCsv(phonesText) })}>Substituir telefones</Button>
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
            <div><Label>Host</Label><Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} /></div>
            <div><Label>Porta</Label><Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} /></div>
            <div><Label>Usuário</Label><Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} /></div>
            <div><Label>Remetente (from)</Label><Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} /></div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Senha SMTP</Label>
            <SecretStatus configured={view.smtp.password_configured} />
            {view.smtp.password_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("smtp_password")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
          <Button disabled={saving} onClick={() => save({
            smtp: {
              host: smtpHost || null,
              port: smtpPort ? Number(smtpPort) : null,
              user: smtpUser || null,
              from: smtpFrom || null,
              ...(smtpPassword ? { password: smtpPassword } : {}),
            }
          })}><Save className="h-4 w-4 mr-1" />Salvar SMTP</Button>
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
            <div><Label>Phone Number ID</Label><Input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} /></div>
            <div><Label>API Version</Label><Input list="wa-versions" value={waApiVersion} onChange={(e) => setWaApiVersion(e.target.value)} />
              <datalist id="wa-versions">{view.whatsapp.allowed_api_versions.map(v => <option key={v} value={v} />)}</datalist>
            </div>
          </div>
          <Separator />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Access Token</Label>
            <SecretStatus configured={view.whatsapp.access_token_configured} />
            {view.whatsapp.access_token_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_access_token")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={waAccessToken} onChange={(e) => setWaAccessToken(e.target.value)} />
          <Button disabled={saving} onClick={() => save({
            whatsapp: {
              phone_number_id: waPhoneId || null,
              api_version: waApiVersion || null,
              ...(waAccessToken ? { access_token: waAccessToken } : {}),
            }
          })}><Save className="h-4 w-4 mr-1" />Salvar WhatsApp</Button>
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
            <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(view.webhook.url); toast({ title: "URL copiada." }); }}><Copy className="h-4 w-4" /></Button>
          </div>
          <div className="flex items-center gap-3">
            <Label className="min-w-40">App Secret</Label>
            <SecretStatus configured={view.webhook.app_secret_configured} />
            {view.webhook.app_secret_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_app_secret")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={webhookAppSecret} onChange={(e) => setWebhookAppSecret(e.target.value)} />
          <div className="flex items-center gap-3">
            <Label className="min-w-40">Verify Token</Label>
            <SecretStatus configured={view.webhook.verify_token_configured} />
            {view.webhook.verify_token_configured && (
              <Button size="sm" variant="outline" onClick={() => clearSecret("whatsapp_verify_token")}><Trash2 className="h-3 w-3 mr-1" />Remover</Button>
            )}
          </div>
          <Input type="password" autoComplete="new-password" placeholder="Deixe em branco para preservar" value={webhookVerifyToken} onChange={(e) => setWebhookVerifyToken(e.target.value)} />
          <Button disabled={saving || (!webhookAppSecret && !webhookVerifyToken)} onClick={() => save({
            webhook: {
              ...(webhookAppSecret ? { app_secret: webhookAppSecret } : {}),
              ...(webhookVerifyToken ? { verify_token: webhookVerifyToken } : {}),
            }
          })}><Save className="h-4 w-4 mr-1" />Salvar Webhook</Button>
        </CardContent>
      </Card>

      {/* Flags de entrega */}
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
                save({ flags: { [k]: b, confirm_enable: b ? "I_UNDERSTAND" : undefined } });
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
