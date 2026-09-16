import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from "lucide-react";
import { formatDateDisplay } from "@/lib/date-utils";

interface ValidacaoResponse {
  valido: boolean;
  status?: string;
  codigo_etiqueta?: string;
  produto_nome?: string;
  lote_codigo?: string;
  fabricado_em?: string | null;
  validade_em?: string | null;
  volume?: number | null;
  unidade?: string | null;
  tipo_etiqueta?: string;
  mensagem: string;
}

export default function RastrearProduto() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ValidacaoResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const { data: res, error } = await supabase.rpc("rpc_validar_rastreio_produto", {
        p_trace_token: token,
      });
      if (error || !res) {
        setData({ valido: false, mensagem: "Não foi possível validar esta etiqueta." });
      } else {
        setData(res as any);
      }
      setLoading(false);
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="animate-pulse text-muted-foreground">Validando rastreio...</div>
      </div>
    );
  }

  const valid = data?.valido && data.status === "ativo";
  const cancelada = data?.status === "cancelada";
  const vencido = data?.status === "vencido";

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4">
      <Card className="w-full max-w-md mt-8">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {valid && <CheckCircle2 className="h-12 w-12 text-green-600" />}
            {cancelada && <XCircle className="h-12 w-12 text-destructive" />}
            {vencido && <AlertTriangle className="h-12 w-12 text-amber-500" />}
            {!data?.valido && <XCircle className="h-12 w-12 text-destructive" />}
          </div>
          <CardTitle className="flex items-center justify-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Rastreio Cultivo Farm
          </CardTitle>
          {data?.status && (
            <Badge
              variant={valid ? "default" : cancelada ? "destructive" : "secondary"}
              className="mx-auto"
            >
              {data.status.toUpperCase()}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-center text-muted-foreground">{data?.mensagem}</p>

          {data?.valido && (
            <div className="space-y-2 border-t pt-3">
              <Row label="Código" value={data.codigo_etiqueta} mono />
              <Row label="Produto" value={data.produto_nome} />
              <Row label="Lote" value={data.lote_codigo} mono />
              {data.volume != null && (
                <Row label="Volume" value={`${data.volume}${data.unidade ? ` ${data.unidade}` : ""}`} />
              )}
              {data.fabricado_em && (
                <Row label="Fabricação" value={formatDateDisplay(data.fabricado_em)} />
              )}
              {data.validade_em && (
                <Row label="Validade" value={formatDateDisplay(data.validade_em)} />
              )}
            </div>
          )}

          <p className="text-[10px] text-center text-muted-foreground border-t pt-2">
            Este rastreio é informativo e não substitui documento fiscal ou recomendação técnica.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-semibold" : "font-semibold"}>{value}</span>
    </div>
  );
}
