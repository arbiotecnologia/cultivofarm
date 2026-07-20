// Edge function: recebe um PDF (base64) + dados do destinatário,
// faz upload no bucket privado, gera signed URL (7 dias) e envia e-mail
// com o link. Se o domínio de e-mail ainda não estiver configurado,
// retorna apenas o link para download manual.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  pdfBase64: string;
  fileName: string;
  destinatarioEmail: string;
  destinatarioNome?: string;
  copiaConsultorEmail?: string;
  registroId?: string;
  clienteNome?: string;
  fazendaNome?: string;
  talhaoNome?: string;
  dataVisita?: string;
  problemaPrincipal?: string;
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json()) as Payload;

    // Validação
    if (!body.pdfBase64 || !body.fileName || !body.destinatarioEmail) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!isValidEmail(body.destinatarioEmail)) {
      return new Response(
        JSON.stringify({ error: "E-mail do destinatário inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upload no Storage
    const bytes = base64ToUint8Array(body.pdfBase64);
    const path = `${new Date().getFullYear()}/${crypto.randomUUID()}-${body.fileName}`;
    const { error: upErr } = await supabase.storage
      .from("visitas-pdf")
      .upload(path, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
    if (upErr) {
      console.error("Upload error:", upErr);
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Signed URL válida por 7 dias
    const { data: signed, error: signErr } = await supabase.storage
      .from("visitas-pdf")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    if (signErr || !signed) {
      console.error("Sign url error:", signErr);
      return new Response(
        JSON.stringify({ error: signErr?.message || "Falha ao gerar link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const downloadUrl = signed.signedUrl;

    // Tenta envio de e-mail via send-transactional-email (se domínio estiver pronto)
    let emailSent = false;
    let emailError: string | null = null;

    try {
      const dataFormatada = body.dataVisita
        ? new Date(body.dataVisita).toLocaleDateString("pt-BR")
        : new Date().toLocaleDateString("pt-BR");

      const idempotencyKey = `visita-pdf-${body.registroId || crypto.randomUUID()}-${body.destinatarioEmail}`;

      const { error: invokeErr } = await supabase.functions.invoke(
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
        emailError = invokeErr.message;
        console.warn("send-transactional-email falhou:", invokeErr);
      } else {
        emailSent = true;
      }

      // Cópia para o consultor (opcional)
      if (body.copiaConsultorEmail && isValidEmail(body.copiaConsultorEmail)) {
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
        }).catch((e) => console.warn("Cópia ao consultor falhou:", e));
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      console.warn("Falha ao invocar send-transactional-email:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        downloadUrl,
        emailSent,
        emailError,
        path,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Erro inesperado:", e);
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
