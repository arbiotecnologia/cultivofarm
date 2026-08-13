import jsPDF from "jspdf";
import { drawArBioFooter, drawArBioHeader } from "./arBioHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatConcentracaoDisplay } from "@/lib/cqFormat";

export interface DossieMicrorganismosOptions {
  mode?: "download" | "blob";
  audience?: "interna" | "b2b";
}

/**
 * Gera um único PDF contendo as fichas técnicas de TODOS os microrganismos ativos.
 */
export async function generateDossieCompletoMicrorganismos({
  mode = "download",
  audience = "interna"
}: DossieMicrorganismosOptions = {}): Promise<void | { blobUrl: string; filename: string }> {
  
  const query = (supabase as any)
    .from("microrganismos")
    .select("id, nome")
    .eq("ativo", true);
  
  if (audience === "b2b") {
    query.eq("b2b_enabled", true);
  }

  const { data: micros, error } = await query.order("nome");

  if (error) throw error;
  if (!micros || (micros as any[]).length === 0) {
    throw new Error("Nenhum microrganismo encontrado para gerar o dossiê.");
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const filename = `dossie-microrganismos-${new Date().toISOString().split('T')[0]}.pdf`;

  const microList = micros as any[];
  for (let i = 0; i < microList.length; i++) {
    const micro = microList[i];
    if (i > 0) doc.addPage();
    await appendMicroorganismoToDoc(doc, micro.id, audience);
  }

  if (mode === "blob") {
    const blobUrl = doc.output("bloburl") as unknown as string;
    return { blobUrl, filename };
  }
  doc.save(filename);
}

async function appendMicroorganismoToDoc(doc: jsPDF, microId: string, audience: "interna" | "b2b"): Promise<void> {
  const isB2B = audience === "b2b";
  const microSelect = isB2B
    ? "id, nome, codigo, tipo, nome_cientifico, concentracao_ufc_ml, dose_ml_ha, descricao, funcao_agronomica, ativo, b2b_enabled, valor_dose_brl, valor_litro_brl"
    : "*";
  const perfilSelect = isB2B
    ? "resumo_curto, explicacao_b2b, beneficios_agronomicos, mecanismo_acao, indicacoes_uso, cuidados_aplicacao, status_validacao"
    : "*";

  const [mRes, pRes, tRes, cRes] = await Promise.all([
    (supabase as any).from("microrganismos").select(microSelect).eq("id", microId).maybeSingle(),
    (supabase as any).from("microorganism_technical_profiles").select(perfilSelect).eq("microrganismo_id", microId).maybeSingle(),
    (supabase as any).from("microorganism_targets").select("*").eq("microrganismo_id", microId).eq("ativo", true),
    (supabase as any).from("microorganism_crop_recommendations").select("*").eq("microrganismo_id", microId).eq("ativo", true),
  ]);

  const m: any = mRes.data;
  if (!m) return;
  const p: any = pRes.data ?? {};
  const targets: any[] = tRes.data ?? [];
  const crops: any[] = cRes.data ?? [];

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

  writeSection("Resumo", p.resumo_curto || m.descricao);
  writeSection("Função agronômica", m.funcao_agronomica);
  writeSection("Mecanismo de ação", p.mecanismo_acao);
  writeSection("Benefícios agronômicos", p.beneficios_agronomicos);
  writeSection("Indicações de uso", p.indicacoes_uso);
  writeSection("Cuidados na aplicação", p.cuidados_aplicacao);
  if (!isB2B) writeSection("Visão produtor", p.explicacao_produtor);
  if (targets.length) writeSection("Alvos", targets.map((t) => `• ${t.alvo_tipo}: ${t.alvo_nome}`).join("\n"));
  if (crops.length) writeSection("Culturas", crops.map((c) => `• ${c.cultura_nome || c.cultura_id} ${c.fase_recomendada ? `(${c.fase_recomendada})` : ""}`).join("\n"));

  drawArBioFooter(doc);
}
