import jsPDF from "jspdf";
import { drawArBioFooter, drawArBioHeader } from "./arBioHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";

export interface FichaMicroOptions {
  microId: string;
  mode?: "download" | "blob";
  audience?: "interna" | "b2b";
}

export async function generateFichaTecnicaMicrorganismoPdf({ microId, mode = "download", audience = "interna" }: FichaMicroOptions): Promise<void | { blobUrl: string; filename: string }> {
  const isB2B = audience === "b2b";

  const microSelect = isB2B
    ? "id, nome, codigo, tipo, nome_cientifico, concentracao_ufc_ml, dose_ml_ha, descricao, funcao_agronomica, ativo, b2b_enabled, valor_dose_brl, valor_litro_brl"
    : "*";
  const perfilSelect = isB2B
    ? "resumo_curto, explicacao_b2b, beneficios_agronomicos, mecanismo_acao, indicacoes_uso, cuidados_aplicacao, status_validacao"
    : "*";

  const [mRes, pRes, tRes, cRes] = await Promise.all([
    supabase.from("microrganismos").select(microSelect).eq("id", microId).maybeSingle(),
    supabase.from("microorganism_technical_profiles").select(perfilSelect).eq("microrganismo_id", microId).maybeSingle(),
    supabase.from("microorganism_targets").select("*").eq("microrganismo_id", microId).eq("ativo", true),
    supabase.from("microorganism_crop_recommendations").select("*").eq("microrganismo_id", microId).eq("ativo", true),
  ]);
  const m: any = mRes.data;
  if (!m) throw new Error("Microrganismo não encontrado");
  if (isB2B && (!m.ativo || !m.b2b_enabled)) {
    throw new Error("Ficha técnica ainda não liberada para parceiros.");
  }
  const p: any = pRes.data ?? {};
  if (isB2B && p.status_validacao !== "aprovado") {
    throw new Error("Ficha técnica ainda não liberada para parceiros.");
  }
  const targets: any[] = tRes.data ?? [];
  const crops: any[] = cRes.data ?? [];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = await drawArBioHeader(doc, { subtitulo: `Ficha técnica — ${m.nome}` });

  const margin = 40;
  const w = doc.internal.pageSize.getWidth() - margin * 2;

  const writeSection = (title: string, text?: string | null) => {
    if (!text) return;
    if (y > 740) { doc.addPage(); y = 60; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 60, 35);
    doc.text(title, margin, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(String(text), w);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 8;
  };

  doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.setTextColor(80, 80, 80);
  doc.text(m.nome_cientifico || "", margin, y); y += 16;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);
  doc.text(`Tipo: ${m.tipo}    UFC/mL: ${formatConcentracaoDisplay(m.concentracao_ufc_ml) || "—"}    Dose: ${m.dose_ml_ha ?? "—"} mL/ha`, margin, y);
  y += 14;
  if (isB2B && (m.valor_litro_brl || m.valor_dose_brl)) {
    const partes: string[] = [];
    if (m.valor_litro_brl) partes.push(`R$ ${Number(m.valor_litro_brl).toFixed(2)}/L`);
    if (m.valor_dose_brl) partes.push(`R$ ${Number(m.valor_dose_brl).toFixed(2)}/dose`);
    doc.text(`Tabela: ${partes.join("  •  ")}`, margin, y); y += 14;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text("Referência: 1 L = 10 doses de 100 mL.", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(0, 0, 0);

  writeSection("Resumo", p.resumo_curto || m.descricao);
  writeSection("Função agronômica", m.funcao_agronomica);
  writeSection("Mecanismo de ação", p.mecanismo_acao);
  writeSection("Benefícios agronômicos", p.beneficios_agronomicos);
  writeSection("Indicações de uso", p.indicacoes_uso);
  writeSection("Cuidados na aplicação", p.cuidados_aplicacao);
  if (!isB2B) writeSection("Visão produtor", p.explicacao_produtor);
  if (m.b2b_enabled) writeSection("Visão B2B", p.explicacao_b2b);
  if (targets.length) writeSection("Alvos", targets.map((t) => `• ${t.alvo_tipo}: ${t.alvo_nome}`).join("\n"));
  if (crops.length) writeSection("Culturas", crops.map((c) => `• ${c.cultura_nome || c.cultura_id} ${c.fase_recomendada ? `(${c.fase_recomendada})` : ""}`).join("\n"));
  if (isB2B) {
    writeSection(
      "Observação de uso técnico",
      "Documento de referência comercial B2B. Recomendação agronômica final deve considerar as condições da lavoura e a prescrição do responsável técnico habilitado.",
    );
  }

  drawArBioFooter(doc);
  const filename = `ficha-${(m.codigo || m.nome).toString().toLowerCase().replace(/\s+/g, "-")}.pdf`;
  if (mode === "blob") {
    const blobUrl = doc.output("bloburl") as unknown as string;
    return { blobUrl, filename };
  }
  doc.save(filename);
}
