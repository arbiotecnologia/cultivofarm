/**
 * Fase Fiscal 3.16 — Upload seguro de certificado A1 (frontend).
 *
 * NUNCA persiste PFX/senha no navegador. Envia à Edge Function
 * `fiscal-certificate-upload` (admin-only, backend valida PKCS#12 e
 * criptografa com AES-256-GCM). Limpa File + senha da memória sempre.
 */
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldOff, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { certificateErrorMessage } from "@/lib/fiscal/certificateErrors";
import { checkFiscalBinding } from "@/config/fiscalBinding";

export interface UploadCertificadoA1Props {
  companySettingsId: string;
  onUploaded?: (certificateId: string) => void;
  disabled?: boolean;
}

export default function UploadCertificadoA1({
  companySettingsId,
  onUploaded,
  disabled,
}: UploadCertificadoA1Props) {
  const qc = useQueryClient();
  const inFlight = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("Certificado A1 — homologação");
  const [pending, setPending] = useState(false);
  const [vaultUnavailable, setVaultUnavailable] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || inFlight.current) return;
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast({ title: "Selecione um arquivo .pfx ou .p12", variant: "destructive" });
      return;
    }
    if (!/\.(pfx|p12)$/i.test(file.name)) {
      toast({ title: "Formato inválido", description: "Aceito apenas .pfx ou .p12.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo maior que 10 MB", variant: "destructive" });
      return;
    }
    if (password.trim().length === 0) {
      toast({ title: "Informe a senha do certificado", variant: "destructive" });
      return;
    }
    // H7b — fail-closed de binding: nunca enviar PFX fora do ambiente autorizado.
    const binding = checkFiscalBinding();
    if (!binding.ok) {
      toast({ title: "Ambiente fiscal inválido", description: binding.message, variant: "destructive" });
      return;
    }

    inFlight.current = true;
    setPending(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("password", password);
    fd.append("company_settings_id", companySettingsId);
    fd.append("display_name", displayName);
    try {
      const { data, error } = await supabase.functions.invoke("fiscal-certificate-upload", {
        body: fd,
      });
      if (error) {
        toast({ title: "Falha ao carregar certificado", description: await certificateErrorMessage(error), variant: "destructive" });
        return;
      }
      const res = data as { certificate_id?: string; error?: string; code?: string };
      if (res.code === "CERT_PASSWORD_REQUIRED") {
        toast({
          title: "Senha do certificado obrigatória",
          description: "Informe a senha real do arquivo A1. Ela não é armazenada no navegador.",
          variant: "destructive",
        });
        return;
      }
      if (res.code === "CERTIFICATE_VAULT_NOT_CONFIGURED") {
        setVaultUnavailable("Cofre de certificados ainda não configurado. Contate o administrador do sistema.");
        return;
      }
      if (!res.certificate_id) {
        toast({ title: "Falha ao carregar certificado", description: await certificateErrorMessage(null, res), variant: "destructive" });
        return;
      }
      toast({ title: "Certificado A1 carregado com sucesso" });
      void qc.invalidateQueries({ queryKey: ["fiscal"] });
      onUploaded?.(res.certificate_id);
    } catch (err) {
      toast({
        title: "Falha ao carregar certificado",
        description: await certificateErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      // Limpa material sensível da memória
      setPassword("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      fd.delete("password");
      fd.delete("file");
      inFlight.current = false;
      setPending(false);
    }
  }

  if (vaultUnavailable) {
    return (
      <Alert variant="destructive" data-testid="fiscal-a1-vault-off">
        <ShieldOff className="h-4 w-4" aria-hidden />
        <AlertTitle>Cofre de certificados indisponível</AlertTitle>
        <AlertDescription>{vaultUnavailable}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card data-testid="fiscal-a1-upload">
      <CardHeader>
        <CardTitle className="text-base">Carregar certificado A1</CardTitle>
        <CardDescription>
          O arquivo e a senha são enviados diretamente ao cofre seguro do servidor
          por conexão segura. O material é cifrado no servidor; a senha não é persistida.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpload} className="space-y-3">
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="a1-file">Arquivo (.pfx / .p12)</Label>
            <Input
              id="a1-file"
              ref={fileInputRef}
              type="file"
              accept=".pfx,.p12"
              disabled={disabled || pending}
              data-testid="fiscal-a1-file"
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="a1-password">Senha do certificado</Label>
            <Input
              id="a1-password"
              maxLength={256}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled || pending}
              data-testid="fiscal-a1-password"
            />
          </div>
          <div className="grid min-w-0 content-start gap-1.5">
            <Label htmlFor="a1-display-name">Nome para exibição</Label>
            <Input
              id="a1-display-name"
              maxLength={200}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={disabled || pending}
            />
          </div>
          <Alert>
            <ShieldOff className="h-4 w-4" aria-hidden />
            <AlertTitle>Aviso de segurança</AlertTitle>
            <AlertDescription className="text-xs">
              O certificado permanecerá criptografado no cofre e será usado apenas
              em processos server-side autorizados. Você poderá revogá-lo a qualquer
              momento.
            </AlertDescription>
          </Alert>
          <Button type="submit" disabled={disabled || pending}>
            {pending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…</> : <><Upload className="h-4 w-4 mr-2" /> Carregar para homologação</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
