import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCEPT_EVIDENCIAS,
  MAX_EVIDENCIA_BYTES,
  MIME_EVIDENCIAS_PERMITIDOS,
  caminhoEvidencia,
  ehDispositivoMovel,
  extensaoSegura,
  mimeCanonicoCamera,
  normalizarArquivoCamera,
  mimePermitido,
  tipoEvidencia,
  validarArquivoEvidencia,
  validarMotivoRetificacao,
} from "@/lib/aplicacoes/evidencias";

const arquivo = (type: string, size = 1024, name = "a.bin") => ({ name, type, size });

/** Lista canônica exata do bucket/constraint do Supabase CultivoFarm. */
const MIME_CANONICOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
];

describe("evidências de aplicação", () => {
  it("a allowlist do frontend é exatamente igual à lista canônica do bucket", () => {
    expect(MIME_EVIDENCIAS_PERMITIDOS).toEqual(MIME_CANONICOS);
    expect(ACCEPT_EVIDENCIAS).toBe(MIME_CANONICOS.join(","));
  });

  it.each(MIME_CANONICOS)("aceita %s", m => expect(mimePermitido(m)).toBe(true));

  it.each(["application/x-msdownload", "text/html", "image/svg+xml", "", "application/zip"])(
    "recusa %s", m => expect(mimePermitido(m)).toBe(false),
  );

  it("rejeita aliases de áudio que não estão na allowlist canônica", () => {
    const aliasesProibidos = ["audio/mp3", "audio/m4a", "audio/x-m4a", "audio/x-wav", "audio/wave"];
    for (const mime of aliasesProibidos) {
      expect(mimePermitido(mime)).toBe(false);
      expect(extensaoSegura(mime)).toBe("bin");
    }
  });

  it("limita a 10MB e recusa arquivo vazio", () => {
    expect(MAX_EVIDENCIA_BYTES).toBe(10 * 1024 * 1024);
    expect(validarArquivoEvidencia(arquivo("image/png", MAX_EVIDENCIA_BYTES))).toBeNull();
    expect(validarArquivoEvidencia(arquivo("image/png", MAX_EVIDENCIA_BYTES + 1))).toMatch(/10MB/);
    expect(validarArquivoEvidencia(arquivo("image/png", 0))).toMatch(/inválido|vazio/);
    expect(validarArquivoEvidencia(arquivo("text/html"))).toMatch(/não aceito/);
  });

  it("classifica e deriva extensão do MIME, não do nome", () => {
    expect(tipoEvidencia("video/quicktime")).toBe("video");
    expect(tipoEvidencia("audio/ogg")).toBe("audio");
    expect(tipoEvidencia("application/pdf")).toBe("documento");
    expect(extensaoSegura("video/quicktime")).toBe("mov");
    expect(extensaoSegura("audio/webm")).toBe("webm");
    expect(extensaoSegura("audio/mp4")).toBe("m4a");
    expect(extensaoSegura("audio/x-m4a")).toBe("bin");
    expect(caminhoEvidencia("cli", "apl", "uuid", "image/jpeg")).toBe("cli/apl/uuid.jpg");
  });

  it("valida motivo de retificação entre 5 e 1000 caracteres", () => {
    expect(validarMotivoRetificacao("abc")).toMatch(/mínimo/);
    expect(validarMotivoRetificacao("   ")).toMatch(/mínimo/);
    expect(validarMotivoRetificacao("a".repeat(1001))).toMatch(/máximo/);
    expect(validarMotivoRetificacao("correção de dose")).toBeNull();
  });

  it("uploader só sobe objetos, limpa em falha e não grava URL assinada", () => {
    const src = readFileSync("src/components/aplicacao/EvidenciasUploader.tsx", "utf8");
    expect(src).not.toContain("createSignedUrl");
    expect(src).not.toContain("aplicacao_evidencias_vinculos");
    expect(src).toContain("export async function limparObjetosEvidencias");
    expect(src).toContain("await limparObjetosEvidencias(enviados)");
    expect(src).toContain("accept={ACCEPT_EVIDENCIAS}");
    expect(ACCEPT_EVIDENCIAS).toContain("image/heic");
  });

  it("formulários usam a RPC atômica e limpam objetos em falha", () => {
    for (const arq of ["src/components/aplicacao/AplicacaoFormDialog.tsx", "src/pages/app/MobileAplicacoes.tsx"]) {
      const src = readFileSync(arq, "utf8");
      expect(src).toContain("rpc_salvar_aplicacao_v1");
      expect(src).toContain("limparObjetosEvidencias");
      expect(src).toContain("validarMotivoRetificacao");
      expect(src).not.toContain('.from("aplicacoes").insert');
    }
  });

  it("mobile finaliza a OS pela esteira e nunca por update direto", () => {
    const src = readFileSync("src/pages/app/MobileAplicacoes.tsx", "utf8");
    expect(src).toContain("rpc_avancar_esteira_laboratorio");
    expect(src).not.toContain('.from("ordens_servico").update');
    expect(src).toContain("_source_type: \"aplicacao\"");
  });

  it("card não regrava email_envio após sucesso da função de envio", () => {
    const src = readFileSync("src/components/aplicacao/AplicacaoCard.tsx", "utf8");
    expect(src).not.toContain('.from("aplicacoes").update');
  });
});

