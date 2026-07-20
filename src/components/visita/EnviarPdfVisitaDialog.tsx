import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateVisitaPdf, type VisitaPdfData } from "@/lib/pdfVisita";

interface EnviarPdfVisitaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dados completos da visita para gerar o PDF */
  visitaData: VisitaPdfData;
  /** E-mail sugerido (cliente vinculado) */
  emailSugerido?: string | null;
  /** Nome do cliente para personalizar saudação */
  clienteNome?: string | null;
  /** E-mail do consultor logado (para opção "enviar cópia") */
  consultorEmail?: string | null;
  /** ID do registro/diagnóstico para idempotência */
  registroId?: string;
  /** Nome do arquivo (sem extensão) */
  fileNameBase?: string;
}

export function EnviarPdfVisitaDialog({
  open,
  onOpenChange,
  visitaData,
  emailSugerido,
  clienteNome,
  consultorEmail,
  registroId,
  fileNameBase = "visita-tecnica",
}: EnviarPdfVisitaDialogProps) {
  const [email, setEmail] = useState(emailSugerido ?? "");
  const [enviarCopia, setEnviarCopia] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<string | null>(null);

  // Atualiza email quando o sugerido mudar (ex: dialog reaberto com outro registro)
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setEmail(emailSugerido ?? "");
      setLinkGerado(null);
      setEnviarCopia(false);
    }
    onOpenChange(next);
  };

  const handleEnviar = async () => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error("Informe um e-mail válido");
      return;
    }

    setEnviando(true);
    setLinkGerado(null);
    try {
      // 1. Gera PDF
      const doc = await generateVisitaPdf(visitaData);
      // dataURL → base64 puro
      const dataUri = doc.output("datauristring");
      const base64 = dataUri.split(",")[1];
      const fileName = `${fileNameBase}-${Date.now()}.pdf`;

      // 2. Invoca edge function
      const { data, error } = await supabase.functions.invoke(
        "enviar-pdf-visita",
        {
          body: {
            pdfBase64: base64,
            fileName,
            destinatarioEmail: trimmed,
            destinatarioNome: clienteNome ?? undefined,
            copiaConsultorEmail: enviarCopia && consultorEmail ? consultorEmail : undefined,
            registroId,
            clienteNome: visitaData.cliente ?? undefined,
            fazendaNome: visitaData.fazenda ?? undefined,
            talhaoNome: visitaData.talhao ?? undefined,
            dataVisita: visitaData.dataVisita,
            problemaPrincipal: visitaData.problemaPrincipal ?? undefined,
          },
        },
      );

      if (error) throw error;

      const result = data as { success: boolean; downloadUrl: string; emailSent: boolean; emailError?: string | null };
      setLinkGerado(result.downloadUrl);

      if (result.emailSent) {
        toast.success(`PDF enviado para ${trimmed}`);
      } else {
        toast.warning(
          "PDF gerado, mas e-mail ainda não está disponível. Use o link abaixo para compartilhar manualmente.",
          { duration: 6000 },
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar PDF";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Enviar PDF da visita
          </DialogTitle>
          <DialogDescription>
            O PDF será gerado, armazenado com segurança e enviado para o e-mail informado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-destino">E-mail do destinatário</Label>
            <Input
              id="email-destino"
              type="email"
              placeholder="cliente@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
            />
            {emailSugerido && email !== emailSugerido && (
              <p className="text-xs text-muted-foreground">
                Sugerido: <button type="button" className="underline" onClick={() => setEmail(emailSugerido)}>{emailSugerido}</button>
              </p>
            )}
          </div>

          {consultorEmail && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="copia-consultor"
                checked={enviarCopia}
                onCheckedChange={(v) => setEnviarCopia(!!v)}
                disabled={enviando}
              />
              <Label htmlFor="copia-consultor" className="text-sm font-normal cursor-pointer">
                Enviar cópia para mim ({consultorEmail})
              </Label>
            </div>
          )}

          {linkGerado && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Link de download (válido por 7 dias):</p>
              <a
                href={linkGerado}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline break-all flex items-start gap-1"
              >
                <ExternalLink className="h-3 w-3 mt-1 shrink-0" />
                <span>{linkGerado}</span>
              </a>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Fechar
          </Button>
          <Button onClick={handleEnviar} disabled={enviando || !email.trim()}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando e enviando...
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Gerar e enviar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
