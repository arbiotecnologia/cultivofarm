import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, ShieldCheck, Loader2, AlertTriangle, FileCheck2 } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  confirmado: "Confirmado",
  anexado: "Anexado",
  assinatura_digital_coletada: "Assinatura digital coletada",
  gerado: "Formulário gerado",
  formulario_gerado: "Formulário gerado",
  impresso: "Impresso",
  aguardando_assinatura: "Aguardando assinatura",
  assinado: "Assinado",
  dispensado: "Assinatura dispensada",
};

const ASSINATURA_LABEL: Record<string, string> = {
  digital_tela: "Digital (tela)",
  fisica_anexada: "Física anexada",
  dispensada: "Dispensada",
};

export const MSG_TOKEN_INVALIDO =
  "O endereço de validação está incompleto ou inválido. Confira o QR Code impresso no comprovante.";
export const MSG_FALHA_REDE =
  "Não foi possível consultar agora. Verifique a conexão e tente novamente.";
export const MSG_INDISPONIVEL = "Comprovante não encontrado ou indisponível.";
export const MSG_NAO_CONFIRMADO = "Documento registrado — recebimento ainda não confirmado";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Espera máxima aceita para um rate limit (evita bloqueio indefinido da tela). */
const ESPERA_MAXIMA_SEGUNDOS = 300;

/** Rótulo seguro para valores desconhecidos vindos do servidor. */
function rotuloSeguro(mapa: Record<string, string>, valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  return mapa[valor] ?? valor.replace(/_/g, " ");
}

/** Só renderiza datas realmente válidas. */
function dataLegivel(valor: unknown): string | null {
  if (typeof valor !== "string" || !valor.trim()) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR");
}

function segundosDeEspera(payload: any): number | null {
  const bruto = payload?.retry_after_seconds ?? payload?.retryAfterSeconds;
  const n = typeof bruto === "string" ? Number(bruto) : bruto;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.ceil(n), ESPERA_MAXIMA_SEGUNDOS);
}

type Falha = { tipo: "rede" | "indisponivel" | "limite"; mensagem: string };

