import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import Auth from "@/pages/Auth";
import { labelDetails, isUuid, type LabelData, type Snapshot } from "@/lib/etiquetas";
import { formatDateDisplay } from "@/lib/date-utils";
interface Trace { autorizado?: boolean; valido?: boolean; status?: string; mensagem?: string; etiqueta?: LabelData; snapshot?: Snapshot; produto_nome?: string; lote_codigo?: string; validade_em?: string; codigo_etiqueta?: string; }
export default function RastrearProduto() {
  const { token } = useParams(); const auth = useAuth();
  const scope = useStorageAccessScope(`trace:${token}`);
  return <TraceView key={scope.scope} token={token} signedIn={Boolean(auth.user)} loadingAuth={auth.loading} scope={scope} />;
}
function TraceView({ token, signedIn, loadingAuth, scope }: { token?: string; signedIn: boolean; loadingAuth: boolean; scope: ReturnType<typeof useStorageAccessScope> }) {
  const [data, setData] = useState<Trace | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => {
    let active = true; const current = scope.capture();
    if (loadingAuth) return;
    if (!isUuid(token)) { setError("Código de rastreio inválido."); setLoading(false); return; }
    if (signedIn && !scope.ready) { setError("Consulta indisponível nesta sessão."); setLoading(false); return; }
    (async () => {
      const { data, error } = await (supabase as any).rpc(signedIn ? "rpc_consultar_etiqueta_qr_v1" : "rpc_validar_rastreio_produto", { p_trace_token: token });
      if (!active || (signedIn && !current())) return;
      if (error) setError("Não foi possível consultar o rastreio."); else setData(data as Trace | null);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [token, signedIn, loadingAuth, scope.scope]);
  if (loading || loadingAuth) return <p role="status" className="p-6">Consultando rastreio…</p>;
  // Legacy public validation stays on its existing server gate; new tokens require login.
  if (!signedIn && !data?.valido) return <><p className="p-4 text-center">Entre para consultar os dados autorizados desta etiqueta.</p><Auth /></>;
  if (error || (signedIn && data?.autorizado !== true)) return <p role="alert" className="p-6">{error || "Etiqueta não disponível para esta sessão."}</p>;
  const label = data?.etiqueta ? { ...data.etiqueta, snapshot: data.snapshot ?? data.etiqueta.snapshot } : null;
  return <main className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4"><h1 className="text-xl font-bold">Rastreio Cultivo Farm</h1><p>{data?.status}</p>{data?.mensagem && <p>{data.mensagem}</p>}
    <dl className="space-y-2">{[["Código", label?.codigo_etiqueta ?? data?.codigo_etiqueta], ["Produto", label?.produto_nome ?? data?.produto_nome], ["Lote", label?.lote_codigo ?? data?.lote_codigo], ["Validade", (label?.validade_em ?? data?.validade_em) ? formatDateDisplay(label?.validade_em ?? data?.validade_em ?? "") : ""], ...(label ? labelDetails(label) : [])].filter(([, v]) => v).map(([k, v]) => <div key={k} className="border-b py-2 break-words"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
  </main>;
}
