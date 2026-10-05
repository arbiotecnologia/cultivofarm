import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

function numberToExtenso(n: number): string {
  // Simplified PT-BR currency in words (best-effort)
  const reais = Math.floor(n);
  const cents = Math.round((n - reais) * 100);
  return `${reais.toLocaleString("pt-BR")} reais${cents ? ` e ${cents} centavos` : ""}`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return handlePreflight(req);
  const corsHeaders = corsHeadersFor(origin);
  if (origin && !isTrustedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), { status: 403, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: organizationId, error: organizationError } = await supabase.rpc("h15_actor_organization");
    if (organizationError || !organizationId) {
      return new Response(JSON.stringify({ error: "tenant_context_required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => null) as { receipt_id?: unknown } | null;
    const receiptId = body?.receipt_id;
    if (typeof receiptId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receiptId)) {
      return new Response(JSON.stringify({ error: "receipt_id_invalid" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rec, error } = await supabase
      .from("financial_receipts")
      .select("*, payment_methods:payment_method_id(name)")
      .eq("id", receiptId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!rec) throw new Error("Recibo não encontrado");

    const { data: customer, error: customerError } = rec.customer_id
      ? await supabase
        .from("clientes")
        .select("nome, razao_social")
        .eq("id", rec.customer_id)
        .eq("organization_id", organizationId)
        .maybeSingle()
      : { data: null, error: null };
    if (customerError || (rec.customer_id && !customer)) {
      throw new Error("Cliente do recibo fora do tenant");
    }

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const page = pdf.addPage([595, 420]);

    page.drawRectangle({ x: 0, y: 380, width: 595, height: 40, color: rgb(0.07, 0.36, 0.2) });
    page.drawText("AR Bio On-Farm Manager", { x: 30, y: 395, size: 14, font: bold, color: rgb(1,1,1) });
    page.drawText("RECIBO DE PAGAMENTO", { x: 30, y: 350, size: 18, font: bold });
    page.drawText(`Nº ${rec.receipt_number}`, { x: 400, y: 350, size: 14, font: bold });

    const customerName = customer?.nome ?? customer?.razao_social ?? "—";
    const method = (rec as any).payment_methods?.name ?? "—";
    const amount = Number(rec.amount);

    const lines = [
      `Recebemos de: ${customerName}`,
      `A quantia de: R$ ${amount.toFixed(2).replace(".", ",")} (${numberToExtenso(amount)})`,
      `Referente a: ${rec.description ?? "Pagamento de título financeiro"}`,
      `Forma de pagamento: ${method}`,
      `Data do pagamento: ${new Date(rec.payment_date).toLocaleDateString("pt-BR")}`,
    ];
    let y = 310;
    for (const l of lines) {
      page.drawText(l, { x: 30, y, size: 11, font });
      y -= 18;
    }

    // Marca d'água CANCELADO em diagonal
    if (rec.status === "CANCELED") {
      page.drawText("CANCELADO", {
        x: 110, y: 200, size: 80, font: bold,
        color: rgb(0.85, 0.1, 0.1), opacity: 0.25, rotate: { type: "degrees", angle: 20 } as any,
      });
      if (rec.cancel_reason) {
        page.drawText(`Motivo: ${rec.cancel_reason}`, { x: 30, y: 165, size: 9, font, color: rgb(0.5,0,0) });
      }
    }

    page.drawLine({ start: { x: 30, y: 130 }, end: { x: 565, y: 130 }, thickness: 0.5, color: rgb(0.6,0.6,0.6) });
    page.drawText("Este recibo foi gerado eletronicamente pelo sistema da AR Bio.", { x: 30, y: 110, size: 9, font });
    page.drawText(`Emitido por: ${userData.user.email ?? userData.user.id}  •  ${new Date(rec.issued_at).toLocaleString("pt-BR")}`, { x: 30, y: 96, size: 8, font, color: rgb(0.3,0.3,0.3) });
    page.drawText(`Código de autenticidade: ${rec.authenticity_code}`, { x: 30, y: 78, size: 9, font: bold, color: rgb(0.07,0.36,0.2) });
    page.drawText(`Validação pública (em preparação): /verificar-recibo/${rec.public_verification_token}`, { x: 30, y: 62, size: 7, font, color: rgb(0.4,0.4,0.4) });

    const bytes = await pdf.save();
    const path = `${organizationId}/${rec.receipt_year}/${rec.receipt_number}.pdf`;
    const { error: upErr } = await supabase.storage.from("financial-receipts").upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw upErr;

    const { error: updateError } = await supabase.from("financial_receipts")
      .update({ storage_bucket: "financial-receipts", storage_path: path })
      .eq("id", receiptId)
      .eq("organization_id", organizationId);
    if (updateError) throw updateError;
    const { data: signed, error: signedError } = await supabase.storage.from("financial-receipts").createSignedUrl(path, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error("URL do recibo indisponível");

    return new Response(JSON.stringify({ url: signed?.signedUrl, path, receipt_number: rec.receipt_number }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "financial_receipt_failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
