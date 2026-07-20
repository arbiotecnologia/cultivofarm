import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, ShieldCheck, Loader2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  anexado: "Anexado",
  assinatura_digital_coletada: "Assinatura digital coletada",
  gerado: "Formulário gerado",
  impresso: "Impresso",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
};

export default function ValidarEntrega() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      const { data, error } = await supabase.rpc("rpc_validar_comprovante_entrega" as any, {
        p_validation_token: token,
      });
      setData(error ? { valido: false, mensagem: "Comprovante não encontrado." } : data);
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="text-lg font-bold">Validação de Comprovante AR Bio</h1>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando…
          </div>
        ) : data?.valido ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Comprovante válido</span>
            </div>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="secondary">{STATUS_LABEL[data.status] || data.status}</Badge>
              </div>
              {data.assinatura_tipo && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo de assinatura:</span>
                  <Badge variant="outline">
                    {data.assinatura_tipo === "digital_tela" && "Digital (tela)"}
                    {data.assinatura_tipo === "fisica_anexada" && "Física anexada"}
                    {data.assinatura_tipo === "dispensada" && "Dispensada"}
                    {!["digital_tela","fisica_anexada","dispensada"].includes(data.assinatura_tipo) && data.assinatura_tipo}
                  </Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Formulário:</span>
                <span className="font-mono">{data.numero_formulario}</span>
              </div>
              {data.data_confirmacao && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmado em:</span>
                  <span>{new Date(data.data_confirmacao).toLocaleString("pt-BR")}</span>
                </div>
              )}
              {data.data_assinatura && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assinatura:</span>
                  <span>{new Date(data.data_assinatura).toLocaleString("pt-BR")}</span>
                </div>
              )}
              {data.possui_ressalvas && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
                  Este comprovante possui ressalvas registradas no recebimento.
                </div>
              )}
              {data.validation_hash && (
                <div>
                  <div className="text-muted-foreground text-xs mb-1">Hash de validação:</div>
                  <div className="font-mono text-[10px] break-all bg-muted p-2 rounded">{data.validation_hash}</div>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground border-t pt-3">{data.mensagem}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Comprovante indisponível</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {data?.mensagem || "Comprovante não encontrado ou indisponível."}
            </p>
          </div>
        )}

        <div className="pt-3 border-t text-[11px] text-muted-foreground text-center">
          Sistema AR Bio — Validação operacional de comprovantes de entrega.
        </div>
      </Card>
    </div>
  );
}
