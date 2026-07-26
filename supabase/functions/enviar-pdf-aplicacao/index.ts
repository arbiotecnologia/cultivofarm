import {
  authenticate,
  decodePdfBase64,
  hasAnyRole,
  isValidEmail,
  json,
  MAX_PDF_BYTES,
  requirePost,
  sanitizeFileName,
  STAFF_ROLES,
} from "../_shared/auth-guard.ts";

interface Payload {
  pdfBase64?: string;
  fileName?: string;
  destinatarioEmail?: string;
  destinatarioNome?: string;
  registroId?: string; // aplicacao_id
  empresaNome?: string;
  fazendaNome?: string;
  talhaoNome?: string;
  produtoNome?: string;
  dataAplicacao?: string;
  customSubject?: string;
  customMessage?: string;
}

Deno.serve(async (req) => {
  const early = requirePost(req);
  if (early) return early;

  const auth = await authenticate(req);
  if ("error" in auth) return auth.error;
  const { caller, supabase } = auth;

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return json(400, { error: "JSON inválido" });
  }

  if (!body.pdfBase64 || !body.fileName || !body.destinatarioEmail || !body.registroId) {
    return json(400, {
      error: "Campos obrigatórios: pdfBase64, fileName, destinatarioEmail, registroId",
    });
  }
  if (!isValidEmail(body.destinatarioEmail)) {
    return json(400, { error: "E-mail do destinatário inválido" });
  }

  const decoded = decodePdfBase64(body.pdfBase64, MAX_PDF_BYTES);
  if ("error" in decoded) return json(400, { error: decoded.error });

  if (caller.kind === "user") {
    const isStaff = hasAnyRole(caller, STAFF_ROLES);
    const { data: apl, error: aplErr } = await supabase
      .from("aplicacoes")
      .select("id, responsavel_id, created_by")
      .eq("id", body.registroId)
      .maybeSingle();
    if (aplErr) return json(500, { error: "Falha ao validar aplicação" });
    if (!apl) return json(404, { error: "Aplicação não encontrada" });
    const isOwner =
      apl.responsavel_id === caller.userId || apl.created_by === caller.userId;
    if (!isStaff && !isOwner) {
      return json(403, { error: "Sem autorização para esta aplicação" });
    }
  }

  const safeName = sanitizeFileName(body.fileName, "aplicacao.pdf");
  const path = `${new Date().getFullYear()}/aplicacoes/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("aplicacao-evidencias")
    .upload(path, decoded.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) {
    console.error("Upload error:", upErr);
    return json(500, { error: "Falha ao armazenar PDF" });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("aplicacao-evidencias")
    .createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signErr || !signed) return json(500, { error: "Falha ao gerar link" });
  const downloadUrl = signed.signedUrl;

  // Registro seguro do envio (respeita RLS via RPC).
  const { error: logErr } = await supabase.rpc("rpc_record_aplicacao_email", {
    _aplicacao_id: body.registroId,
    _email: body.destinatarioEmail,
    _status: "queued",
  });
  if (logErr) console.warn("rpc_record_aplicacao_email falhou:", logErr.message);

  let emailSent = false;
  let emailError: string | null = null;
  try {
    const dataFormatada = body.dataAplicacao
      ? new Date(body.dataAplicacao).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");
    const idempotencyKey = `aplicacao-pdf-${body.registroId}-${body.destinatarioEmail}-${Date.now()}`;

    const { error: invokeErr } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "aplicacao-pdf",
          recipientEmail: body.destinatarioEmail,
          idempotencyKey,
          templateData: {
            subject: body.customSubject,
            message: body.customMessage,
            destinatarioNome: body.destinatarioNome || "Produtor(a)",
            empresaNome: body.empresaNome || "PULSE AGRÍCOLA",
            fazendaNome: body.fazendaNome || "—",
            talhaoNome: body.talhaoNome || "—",
            produtoNome: body.produtoNome || "—",
            dataAplicacao: dataFormatada,
            downloadUrl,
          },
        },
      },
    );
    if (invokeErr) emailError = invokeErr.message;
    else emailSent = true;
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  return json(200, { success: true, downloadUrl, emailSent, emailError });
});
