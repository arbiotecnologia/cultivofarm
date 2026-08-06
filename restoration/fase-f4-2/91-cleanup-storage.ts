/**
 * FASE F4.2 — remoção dos objetos de Storage criados pelo harness.
 * Somente caminhos sob o prefixo da tag. Nenhum objeto real é tocado.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("F42_SUPABASE_URL") ?? "";
const key = Deno.env.get("F42_SERVICE_ROLE_KEY") ?? "";
const tag = Deno.env.get("F42_TAG") ?? "";
if (!url || !key || !tag.startsWith("F42-HARNESS-")) {
  console.error("ABORT: ambiente incompleto para cleanup de storage");
  Deno.exit(2);
}
if (url.includes("navfzbwgwzruipouyfnk") || !url.includes("ikaauvsflpmamgxmkhoq")) {
  console.error("ABORT: alvo nao autorizado");
  Deno.exit(2);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// 1. Certificado sintético.
const certPrefix = `f42-harness/${tag}`;
const certList = await admin.storage.from("fiscal-certificates").list(certPrefix);
if (certList.data?.length) {
  await admin.storage.from("fiscal-certificates")
    .remove(certList.data.map((o) => `${certPrefix}/${o.name}`));
}

// 2. Artefatos XML das execuções do harness (paths vindos do banco).
const evidencePath = `${Deno.env.get("F42_OUT_DIR") ?? "./artifacts"}/f42-${tag}.json`;
try {
  const ev = JSON.parse(await Deno.readTextFile(evidencePath)) as {
    uploadedObjects?: { bucket: string; path: string }[];
  };
  const xml = (ev.uploadedObjects ?? []).filter((o) => o.bucket === "fiscal-xml");
  if (xml.length) {
    await admin.storage.from("fiscal-xml").remove(xml.map((o) => o.path));
  }
} catch {
  console.warn("aviso: evidencia ausente; artefatos XML podem exigir remocao manual");
}

console.log(`storage limpo para a tag ${tag}`);
