// Renderiza e serve o PDF do Termo de Entrega EXCLUSIVAMENTE a partir do snapshot assinado.
// Nunca lê o estado atual das tabelas de negócio para compor o documento.
import { createClient } from "npm:@supabase/supabase-js@2.110.8";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "entrega-termos";
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_DEADLINE_MS = 15_000;
const PDF_PATH = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/v(\d{1,6})\/termo-[0-9a-f-]{36}\.pdf$/i;

/**
 * Prazo real: o sinal e repassado ao transporte (PostgREST/fetch) E toda espera e
 * limitada por corrida com o sinal. Um transporte que ignore o abort nao segura a
 * resposta; seu resultado tardio e descartado.
 */
class DeadlineError extends Error {}
type Deadline = { signal: AbortSignal; wait: <T>(p: PromiseLike<T>) => Promise<T>; run: <T = any>(b: any) => Promise<T>; dispose: () => void };
function deadline(ms: number, parent?: AbortSignal | null): Deadline {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ms);
  if (parent?.aborted) abort(); else parent?.addEventListener("abort", abort, { once: true });
  const signal = controller.signal;
  const wait = <T,>(p: PromiseLike<T>) => new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(new DeadlineError()); return; }
    const on = () => reject(new DeadlineError());
    signal.addEventListener("abort", on, { once: true });
    Promise.resolve(p).then(
      (v) => { signal.removeEventListener("abort", on); resolve(v); },
      (e) => { signal.removeEventListener("abort", on); reject(e); },
    );
  });
  const run = (b: any) => wait(typeof b?.abortSignal === "function" ? b.abortSignal(signal) : b);
  return { signal, wait, run, dispose: () => { clearTimeout(timer); parent?.removeEventListener("abort", abort); } };
}

