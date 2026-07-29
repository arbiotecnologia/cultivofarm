import jsPDF from "jspdf";
import { drawArBioFooter, drawArBioHeader } from "./arBioHeader";
import { supabase } from "@/integrations/supabase/client";
import { formatarPrecoUnitario } from "@/lib/catalogo/formatUnidades";

export interface FichaProdutoOptions {
  produtoId: string;
  mode?: "download" | "blob";
  audience?: "interna" | "b2b";
}

export async function generateFichaTecnicaProdutoPdf({ produtoId, mode = "download", audience = "interna" }: FichaProdutoOptions): Promise<void | { blobUrl: string; filename: string }> {
  const isB2B = audience === "b2b";

  const produtoSelect = isB2B
    ? "id, nome, codigo, tipo, dose_ml_ha, descricao, funcao_completa, ativo, b2b_enabled, valor_dose_brl, valor_litro_brl, valor_ha_brl"
    : "*";
  const perfilSelect = isB2B
    ? "resumo_curto, explicacao_b2b, beneficio_combinado, indicacoes_uso, janela_aplicacao, cuidados_aplicacao, status_validacao"
    : "*";

  const [prRes, pRes, tRes, cRes, fRes] = await Promise.all([
    supabase.from("produtos").select(produtoSelect).eq("id", produtoId).maybeSingle(),
    supabase.from("product_technical_profiles").select(perfilSelect).eq("produto_id", produtoId).maybeSingle(),
    supabase.from("product_target_recommendations").select("*").eq("produto_id", produtoId).eq("ativo", true),
    supabase.from("product_crop_recommendations").select("*").eq("produto_id", produtoId).eq("ativo", true),
    isB2B
      ? Promise.resolve({ data: [] as any[], error: null })
      : supabase
          .from("formulacoes")
          .select("volume_ml, proporcao, microrganismos(nome, nome_cientifico, funcao_agronomica)")
          .eq("produto_id", produtoId),
  ]);
  const pr: any = prRes.data;
  if (!pr) throw new Error("Produto não encontrado");
  if (isB2B && (!pr.ativo || !pr.b2b_enabled)) {
    throw new Error("Ficha técnica ainda não liberada para parceiros.");
  }
  const p: any = pRes.data ?? {};
  if (isB2B && p.status_validacao !== "aprovado") {
    throw new Error("Ficha técnica ainda não liberada para parceiros.");
  }
  const targets: any[] = tRes.data ?? [];
  const crops: any[] = cRes.data ?? [];
  const formul: any[] = (fRes as any).data ?? [];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = await drawArBioHeader(doc, { subtitulo: `Ficha técnica — ${pr.nome}` });
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

  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Código: ${pr.codigo || "—"}    Tipo: ${pr.tipo}    Dose: ${pr.dose_ml_ha ?? "—"} mL/ha`, margin, y); y += 14;
  if (isB2B && (pr.valor_ha_brl || pr.valor_litro_brl || pr.valor_dose_brl)) {
    const partes: string[] = [];
    if (pr.valor_ha_brl) partes.push(formatarPrecoUnitario(Number(pr.valor_ha_brl), "hectare"));
    if (pr.valor_litro_brl) partes.push(formatarPrecoUnitario(Number(pr.valor_litro_brl), "litro"));
    if (pr.valor_dose_brl) partes.push(formatarPrecoUnitario(Number(pr.valor_dose_brl), "dose_100ml"));
    doc.text(`Tabela: ${partes.join("  •  ")}`, margin, y); y += 14;
  }
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90, 90, 90);
  doc.text("Referência: 1 L = 10 doses de 100 mL.", margin, y); y += 18;
  doc.setFont("helvetica", "normal"); doc.setTextColor(0, 0, 0);

  writeSection("Resumo", p.resumo_curto || pr.descricao);
  writeSection("Função completa", pr.funcao_completa);
  if (!isB2B) writeSection("Explicação técnica", p.explicacao_tecnica || pr.modo_acao);
  writeSection("Benefício combinado", p.beneficio_combinado);
  writeSection("Indicações de uso", p.indicacoes_uso);
  writeSection("Janela de aplicação", p.janela_aplicacao);
  writeSection("Cuidados", p.cuidados_aplicacao);
  if (!isB2B) writeSection("Visão produtor", p.explicacao_produtor);
  if (pr.b2b_enabled) writeSection("Visão B2B", p.explicacao_b2b);
  if (targets.length) writeSection("Alvos", targets.map((t) => `• ${t.alvo_tipo}: ${t.alvo_nome}`).join("\n"));
  if (crops.length) writeSection("Culturas", crops.map((c) => `• ${c.cultura_nome || c.cultura_id} ${c.dose_recomendada ? `— ${c.dose_recomendada}` : ""}`).join("\n"));
  if (!isB2B && formul.length) {
    writeSection(
      "Composição microbiológica",
      formul.map((f) => {
        const m = f.microrganismos;
        if (!m) return "• componente sem vínculo";
        return `• ${m.nome}${m.nome_cientifico ? ` (${m.nome_cientifico})` : ""} — ${f.volume_ml ?? 0} mL / ${f.proporcao ?? 0}%`;
      }).join("\n"),
    );
  }
  if (isB2B) {
    writeSection(
      "Observação de uso técnico",
      "Documento de referência comercial B2B. Recomendação agronômica final deve considerar as condições da lavoura e a prescrição do responsável técnico habilitado.",
    );
  }

  drawArBioFooter(doc);
  const filename = `ficha-${(pr.codigo || pr.nome).toString().toLowerCase().replace(/\s+/g, "-")}.pdf`;
  if (mode === "blob") {
    const blobUrl = doc.output("bloburl") as unknown as string;
    return { blobUrl, filename };
  }
  doc.save(filename);
}