describe("câmera: normalização canônica e fallback", () => {
  const criar = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

  it("normaliza apenas MIMEs equivalentes de JPEG", () => {
    expect(mimeCanonicoCamera("a.jpg", "image/jpg")).toBe("image/jpeg");
    expect(mimeCanonicoCamera("a.jpg", "image/pjpeg")).toBe("image/jpeg");
    expect(mimeCanonicoCamera("a.png", "image/png")).toBe("image/png");
  });

  it("infere de extensão somente quando o MIME vem vazio", () => {
    for (const [nome, esperado] of [
      ["f.jpg", "image/jpeg"],
      ["f.JPEG", "image/jpeg"],
      ["f.png", "image/png"],
      ["f.webp", "image/webp"],
      ["f.heic", "image/heic"],
      ["f.heif", "image/heif"],
    ] as const) {
      expect(mimeCanonicoCamera(nome, "")).toBe(esperado);
    }
  });

  it("recusa PDF, vídeo e áudio na entrada de câmera mesmo estando na allowlist geral", () => {
    for (const mime of ["application/pdf", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "audio/webm"]) {
      expect(mimePermitido(mime)).toBe(true);
      expect(mimeCanonicoCamera("arquivo", mime)).toBeNull();
      expect(normalizarArquivoCamera(criar("arquivo", mime))).toBeNull();
    }
    expect(mimeCanonicoCamera("doc.pdf", "")).toBeNull();
    expect(mimeCanonicoCamera("v.mp4", "")).toBeNull();
  });

  it("aceita apenas as cinco imagens canônicas da câmera", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
      expect(mimeCanonicoCamera("f", mime)).toBe(mime);
    }
  });

  it("recusa extensão e MIME desconhecidos sem ampliar a allowlist", () => {
    expect(mimeCanonicoCamera("f.gif", "")).toBeNull();
    expect(mimeCanonicoCamera("f", "")).toBeNull();
    expect(mimeCanonicoCamera("f.exe", "application/x-msdownload")).toBeNull();
    expect(mimeCanonicoCamera("f.svg", "image/svg+xml")).toBeNull();
    expect(normalizarArquivoCamera(criar("f.gif", "image/gif"))).toBeNull();
  });

  it("reembala o File com o MIME canônico e mantém o já canônico", () => {
    const jpg = normalizarArquivoCamera(criar("foto.jpg", "image/jpg"));
    expect(jpg?.type).toBe("image/jpeg");
    expect(jpg?.name).toBe("foto.jpg");
    const canonico = criar("foto.png", "image/png");
    expect(normalizarArquivoCamera(canonico)).toBe(canonico);
    expect(validarArquivoEvidencia(jpg!)).toBeNull();
  });

  it("detecta iPadOS em modo desktop e userAgentData.mobile", () => {
    expect(ehDispositivoMovel({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(ehDispositivoMovel({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(ehDispositivoMovel({ userAgent: "X", userAgentData: { mobile: true } })).toBe(true);
    expect(ehDispositivoMovel({ userAgent: "Mozilla/5.0 (Linux; Android 13)" })).toBe(true);
    expect(ehDispositivoMovel(undefined)).toBe(false);
  });

  it("diálogo de câmera tem fallback visível e trata erros específicos", () => {
    const src = readFileSync("src/components/aplicacao/CameraCaptureDialog.tsx", "utf8");
    expect(src).toContain("Usar câmera/galeria do dispositivo");
    expect(src).toContain('accept="image/*"');
    expect(src).toContain('capture="environment"');
    for (const nome of ["NotAllowedError", "NotFoundError", "NotReadableError", "AbortError", "OverconstrainedError"]) {
      expect(src).toContain(nome);
    }
    expect(src).toContain("getUserMedia({ video: true, audio: false })");
  });

  it("captura bloqueada até o vídeo estar pronto e tracks sempre encerradas", () => {
    const src = readFileSync("src/components/aplicacao/CameraCaptureDialog.tsx", "utf8");
    expect(src).toContain("disabled={!!error || loading || !pronto}");
    expect(src).toContain("onLoadedMetadata={avaliarProntidao}");
    expect(src).toContain("onCanPlay={avaliarProntidao}");
    expect(src).toContain("v.videoWidth > 0 && v.videoHeight > 0");
    expect(src).toContain("tentativaRef");
    expect(src).toContain("descartar(stream)");
    expect(src).not.toContain("video.play().catch(() => {})");
  });

  it("ambos os fluxos usam input de câmera image/* com capture e sem DataTransfer", () => {
    for (const arq of ["src/components/aplicacao/EvidenciasUploader.tsx", "src/pages/app/MobileAplicacoes.tsx"]) {
      const src = readFileSync(arq, "utf8");
      expect(src).toContain('accept="image/*" capture="environment"');
      expect(src).toContain("normalizarArquivoCamera");
      expect(src).not.toContain("DataTransfer");
    }
    const up = readFileSync("src/components/aplicacao/EvidenciasUploader.tsx", "utf8");
    expect(up).toContain("incluirArquivos([file], true)");
    expect(up).toContain("ehDispositivoMovel()");
  });
});
