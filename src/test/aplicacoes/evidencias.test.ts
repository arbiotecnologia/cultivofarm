import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCEPT_EVIDENCIAS,
  MAX_EVIDENCIA_BYTES,
  caminhoEvidencia,
  extensaoSegura,
  mimePermitido,
  tipoEvidencia,
  validarArquivoEvidencia,
  validarMotivoRetificacao,
} from "@/lib/aplicacoes/evidencias";

const arquivo = (type: string, size = 1024, name = "a.bin") => ({ name, type, size });

describe("evidências de aplicação", () => {
  it.each([
    "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    "application/pdf", "video/mp4", "video/webm", "video/quicktime",
    "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/ogg",
  ])("aceita %s", m => expect(mimePermitido(m)).toBe(true));

  it.each(["application/x-msdownload", "text/html", "image/svg+xml", "", "application/zip"])(
    "recusa %s", m => expect(mimePermitido(m)).toBe(false),
  );

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
    expect(extensaoSegura("audio/x-m4a")).toBe("m4a");
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
