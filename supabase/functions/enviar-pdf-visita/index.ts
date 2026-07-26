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
  copiaConsultorEmail?: string;
  registroId?: string;
  clienteNome?: string;
  fazendaNome?: string;
  talhaoNome?: string;
  dataVisita?: string;
  problemaPrincipal?: string;
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
  if (body.copiaConsultorEmail && !isValidEmail(body.copiaConsultorEmail)) {
    return json(400, { error: "E-mail de cópia inválido" });
  }

  const decoded = decodePdfBase64(body.pdfBase64, MAX_PDF_BYTES);
  if ("error" in decoded) return json(400, { error: decoded.error });

  // Autorização: staff (admin/gestor/consultor/aplicador/producao/administrativo) OU dono do registro.
  if (caller.kind === "user") {
    const isStaff = hasAnyRole(caller, STAFF_ROLES);
    const { data: reg, error: regErr } = await supabase
      .from("registros_consultor")
      .select("id, consultor_responsavel, created_by")
      .eq("id", body.registroId)
      .maybeSingle();
    if (regErr) return json(500, { error: "Falha ao validar registro" });
    if (!reg) return json(404, { error: "Registro não encontrado" });
    const isOwner =
      reg.consultor_responsavel === caller.userId || reg.created_by === caller.userId;
    if (!isStaff && !isOwner) {
      return json(403, { error: "Sem autorização para este registro" });
    }
  }

  const safeName = sanitizeFileName(body.fileName, "visita.pdf");
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("visitas-pdf")
    .upload(path, decoded.bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upErr) {
    console.error("Upload error:", upErr);
    return json(500, { error: "Falha ao armazenar PDF" });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from("visitas-pdf")
    .createSignedUrl(path, 60 * 60 * 24 * 3); // 3 dias (reduzido de 7)
  if (signErr || !signed) {
    console.error("Sign url error:", signErr);
    // Limpa órfão para não deixar arquivo sem link.
    await supabase.storage.from("visitas-pdf").remove([path]).catch(() => {});
    return json(500, { error: "Falha ao gerar link" });
  }
  const downloadUrl = signed.signedUrl;

  // Envio best-effort. `send-transactional-email` pode não estar implantada.
  // emailSent só é true quando a função responde com sinal explícito de envio.
  let emailSent = false;
  let emailError: string | null = null;
  try {
    const dataFormatada = body.dataVisita
      ? new Date(body.dataVisita).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");
    const idempotencyKey = `visita-pdf-${body.registroId}-${body.destinatarioEmail}`;

    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
      "send-transactional-email",
      {
        body: {
          templateName: "visita-pdf",
          recipientEmail: body.destinatarioEmail,
          idempotencyKey,
          templateData: {
            clienteNome: body.destinatarioNome || body.clienteNome || "Produtor(a)",
            fazendaNome: body.fazendaNome || "—",
            talhaoNome: body.talhaoNome || "—",
            dataVisita: dataFormatada,
            problemaPrincipal: body.problemaPrincipal || "—",
            downloadUrl,
          },
        },
      },
    );
    if (invokeErr) {
      emailError = invokeErr.message ?? "invoke error";
    } else if (invokeData && typeof invokeData === "object") {
      const d = invokeData as Record<string, unknown>;
      if (d.success === true || d.sent === true || d.status === "sent") {
        emailSent = true;
      } else {
        emailError = typeof d.error === "string" ? d.error : "resposta sem sinal de envio";
      }
    } else {
      emailError = "resposta vazia da send-transactional-email";
    }
    if (body.copiaConsultorEmail) {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "visita-pdf",
          recipientEmail: body.copiaConsultorEmail,
          idempotencyKey: `${idempotencyKey}-copy`,
          templateData: {
            clienteNome: "Consultor(a)",
            fazendaNome: body.fazendaNome || "—",
            talhaoNome: body.talhaoNome || "—",
            dataVisita: dataFormatada,
            problemaPrincipal: body.problemaPrincipal || "—",
            downloadUrl,
          },
        },
      }).catch(() => {});
    }
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  return json(200, { success: true, downloadUrl, emailSent, emailError, path });
});
