/**
 * Validação de anexos de comprovante de entrega (frontend).
 * A autoridade final continua sendo o servidor (bucket + RLS + RPC);
 * aqui apenas evitamos envios claramente inválidos.
 */

export const TAMANHO_MAXIMO_ANEXO_BYTES = 10 * 1024 * 1024; // 10 MiB

/** Tipos aceitos: MIME canônico -> extensões coerentes. */
export const TIPOS_ANEXO_ACEITOS: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

export const ACCEPT_ANEXO = ".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp";

export const MSG_ANEXO_FORMATO = "Formato não aceito. Envie um arquivo PDF, JPG, PNG ou WEBP.";
export const MSG_ANEXO_VAZIO = "O arquivo selecionado está vazio.";
export const MSG_ANEXO_TAMANHO = "O arquivo excede o limite de 10 MB.";
export const MSG_ANEXO_INCOERENTE =
  "A extensão do arquivo não corresponde ao seu conteúdo. Envie um arquivo PDF, JPG, PNG ou WEBP.";

export interface AnexoValido {
  ok: true;
  mime: string;
  extensao: string;
}
export interface AnexoInvalido {
  ok: false;
  motivo: string;
}
export type ResultadoAnexo = AnexoValido | AnexoInvalido;

/** Normaliza apelidos comuns para o MIME canônico. */
export function normalizarMimeAnexo(mime: string | undefined | null): string {
  const m = (mime || "").trim().toLowerCase();
  if (m === "image/jpg" || m === "image/pjpeg") return "image/jpeg";
  if (m === "application/x-pdf") return "application/pdf";
  return m;
}

export function extensaoDoNome(nome: string): string {
  const partes = (nome || "").trim().toLowerCase().split(".");
  if (partes.length < 2) return "";
  return partes.pop() || "";
}

/**
 * Valida um arquivo selecionado. Exige tamanho > 0, até 10 MiB,
 * MIME aceito e extensão coerente com o MIME.
 */
export function validarAnexoComprovante(file: File | null | undefined): ResultadoAnexo {
  if (!file) return { ok: false, motivo: MSG_ANEXO_FORMATO };
  if (!file.size || file.size <= 0) return { ok: false, motivo: MSG_ANEXO_VAZIO };
  if (file.size > TAMANHO_MAXIMO_ANEXO_BYTES) return { ok: false, motivo: MSG_ANEXO_TAMANHO };

  const mime = normalizarMimeAnexo(file.type);
  const extensoes = TIPOS_ANEXO_ACEITOS[mime];
  if (!extensoes) return { ok: false, motivo: MSG_ANEXO_FORMATO };

  const ext = extensaoDoNome(file.name);
  if (!ext) return { ok: false, motivo: MSG_ANEXO_INCOERENTE };
  if (!extensoes.includes(ext)) return { ok: false, motivo: MSG_ANEXO_INCOERENTE };

  return { ok: true, mime, extensao: ext };
}

/** Formata o tamanho para exibição simples ao usuário. */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
