import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED } from "@/lib/authz/attachmentBlobGate";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "test" && name !== "integrations") walk(p, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const runtime = walk("src").map(p => [p, readFileSync(p, "utf8")] as const);

describe("anexos técnicos/portais: nenhuma nova capacidade assinada", () => {
  it("gate autenticado ativo", () => expect(AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED).toBe(true));
  it("nenhum código de runtime do frontend chama createSignedUrl(s)", () => {
    expect(runtime.filter(([, s]) => /createSignedUrls?\s*\(/.test(s)).map(([p]) => p)).toEqual([]);
  });
  it("helper de assinatura de order-attachments removido", () => {
    expect(readFileSync("src/hooks/useCommercial.ts", "utf8")).not.toContain("getAttachmentSignedUrl");
  });
  it("useSignedUrls só delega ao download autenticado", () => {
    const s = readFileSync("src/hooks/useSignedUrls.ts", "utf8");
    expect(s).toContain("useAuthenticatedBlobUrls"); expect(s).not.toMatch(/supabase|AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED/);
  });
  const consumers = ["src/components/visita/roteiro/RoteiroVisita.tsx", "src/components/visita/EvidenciasTabs.tsx", "src/pages/app/MobileTalhaoHistorico.tsx",
    "src/components/talhoes/HistoricoTalhao.tsx", "src/components/solicitacoes/TimelineAtendimento.tsx", "src/components/solicitacoes/SolicitacaoDetalheTabs.tsx"];
  for (const p of consumers) it(`${p} não usa URL gravada como fallback do blob`, () => {
    const s = readFileSync(p, "utf8");
    expect(s).not.toMatch(/signedUrls\[[^\]]+\]\)\s*\|\|\s*(url|ev\.\w+Url|arquivo\.arquivo_url)\b/);
  });
  it("galeria de aplicações não depende do gate (rollback do gate não reabre assinatura)", () => {
    expect(readFileSync("src/components/aplicacao/EvidenciasGallery.tsx", "utf8")).not.toContain("AUTHENTICATED_ATTACHMENT_BLOBS_ENABLED");
  });
});
