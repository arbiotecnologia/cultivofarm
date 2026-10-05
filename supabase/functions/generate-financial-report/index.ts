import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../_shared/comunicacao/cors.ts";

interface Body {
  report_type: string;
  filters: Record<string, unknown>;
  format: "PDF" | "XLSX" | "CSV";
  title?: string;
}

const RPC_MAP: Record<string, string> = {
  monthly: "get_report_monthly_financial",
  receivables: "get_report_receivables",
  payables: "get_report_payables",
  delinquency: "get_report_delinquency",
  nfe_pending: "get_report_nfe_pending",
  deliveries_billing: "get_report_deliveries_billing_status",
  customer_statement: "get_report_customer_statement",
  accountability: "get_report_accountability",
  cashflow: "get_financial_cashflow",
  dre: "get_financial_dre_summary",
};

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

    const body = (await req.json()) as Body;
    const rpcName = RPC_MAP[body.report_type];
    if (!rpcName) throw new Error(`Tipo de relatório inválido: ${body.report_type}`);

    // Call the RPC with filters as params
    const { data, error } = await supabase.rpc(rpcName, body.filters as never);
    if (error) throw error;

    const rows: Array<Record<string, unknown>> = Array.isArray(data)
      ? data
      : data && typeof data === "object"
        ? [data as Record<string, unknown>]
        : [];

    const title = body.title ?? body.report_type;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${body.report_type}_${ts}.${body.format.toLowerCase()}`;
    let fileBytes: Uint8Array;
    let contentType: string;

    if (body.format === "PDF") {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.addPage([595, 842]);
      page.drawText("AR Bio On-Farm Manager", { x: 40, y: 800, size: 14, font: bold, color: rgb(0.1,0.4,0.2) });
      page.drawText(title, { x: 40, y: 780, size: 18, font: bold });
      page.drawText(`Gerado em ${new Date().toLocaleString("pt-BR")}`, { x: 40, y: 762, size: 9, font });
      page.drawText(`Filtros: ${JSON.stringify(body.filters)}`, { x: 40, y: 748, size: 8, font, color: rgb(0.3,0.3,0.3) });
      let y = 720;
      if (rows.length > 0) {
        const cols = Object.keys(rows[0]);
        page.drawText(cols.join(" | "), { x: 40, y, size: 8, font: bold });
        y -= 14;
        for (const row of rows.slice(0, 60)) {
          const line = cols.map((c) => String(row[c] ?? "")).join(" | ");
          page.drawText(line.substring(0, 110), { x: 40, y, size: 7, font });
          y -= 12;
          if (y < 50) break;
        }
      } else {
        page.drawText("Nenhum dado encontrado.", { x: 40, y, size: 10, font });
      }
      page.drawText(`AR Bio • ${rows.length} registro(s)`, { x: 40, y: 30, size: 8, font, color: rgb(0.4,0.4,0.4) });
      fileBytes = await pdf.save();
      contentType = "application/pdf";
    } else if (body.format === "XLSX") {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ info: "Nenhum dado" }]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 28));
      fileBytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    } else {
      const cols = rows.length ? Object.keys(rows[0]) : [];
      const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
      fileBytes = new TextEncoder().encode(csv);
      contentType = "text/csv";
    }

    const path = `${organizationId}/${userData.user.id}/${filename}`;
    const { error: upErr } = await supabase.storage.from("financial-reports").upload(path, fileBytes, { contentType, upsert: true });
    if (upErr) throw upErr;

    await supabase.rpc("register_financial_report_export", {
      p_report_type: body.report_type,
      p_report_title: title,
      p_filters: body.filters as any,
      p_file_format: body.format,
      p_storage_path: path,
      p_status: "SUCCESS",
      p_error_message: null,
    });

    const { data: signed } = await supabase.storage.from("financial-reports").createSignedUrl(path, 60 * 60);

    return new Response(JSON.stringify({ url: signed?.signedUrl, path, row_count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ error: "financial_report_unavailable" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
