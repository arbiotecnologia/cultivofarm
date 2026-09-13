/**
 * Regras puras de evidências de aplicação (testáveis sem render).
 * O upload grava apenas objetos no bucket privado `aplicacao-evidencias`;
 * nenhuma URL assinada é persistida — o acesso é sempre gerado sob demanda.
 */

export const MAX_EVIDENCIA_MB = 10;
export const MAX_EVIDENCIA_BYTES = MAX_EVIDENCIA_MB * 1024 * 1024;

/** Allowlist estrita de tipos aceitos. Deve ser exatamente igual à lista do bucket/constraint do Supabase CultivoFarm. */
export const MIME_EVIDENCIAS_PERMITIDOS = [
  // imagens
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  // documento
  "application/pdf",
  // vídeo
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // áudio
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
] as const;

export const ACCEPT_EVIDENCIAS = MIME_EVIDENCIAS_PERMITIDOS.join(",");

const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

export function mimePermitido(mime: unknown): boolean {
  return typeof mime === "string" && (MIME_EVIDENCIAS_PERMITIDOS as readonly string[]).includes(mime.toLowerCase());
}

export function tipoEvidencia(mime: string): "foto" | "documento" | "video" | "audio" {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "foto";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "documento";
}

/** Extensão derivada do MIME aceito; nunca do nome enviado pelo usuário. */
export function extensaoSegura(mime: string): string {
  return EXT_POR_MIME[(mime || "").toLowerCase()] || "bin";
}

/** Mensagem de recusa, ou null quando o arquivo é aceitável. */
export function validarArquivoEvidencia(file: { name: string; type: string; size: number }): string | null {
  if (!mimePermitido(file.type)) return `${file.name}: formato não aceito`;
  if (!Number.isFinite(file.size) || file.size <= 0) return `${file.name}: arquivo vazio ou inválido`;
  if (file.size > MAX_EVIDENCIA_BYTES) return `${file.name}: maior que ${MAX_EVIDENCIA_MB}MB`;
  return null;
}

/** Caminho canônico do objeto: cliente_id/aplicacao_id/uuid.ext */
export function caminhoEvidencia(clienteId: string, aplicacaoId: string, uuid: string, mime: string): string {
  return `${clienteId}/${aplicacaoId}/${uuid}.${extensaoSegura(mime)}`;
}

export const MOTIVO_MIN = 5;
export const MOTIVO_MAX = 1000;

/** Motivo de retificação: obrigatório e entre 5 e 1000 caracteres. */
export function validarMotivoRetificacao(motivo: unknown): string | null {
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (texto.length < MOTIVO_MIN) return `Informe o motivo da retificação (mínimo ${MOTIVO_MIN} caracteres)`;
  if (texto.length > MOTIVO_MAX) return `Motivo da retificação deve ter no máximo ${MOTIVO_MAX} caracteres`;
  return null;
}
