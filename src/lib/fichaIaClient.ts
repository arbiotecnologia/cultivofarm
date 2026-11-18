import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export const FICHA_IA_FUNCTION = "ai-generate-ficha-campo";
export const FICHA_IA_TIMEOUT_MS = 45_000;

export interface GerarFichaParams {
  entidadeTipo: "produto" | "microrganismo";
  entidadeId: string;
  campo: string;
  token: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GerarFichaResultado {
  texto: string;
  justificativa: string | null;
  versaoId: string | null;
}

export class FichaIaError extends Error {
  constructor(
    message: string,
    readonly causa:
      | "nao_autenticado"
      | "sem_permissao"
      | "nao_disponivel"
      | "limite"
      | "servico"
      | "timeout"
      | "cancelado"
      | "rede"
      | "resposta_invalida",
    readonly podeTentarNovamente: boolean,
  ) {
    super(message);
    this.name = "FichaIaError";
  }
}

/** Mapeia o status HTTP para uma causa segura, sem vazar detalhe interno. */
export function mapearStatus(status: number): FichaIaError {
  if (status === 401) {
    return new FichaIaError("Sua sessão expirou. Entre novamente para gerar com IA.", "nao_autenticado", false);
  }
  if (status === 403) {
    return new FichaIaError("Seu perfil não tem permissão para gerar este texto com IA.", "sem_permissao", false);
  }
  if (status === 404) {
    return new FichaIaError(
      "A geração com IA ainda não está disponível neste ambiente. Fale com o time responsável.",
      "nao_disponivel",
      false,
    );
  }
  if (status === 429 || status === 402) {
    return new FichaIaError("Limite de uso da IA atingido. Tente novamente em instantes.", "limite", true);
  }
  if (status === 504) {
    return new FichaIaError("A geração demorou demais. Tente novamente.", "timeout", true);
  }
  if (status >= 500) {
    return new FichaIaError("O serviço de IA está indisponível agora. Tente novamente.", "servico", true);
  }
  return new FichaIaError("Não foi possível gerar o texto agora. Tente novamente.", "servico", true);
}

export async function gerarFichaCampo(params: GerarFichaParams): Promise<GerarFichaResultado> {
  const {
    entidadeTipo,
    entidadeId,
    campo,
    token,
    signal,
    timeoutMs = FICHA_IA_TIMEOUT_MS,
    fetchImpl = fetch,
  } = params;

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  let expirou = false;
  const timer = setTimeout(() => {
    expirou = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(`${SUPABASE_URL}/functions/v1/${FICHA_IA_FUNCTION}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
        campo,
        origem: "ia_manual",
      }),
    });

    if (!response.ok) throw mapearStatus(response.status);

    const data = await response.json().catch(() => null);
    const texto = typeof data?.texto === "string" ? data.texto.trim() : "";
    if (!texto || data?.rascunho !== true || data?.versao_id != null) {
      throw new FichaIaError("A IA retornou uma resposta inválida. Tente novamente.", "resposta_invalida", true);
    }
    return {
      texto,
      justificativa: typeof data?.justificativa === "string" ? data.justificativa : null,
      versaoId: null,
    };
  } catch (e) {
    if (e instanceof FichaIaError) throw e;
    if ((e as Error)?.name === "AbortError") {
      throw expirou
        ? new FichaIaError("A geração demorou demais. Tente novamente.", "timeout", true)
        : new FichaIaError("Geração cancelada.", "cancelado", true);
    }
    throw new FichaIaError("Falha de rede ao falar com o serviço de IA. Tente novamente.", "rede", true);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
