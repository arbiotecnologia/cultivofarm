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
  registroId: string;
  empresaNome?: string;
  fazendaNome?: string;
  talhaoNome?: string;
  produtoNome?: string;
  dataAplicacao?: string;
  customSubject?: string;
  customMessage?: string;
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

    // Upload to Storage
    const bytes = base64ToUint8Array(body.pdfBase64);
    const path = `${new Date().getFullYear()}/aplicacoes/${crypto.randomUUID()}-${body.fileName}`;
    
    // Ensure the bucket exists or use an existing one
    const { error: upErr } = await supabase.storage
      .from("aplicacao-evidencias")
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

    // Signed URL valid for 30 days
    const { data: signed, error: signErr } = await supabase.storage
      .from("aplicacao-evidencias")
      .createSignedUrl(path, 60 * 60 * 24 * 30);

    if (signErr || !signed) {
      return new Response(
        JSON.stringify({ error: signErr?.message || "Falha ao gerar link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const downloadUrl = signed.signedUrl;

    // Send email via send-transactional-email if available
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

      if (invokeErr) {
        emailError = invokeErr.message;
        console.warn("send-transactional-email failed:", invokeErr);
      } else {
        emailSent = true;
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      console.warn("Error invoking send-transactional-email:", e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        downloadUrl,
        emailSent,
        emailError,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Unexpected error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
