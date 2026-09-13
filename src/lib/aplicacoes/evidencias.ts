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

/**
 * Detecção de dispositivo móvel, incluindo iPadOS em modo desktop
 * (MacIntel/Macintosh com touch) e `navigator.userAgentData.mobile`.
 */
export function ehDispositivoMovel(nav: any = typeof navigator !== "undefined" ? navigator : undefined): boolean {
  if (!nav) return false;
  if (typeof nav.userAgentData?.mobile === "boolean" && nav.userAgentData.mobile) return true;
  const ua = String(nav.userAgent || "");
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return true;
  const plataformaMac = /MacIntel|Macintosh/i.test(String(nav.platform || "")) || /Macintosh/i.test(ua);
  return plataformaMac && Number(nav.maxTouchPoints || 0) > 1;
}

/**
 * Entrada de câmera aceita SOMENTE imagens desta lista, ainda que o catálogo
 * geral de evidências aceite PDF, vídeo e áudio.
 */
const MIME_CAMERA_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** MIMEs equivalentes que algumas câmeras devolvem fora do padrão. */
const MIME_CANONICO_CAMERA: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
};

const cameraPermitido = (mime: string) =>
  (MIME_CAMERA_PERMITIDOS as readonly string[]).includes(mime) && mimePermitido(mime);

/** Inferência por extensão usada SOMENTE quando o MIME vem vazio da câmera. */
const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

/**
 * MIME canônico para arquivos vindos da captura/câmera. Devolve null quando
 * não é possível resolver com segurança — a allowlist do bucket não é ampliada.
 */
export function mimeCanonicoCamera(nome: string, mime: string): string | null {
  const bruto = (mime || "").toLowerCase().trim();
  if (bruto) {
    const alvo = MIME_CANONICO_CAMERA[bruto] || bruto;
    return cameraPermitido(alvo) ? alvo : null;
  }
  const ext = (nome || "").toLowerCase().split(".").pop() || "";
  const inferido = MIME_POR_EXTENSAO[ext];
  return inferido && cameraPermitido(inferido) ? inferido : null;
}

/**
 * Normaliza um File vindo da câmera/captura. Retorna o próprio arquivo quando
 * já está canônico, um File reembalado quando só o MIME precisa mudar, ou null
 * quando o formato não é aceito.
 */
export function normalizarArquivoCamera(file: File): File | null {
  const alvo = mimeCanonicoCamera(file.name, file.type);
  if (!alvo) return null;
  if (alvo === file.type) return file;
  return new File([file], file.name, { type: alvo, lastModified: file.lastModified });
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