/** Bytes do bucket privado via transporte abortavel, com limite aplicado durante o stream. */
async function lerPdfLimitado(d: Deadline, path: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number }> {
  const base = Deno.env.get("SUPABASE_URL")!; const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = `${base}/storage/v1/object/authenticated/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res: Response = await d.wait(fetch(url, { headers: { Authorization: `Bearer ${key}`, apikey: key }, signal: d.signal }));
  if (!res.ok || !res.body) { await res.body?.cancel().catch(() => {}); return { ok: false, status: 404 }; }
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_PDF_BYTES) { await res.body.cancel().catch(() => {}); return { ok: false, status: 413 }; }
  const reader = res.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { done, value } = await d.wait(reader.read());
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PDF_BYTES) { await reader.cancel().catch(() => {}); return { ok: false, status: 413 }; }
      parts.push(value);
    }
  } catch (e) { reader.cancel().catch(() => {}); throw e; }
  if (total <= 0) return { ok: false, status: 404 };
  const bytes = new Uint8Array(total); let off = 0;
  for (const part of parts) { bytes.set(part, off); off += part.byteLength; }
  return { ok: true, bytes };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function s(v: unknown, fallback = "—"): string {
  if (v === null || v === undefined) return fallback;
  const t = String(v).trim();
  return t.length ? t : fallback;
}

function fmtDate(v: unknown): string {
  if (!v) return "—";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

const DISCLAIMER =
  "Comprovacao operacional de recebimento com rastreabilidade (data/hora, usuario, hash). Nao substitui assinatura eletronica avancada nem receituario agronomico.";

/** Renderiza o PDF a partir do snapshot congelado do termo. */
async function renderPdf(termo: Record<string, any>): Promise<Uint8Array> {
  const snap = (termo.snapshot ?? {}) as Record<string, any>;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]);
  let y = 800;
  const left = 40;

  const ensure = (need: number) => {
    if (y - need < 60) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
  };

  const line = (text: string, size = 9, f = font) => {
    ensure(size + 4);
    page.drawText(text.slice(0, 118), { x: left, y, size, font: f });
    y -= size + 4;
  };

  const heading = (text: string) => {
    ensure(24);
    y -= 6;
    page.drawRectangle({ x: left - 4, y: y - 3, width: 515, height: 16, color: rgb(0.90, 0.94, 0.90) });
    page.drawText(text, { x: left, y: y + 1, size: 10, font: bold });
    y -= 20;
  };

  page.drawRectangle({ x: 0, y: 792, width: 595, height: 50, color: rgb(0.07, 0.36, 0.2) });
  page.drawText("TERMO DE ENTREGA E CONFERENCIA", { x: left, y: 818, size: 14, font: bold, color: rgb(1, 1, 1) });
  page.drawText(
    `Versao ${s(termo.versao)} | Template ${s(termo.template_versao)} | Cobertura ${s(termo.cobertura)}`,
    { x: left, y: 802, size: 8, font, color: rgb(1, 1, 1) },
  );
  y = 770;

  const entrega = snap.entrega ?? {};
  const cliente = snap.cliente ?? {};
  const destino = snap.destino ?? {};
  const entregador = snap.entregador ?? {};

  heading("IDENTIFICACAO");
  line(`Cliente: ${s(cliente.razao_social ?? cliente.nome)}`);
  line(`Entrega: ${s(entrega.codigo ?? entrega.id)}`);
  line(`Data de saida: ${fmtDate(entrega.data_saida)}`);
  line(`Snapshot gerado em: ${fmtDate(snap.gerado_em)}`);

  heading("DESTINO");
  line(`Destinatario: ${s(destino.destinatario)}`);
  line(
    `Endereco: ${s(destino.logradouro, "")} ${s(destino.numero, "")} ${s(destino.bairro, "")} - ${s(destino.cidade, "")}/${s(destino.uf, "")} ${s(destino.cep, "")}`.trim(),
  );

  heading("TRANSPORTE");
  line(`Motorista: ${s(entregador.motorista)}   Veiculo: ${s(entregador.veiculo)} ${s(entregador.placa, "")}`);

  heading("ITENS CONFERIDOS");
  const itens: any[] = Array.isArray(snap.itens) ? snap.itens : [];
  if (!itens.length) {
    line("Nenhum item vinculado ao termo.");
  } else {
    line("ETIQUETA | PRODUTO | LOTE | STATUS | QTD | MOTIVO", 8, bold);
    for (const it of itens) {
      const conf = it?.conferencia ?? {};
      line(
        `${s(it?.etiqueta?.codigo ?? it?.etiqueta?.id)} | ${s(it?.produto?.nome)} | ${s(it?.lote?.codigo)} | ` +
          `${s(conf.status, "pendente")} | ${s(conf.quantidade, "-")} | ${s(conf.motivo, "-")}`,
        8,
      );
    }
  }

  const divs: any[] = Array.isArray(snap.divergencias) ? snap.divergencias : [];
  if (divs.length) {
    heading("DIVERGENCIAS REGISTRADAS");
    for (const d of divs) line(`${s(d.status)} | qtd ${s(d.quantidade, "-")} | ${s(d.motivo, "-")}`, 8);
  }

  heading("RECEBEDOR E ASSINATURA");
  line(`Nome: ${s(termo.recebedor_nome)}`);
  line(`Documento: ${s(termo.recebedor_documento)}   Cargo: ${s(termo.recebedor_cargo)}`);
  line(`Assinado em: ${fmtDate(termo.assinado_em)}   Tipo: ${s(termo.assinatura_tipo)}`);
  line(`Origem: ${s(termo.assinatura_origem)}`);

  heading("INTEGRIDADE");
  line(`Hash do snapshot (SHA-256): ${s(termo.snapshot_hash)}`, 8);
  line(`Hash da assinatura: ${s(termo.assinatura_hash)}`, 8);

  ensure(40);
  y -= 10;
  page.drawText(DISCLAIMER.slice(0, 118), { x: left, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 10;
  page.drawText(DISCLAIMER.slice(118), { x: left, y, size: 7, font, color: rgb(0.4, 0.4, 0.4) });

  return await pdf.save();
}

// Cliente sem tipos gerados de banco (mesmo padrao das demais Edges).
// deno-lint-ignore no-explicit-any
type Sdk = any;
type Vigente = { id: string; entrega_id: string; versao: number; pdf_path: string; pdf_hash: string; organization_id: string };

/**
 * Tenant explicito. A policy entrega_termos_select aceita staff de entrega/financeiro
 * sem comparar organizacao; visibilidade RLS sozinha NAO prova isolamento A/B.
 * Exige: tenant canonico do ator (h15_actor_organization, token do usuario) igual ao
 * perfil ativo, e entrega + cliente do termo pertencentes a esse mesmo tenant.
 */
async function provarTenant(d: Deadline, userClient: Sdk, admin: Sdk, userId: string, entregaId: unknown): Promise<string | null> {
  if (typeof entregaId !== "string" || !entregaId) return null;
  const { data: perfil, error: perfilErr } = await d.run(userClient
    .from("profiles").select("user_id, ativo, senha_provisoria, organization_id")
    .eq("user_id", userId).maybeSingle());
  if (perfilErr || !perfil || perfil.user_id !== userId || perfil.ativo !== true ||
    perfil.senha_provisoria === true || !perfil.organization_id) return null;
  const { data: actorOrg, error: orgErr } = await d.run(userClient.rpc("h15_actor_organization"));
  if (orgErr || typeof actorOrg !== "string" || actorOrg !== perfil.organization_id) return null;
  const { data: entrega, error: entErr } = await d.run(admin
    .from("entregas").select("id, organization_id, cliente_id").eq("id", entregaId).maybeSingle());
  if (entErr || !entrega || entrega.organization_id !== actorOrg || !entrega.cliente_id) return null;
  const { data: cliente, error: cliErr } = await d.run(admin
    .from("clientes").select("id, organization_id").eq("id", entrega.cliente_id).maybeSingle());
  if (cliErr || !cliente || cliente.organization_id !== actorOrg) return null;
  return actorOrg;
}

/**
 * Prova completa e fresca: usuario vivo e perfil ativo (token do proprio usuario),
 * visibilidade do termo sob RLS e vigencia (assinado, nao cancelado, nao substituido).
 * Snapshot anterior nunca autoriza: a chamada final compara path/hash com o inicial.
 */
async function provarAcesso(d: Deadline, userClient: Sdk, admin: Sdk, userId: string, termoId: string):
  Promise<{ ok: true; termo: Vigente } | { ok: false; status: number; error: string }> {
  const { data: visivel, error: visErr } = await d.run(userClient
    .from("entrega_termos").select("id").eq("id", termoId).maybeSingle());
  if (visErr || !visivel) return { ok: false, status: 403, error: "acesso_negado" };
  const { data: termo, error: termoErr } = await d.run(admin
    .from("entrega_termos")
    .select("id, entrega_id, versao, status, cancelado_em, assinado_em, pdf_path, pdf_hash")
    .eq("id", termoId).maybeSingle());
  if (termoErr || !termo) return { ok: false, status: 404, error: "termo_nao_encontrado" };
  // Tenant antes de qualquer status: outro tenant nunca aprende cancelado/substituido.
  const org = await provarTenant(d, userClient, admin, userId, termo.entrega_id);
  if (!org) return { ok: false, status: 403, error: "acesso_negado" };
  if (termo.status === "cancelado" || termo.cancelado_em) return { ok: false, status: 409, error: "termo_cancelado" };
  const { data: sucessor, error: sucErr } = await d.run(admin
    .from("entrega_termos").select("id").eq("substitui_termo_id", termoId).limit(1).maybeSingle());
  if (sucErr) return { ok: false, status: 503, error: "vigencia_indisponivel" };
  if (sucessor) return { ok: false, status: 409, error: "termo_substituido" };
  if (termo.status !== "assinado" || !termo.assinado_em) return { ok: false, status: 409, error: "termo_nao_assinado" };
  if (!termo.pdf_path) return { ok: false, status: 409, error: "pdf_nao_gerado" };
  if (!termo.pdf_hash) return { ok: false, status: 409, error: "pdf_integridade_indisponivel" };
  const m = PDF_PATH.exec(String(termo.pdf_path));
  if (!m || m[1].toLowerCase() !== String(termo.entrega_id).toLowerCase() || m[2].toLowerCase() !== termoId.toLowerCase())
    return { ok: false, status: 409, error: "pdf_indisponivel" };
  return { ok: true, termo: { ...(termo as Omit<Vigente, "organization_id">), organization_id: org } };
}

/** Download binario: sem URL portadora, sem assinatura e sem evento de comunicacao. */
async function servirPdf(d: Deadline, userClient: Sdk, admin: Sdk, userId: string, termoId: string): Promise<Response> {
  const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
  try {
    const antes = await provarAcesso(d, userClient, admin, userId, termoId);
    if (!antes.ok) return fail(antes.status, antes.error);
    // Bucket privado sem policy de leitura ao usuario: a leitura de bytes usa o
    // servico SOMENTE apos a prova acima e e re-provada antes de responder.
    const lido = await lerPdfLimitado(d, antes.termo.pdf_path);
    if (!lido.ok) return fail(lido.status, "pdf_indisponivel");
    if (await d.wait(sha256Hex(lido.bytes)) !== antes.termo.pdf_hash) return fail(409, "pdf_hash_divergente");
    const depois = await provarAcesso(d, userClient, admin, userId, termoId);
    if (!depois.ok) return fail(depois.status, depois.error);
    if (depois.termo.organization_id !== antes.termo.organization_id) return fail(403, "acesso_negado");
    if (depois.termo.pdf_path !== antes.termo.pdf_path || depois.termo.pdf_hash !== antes.termo.pdf_hash)
      return fail(409, "termo_alterado");
    if (d.signal.aborted) return fail(504, "download_indisponivel");
    return new Response(lido.bytes, { status: 200, headers: { ...corsHeaders,
      "Content-Type": "application/pdf", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="termo-entrega-v${Number(antes.termo.versao) || 0}.pdf"`,
    } });
  } catch {
    return fail(d.signal.aborted ? 504 : 500, "download_indisponivel");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Prazo unico de 15 s para Auth, provas e bytes do download (generate: Auth/visibilidade/tenant).
  const d = deadline(DOWNLOAD_DEADLINE_MS, req.signal);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    // Verificacao viva no Auth (sessao/usuario existentes), nao apenas assinatura local do JWT.
    const { data: userData, error: userErr } = await d.wait(userClient.auth.getUser(authHeader.slice(7)));
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ error: "unauthorized" }, 401);

    const body = await d.wait(req.json()).catch((e) => { if (e instanceof DeadlineError) throw e; return {}; });
    const termoId = typeof body?.termo_id === "string" ? body.termo_id : null;
    // Clientes antigos: URL portadora desativada de forma explicita (410), sem assinar.
    if (body?.action === "signed_url") return json({ error: "signed_url_desativada" }, 410);
    if (body?.action !== undefined && body.action !== "generate" && body.action !== "download")
      return json({ error: "acao_invalida" }, 400);
    const action = body?.action === "download" ? "download" : "generate";
    if (!termoId || !/^[0-9a-f-]{36}$/i.test(termoId)) return json({ error: "termo_id_invalido" }, 400);

    // Autorizacao por vinculo: leitura sob RLS com o token do usuario.
    const { data: visivel, error: visErr } = await d.run(userClient
      .from("entrega_termos")
      .select("id")
      .eq("id", termoId)
      .maybeSingle());
    if (visErr) return json({ error: "acesso_negado" }, 403);
    if (!visivel) return json({ error: "acesso_negado" }, 403);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (action === "download") return await servirPdf(d, userClient, admin, userId, termoId);

    const { data: termo, error: termoErr } = await d.run(admin
      .from("entrega_termos")
      .select("*")
      .eq("id", termoId)
      .maybeSingle());
    if (termoErr || !termo) return json({ error: "termo_nao_encontrado" }, 404);
    // generate le/grava com servico e publica evento: mesmo tenant explicito exigido.
    if (!(await provarTenant(d, userClient, admin, userId, termo.entrega_id))) return json({ error: "acesso_negado" }, 403);

    // Documento cancelado nunca e servido como vigente.
    if (termo.status === "cancelado" || termo.cancelado_em) return json({ error: "termo_cancelado" }, 409);

    // Documento substituido (existe versao posterior que o referencia) tambem nao e vigente.
    const { data: sucessor } = await admin
      .from("entrega_termos")
      .select("id")
      .eq("substitui_termo_id", termoId)
      .limit(1)
      .maybeSingle();
    if (sucessor) return json({ error: "termo_substituido" }, 409);

    if (termo.status !== "assinado" || !termo.assinado_em) return json({ error: "termo_nao_assinado" }, 409);

    // --- generate (idempotente) ---
    if (termo.pdf_path) {
      const { data: existing } = await admin.storage.from(BUCKET).download(termo.pdf_path);
      if (existing) {
        const hash = await sha256Hex(new Uint8Array(await existing.arrayBuffer()));
        if (termo.pdf_hash && hash !== termo.pdf_hash) return json({ error: "pdf_hash_divergente" }, 409);
        return json({ replay: true, pdf_path: termo.pdf_path, pdf_hash: termo.pdf_hash });
      }
    }

    const bytes = await renderPdf(termo);
    const pdfHash = await sha256Hex(bytes);
    // Nome de objeto nao previsivel, segmentado por entrega/termo/versao.
    const path = `${termo.entrega_id}/${termo.id}/v${termo.versao}/termo-${crypto.randomUUID()}.pdf`;

    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upErr) return json({ error: "falha_upload" }, 500);

    const { error: regErr } = await admin.rpc("rpc_entrega_registrar_pdf_termo_v1", {
      p_termo_id: termo.id,
      p_pdf_path: path,
      p_pdf_hash: pdfHash,
    });
    if (regErr) {
      // Perdeu a corrida ou termo ja possui PDF: descarta o objeto orfao.
      await admin.storage.from(BUCKET).remove([path]);
      const { data: atual } = await admin
        .from("entrega_termos")
        .select("pdf_path, pdf_hash")
        .eq("id", termo.id)
        .maybeSingle();
      if (atual?.pdf_path) return json({ replay: true, pdf_path: atual.pdf_path, pdf_hash: atual.pdf_hash });
      return json({ error: "falha_registro_pdf" }, 409);
    }

    // Evento de comunicacao por referencia (fila existente). Falha nao reverte a entrega.
    try {
      await admin.rpc("rpc_publish_communication_event_v2", {
        p_event_key: "entrega.termo_assinado",
        p_source_type: "entrega_termo",
        p_source_id: termo.id,
        p_payload: {
          entrega_id: termo.entrega_id,
          termo_id: termo.id,
          versao: termo.versao,
          cobertura: termo.cobertura,
          snapshot_hash: termo.snapshot_hash,
          pdf_hash: pdfHash,
        },
        p_idempotency_key: `entrega_termo_pdf:${termo.id}:${termo.versao}`,
      });
    } catch (_e) {
      console.error("comunicacao_evento_falhou", { termo_id: termo.id });
    }

    return json({ replay: false, pdf_path: path, pdf_hash: pdfHash });
  } catch (e) {
    if (e instanceof DeadlineError || d.signal.aborted) return json({ error: "tempo_esgotado" }, 504);
    console.error("entrega-termo-pdf_error", e instanceof Error ? e.message : "unknown");
    return json({ error: "erro_interno" }, 500);
  } finally {
    d.dispose();
  }
});
