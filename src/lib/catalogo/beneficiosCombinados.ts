import { supabase } from "@/integrations/supabase/client";

/**
 * Gera prévia automática de benefício combinado para um produto,
 * a partir das fichas técnicas dos microrganismos vinculados via formulacoes.
 * Texto retornado deve ser exibido como "prévia automática" — não salvar sem revisão.
 */
export async function gerarPreviaBeneficioCombinado(produtoId: string): Promise<string> {
  const { data: formulacoes, error } = await (supabase as any)
    .from("formulacoes")
    .select("microrganismo_id, microrganismos(id,nome,nome_cientifico,funcao_agronomica)")
    .eq("produto_id", produtoId);
  if (error) throw error;

  const microIds = (formulacoes ?? []).map((f: any) => f.microrganismo_id).filter(Boolean) as string[];
  if (microIds.length === 0) {
    return "Este produto ainda não possui composição microbiológica cadastrada.";
  }

  const { data: profiles } = await (supabase as any)
    .from("microorganism_technical_profiles")
    .select("microrganismo_id, resumo_curto, beneficios_agronomicos, mecanismo_acao")
    .in("microrganismo_id", microIds as any);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.microrganismo_id, p]));

  const linhas: string[] = [];
  for (const f of formulacoes as any[]) {
    const m = f.microrganismos;
    if (!m) continue;
    const profile = profileMap.get(m.id) as any;
    const beneficio =
      profile?.beneficios_agronomicos ||
      profile?.resumo_curto ||
      m.funcao_agronomica ||
      "função agronômica não detalhada";
    const nome = m.nome_cientifico ? `${m.nome} (${m.nome_cientifico})` : m.nome;
    linhas.push(`• ${nome}: ${beneficio}`);
  }

  return [
    "Prévia automática gerada a partir das fichas técnicas dos microrganismos vinculados:",
    "",
    ...linhas,
    "",
    "Revise e ajuste o texto antes de aprovar como benefício combinado oficial.",
  ].join("\n");
}