export default function ValidarEntrega() {
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [falha, setFalha] = useState<Falha | null>(null);
  const [esperaSegundos, setEsperaSegundos] = useState(0);

  const consultandoRef = useRef(false);
  const seqRef = useRef(0);
  const ativoRef = useRef(0);
  const tokenAtivoRef = useRef<string | undefined>(token);

  const tokenValido = !!token && UUID_RE.test(token);

  // Troca de token: limpa resultado, erro e carregamento; invalida a consulta em voo.
  useEffect(() => {
    tokenAtivoRef.current = token;
    ativoRef.current = ++seqRef.current;
    consultandoRef.current = false;
    setData(null);
    setFalha(null);
    setLoading(false);
    setEsperaSegundos(0);
  }, [token]);

  // Unmount: invalida qualquer consulta em voo.
  useEffect(
    () => () => {
      ativoRef.current = ++seqRef.current;
      tokenAtivoRef.current = undefined;
    },
    [],
  );

  const consultar = useCallback(async () => {
    if (consultandoRef.current) return;
    const tokenEnvio = token;
    if (!tokenEnvio || !UUID_RE.test(tokenEnvio)) return;

    consultandoRef.current = true;
    const marca = ++seqRef.current;
    ativoRef.current = marca;
    const atual = () => ativoRef.current === marca && tokenAtivoRef.current === tokenEnvio;

    setLoading(true);
    setFalha(null);
    try {
      const { data: resposta, error } = await supabase.rpc("rpc_validar_comprovante_entrega" as any, {
        p_validation_token: tokenEnvio,
      });
      if (!atual()) return;

      if (error) {
        setFalha({ tipo: "rede", mensagem: MSG_FALHA_REDE });
        return;
      }

      const espera = segundosDeEspera(resposta);
      if (espera) {
        // Rate limit: espera segura e limitada, com nova tentativa manual.
        setEsperaSegundos(espera);
        setFalha({
          tipo: "limite",
          mensagem: "Muitas consultas em pouco tempo. Aguarde para tentar novamente.",
        });
        return;
      }

      setData(resposta ?? null);
      if (!resposta || (resposta as any).valido !== true) {
        setFalha({
          tipo: "indisponivel",
          mensagem: (resposta as any)?.mensagem || MSG_INDISPONIVEL,
        });
      }
    } catch {
      if (!atual()) return;
      setFalha({ tipo: "rede", mensagem: MSG_FALHA_REDE });
    } finally {
      if (atual()) {
        consultandoRef.current = false;
        setLoading(false);
      }
    }
  }, [token]);

  // Uma única consulta por token; nenhuma tentativa automática após falha.
  useEffect(() => {
    if (tokenValido) void consultar();
  }, [tokenValido, consultar]);

  // Contagem regressiva do rate limit (não consulta a RPC automaticamente).
  useEffect(() => {
    if (esperaSegundos <= 0) return;
    const id = setTimeout(() => setEsperaSegundos((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearTimeout(id);
  }, [esperaSegundos]);

  const valido = !falha && data?.valido === true;
  const status: string | null = valido && typeof data?.status === "string" ? data.status : null;
  const assinaturaTipo: string | null =
    valido && typeof data?.assinatura_tipo === "string" ? data.assinatura_tipo : null;
  const confirmado = status === "confirmado";
  const dispensado = assinaturaTipo === "dispensada" || status === "dispensado";
  const dataConfirmacao = dataLegivel(data?.data_confirmacao);
  const dataAssinatura = dataLegivel(data?.data_assinatura);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="text-lg font-bold">Validação de Comprovante Cultivo Farm</h1>
        </div>

        {!tokenValido ? (
          <div className="space-y-3" role="alert">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Endereço de validação inválido</span>
            </div>
            <p className="text-sm text-muted-foreground">{MSG_TOKEN_INVALIDO}</p>
          </div>
        ) : loading ? (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Verificando…
          </div>
        ) : falha ? (
          <div className="space-y-3" role="alert">
            <div
              className={`flex items-center gap-2 ${falha.tipo === "indisponivel" ? "text-destructive" : "text-amber-700"}`}
            >
              {falha.tipo === "indisponivel" ? (
                <XCircle className="h-5 w-5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              )}
              <span className="font-medium">
                {falha.tipo === "indisponivel" ? "Comprovante indisponível" : "Consulta não concluída"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{falha.mensagem}</p>
            {falha.tipo !== "indisponivel" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void consultar()}
                disabled={esperaSegundos > 0}
              >
                {esperaSegundos > 0 ? `Tentar novamente em ${esperaSegundos}s` : "Tentar novamente"}
              </Button>
            )}
          </div>
        ) : valido ? (
          <div className="space-y-3">
            {confirmado ? (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                <span className="font-medium">Recebimento confirmado</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-700">
                <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                <span className="font-medium">{MSG_NAO_CONFIRMADO}</span>
              </div>
            )}
            {dispensado && (
              <div className="text-xs bg-slate-100 border border-slate-200 text-slate-700 rounded p-2">
                A assinatura deste comprovante foi dispensada e registrada para auditoria.
              </div>
            )}
            <div className="text-sm space-y-2">
              {rotuloSeguro(STATUS_LABEL, data.status) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="secondary">{rotuloSeguro(STATUS_LABEL, data.status)}</Badge>
                </div>
              )}
              {rotuloSeguro(ASSINATURA_LABEL, data.assinatura_tipo) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo de assinatura:</span>
                  <Badge variant="outline">{rotuloSeguro(ASSINATURA_LABEL, data.assinatura_tipo)}</Badge>
                </div>
              )}
              {data.numero_formulario && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Formulário:</span>
                  <span className="font-mono">{data.numero_formulario}</span>
                </div>
              )}
              {dataConfirmacao && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmado em:</span>
                  <span>{dataConfirmacao}</span>
                </div>
              )}
              {dataAssinatura && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Assinatura:</span>
                  <span>{dataAssinatura}</span>
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
                  <div className="font-mono text-[10px] break-all bg-muted p-2 rounded">
                    {data.validation_hash}
                  </div>
                </div>
              )}
            </div>
            {typeof data.mensagem === "string" && data.mensagem && (
              <p className="text-xs text-muted-foreground border-t pt-3">{data.mensagem}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3" role="alert">
            <div className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" aria-hidden="true" />
              <span className="font-medium">Comprovante indisponível</span>
            </div>
            <p className="text-sm text-muted-foreground">{MSG_INDISPONIVEL}</p>
          </div>
        )}

        <div className="pt-3 border-t text-[11px] text-muted-foreground text-center">
          Cultivo Farm — Validação operacional de comprovantes de entrega.
        </div>
      </Card>
    </div>
  );
}
