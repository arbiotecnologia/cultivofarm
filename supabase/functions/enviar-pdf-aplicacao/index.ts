// Fase 0.2 (revisão bloqueante): registro server-side pela RPC.
// Regras críticas:
//  - Nunca retornamos success=true se o registro em aplicacao_emails falhar.
//  - Não usamos dados do corpo para autorizar destinatário: a autorização por
//    destinatário é feita 100% contra e-mails cadastrados no cliente da OS.
//  - Se o registro falhar antes do downloadUrl ser rastreado, fazemos cleanup do objeto.
import {
  authenticate,
  decodePdfBase64,
  hasAnyRole,
  isValidEmail,
  json,
  MAX_PDF_BYTES,
  requirePost,
  sanitizeFileName,
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

  if (caller.kind !== "user") {
    return json(403, { error: "Identidade de usuário obrigatória para enviar PDF de aplicação" });
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

  // Vínculo do caller à aplicação + destinatário cadastrado no cliente.
  // A Edge nunca usa nome/e-mail do body como prova de autorização.
  const { data: apl, error: aplErr } = await supabase
    .from("aplicacoes")
    .select("id, responsavel_id, created_by, ordens_servico!inner(cliente_id, clientes!inner(email, contato_financeiro_email))")
    .eq("id", body.registroId)
    .maybeSingle();
  if (aplErr) return json(500, { error: "Falha ao validar aplicação" });
  if (!apl) return json(404, { error: "Aplicação não encontrada" });

  const linkedEmails = new Set(
    [
      apl.ordens_servico?.clientes?.email,
      apl.ordens_servico?.clientes?.contato_financeiro_email,
    ]
      .filter((email): email is string => typeof email === "string" && email.trim().length > 0)
      .map((email) => email.trim().toLowerCase()),
  );
  if (!linkedEmails.has(body.destinatarioEmail.trim().toLowerCase())) {
    return json(403, { error: "Destinatário não cadastrado para esta aplicação" });
  }

  const isOwner = apl.responsavel_id === caller.userId || apl.created_by === caller.userId;
  const isAdmin = hasAnyRole(caller, ["administrador"]);
  if (!isAdmin && !isOwner) {
    return json(403, { error: "Sem autorização para esta aplicação" });
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
    console.error("Upload error");
    return json(500, { error: "Falha ao armazenar PDF" });
  }

  const cleanupObject = async () => {
    await supabase.storage.from("aplicacao-evidencias").remove([path]).catch(() => {});
  };

  const { data: signed, error: signErr } = await supabase.storage
    .from("aplicacao-evidencias")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias
  if (signErr || !signed) {
    await cleanupObject();
    return json(500, { error: "Falha ao gerar link" });
  }
  const downloadUrl = signed.signedUrl;

  // Chave de idempotência DETERMINÍSTICA (sem Date.now, com dia BR).
  const nowBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dayKey = nowBR.toISOString().slice(0, 10);
  const idempotencyKey =
    `aplicacao-pdf-${body.registroId}-${body.destinatarioEmail.toLowerCase()}-${dayKey}`;

  const enviadoPor = caller.userId;

  // Tentativa best-effort de envio. `send-transactional-email` pode não existir.
  let emailSent = false;
  let emailError: string | null = null;
  let transactionalPresent = false;

  try {
    const dataFormatada = body.dataAplicacao
      ? new Date(body.dataAplicacao).toLocaleDateString("pt-BR")
      : new Date().toLocaleDateString("pt-BR");

    const { data: invokeData, error: invokeErr } = await supabase.functions.invoke(
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
            empresaNome: body.empresaNome || "AR BIO",
            fazendaNome: body.fazendaNome || "—",
            talhaoNome: body.talhaoNome || "—",
            produtoNome: body.produtoNome || "—",
            dataAplicacao: dataFormatada,
            downloadUrl,
          },
        },
      },
    );

    if (invokeErr) {
      emailError = invokeErr.message ?? "invoke error";
    } else if (invokeData && typeof invokeData === "object") {
      transactionalPresent = true;
      const d = invokeData as Record<string, unknown>;
      if (d.success === true || d.sent === true || d.status === "sent") {
        emailSent = true;
      } else {
        emailError = typeof d.error === "string" ? d.error : "resposta sem sinal de envio";
      }
    } else {
      emailError = "resposta vazia da send-transactional-email";
    }
  } catch (e) {
    emailError = e instanceof Error ? e.message : String(e);
  }

  const finalStatus: string = emailSent
    ? "sent"
    : transactionalPresent
    ? "failed"
    : "link_generated_no_send";

  // Registro server-side (RPC valida destinatário e vínculo, aceita evolução de status).
  const { data: recordRes, error: recErr } = await supabase.rpc(
    "rpc_record_aplicacao_email",
    {
      _aplicacao_id: body.registroId,
      _email: body.destinatarioEmail,
      _status: finalStatus,
      _idempotency_key: idempotencyKey,
      _enviado_por: enviadoPor,
    },
  );

  if (recErr) {
    // FALHA CRÍTICA: sem registro rastreável, o link não deve permanecer.
    await cleanupObject();
    return json(500, {
      error: "Falha ao registrar envio",
      details: (recErr as { message?: string }).message ?? "rpc error",
    });
  }

  // Best-effort: atualiza email_envio da aplicação (não é crítico).
  await supabase
    .from("aplicacoes")
    .update({ email_envio: body.destinatarioEmail })
    .eq("id", body.registroId);

  return json(200, {
    success: true,
    downloadUrl,
    emailSent,
    emailError,
    status: finalStatus,
    record: recordRes ?? null,
  });
});
