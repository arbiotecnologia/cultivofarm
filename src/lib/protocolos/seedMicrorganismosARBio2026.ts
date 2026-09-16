import { supabase } from "@/integrations/supabase/client";

export interface SeedMicroARBio {
  nome: string;
  nome_cientifico: string;
  tipo: "bacteria" | "fungo" | "consorcio";
  concentracao_ufc_ml: number;
  valor_dose_brl: number;
}

/**
 * Tabela Cultivo Farm 2026 — 14 bactérias + 10 fungos (inclui E.M como consórcio).
 * Fonte: PDF "Tabela_A.R_Bio_2026.pdf". Dose padrão 100 mL/ha; 1 L = 10 doses.
 */
export const SEED_MICROS_AR_BIO_2026: SeedMicroARBio[] = [
  // Bactérias
  { nome: "Bacillus Amyloliquefaciens", nome_cientifico: "Bacillus amyloliquefaciens", tipo: "bacteria", concentracao_ufc_ml: 3.4e10, valor_dose_brl: 19 },
  { nome: "Bacillus Aryabhattai", nome_cientifico: "Bacillus aryabhattai", tipo: "bacteria", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 19 },
  { nome: "Bacillus Licheniformis", nome_cientifico: "Bacillus licheniformis", tipo: "bacteria", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 19 },
  { nome: "Bacillus Megaterium", nome_cientifico: "Bacillus megaterium", tipo: "bacteria", concentracao_ufc_ml: 1.5e9, valor_dose_brl: 25 },
  { nome: "Bacillus Methylotrophicus", nome_cientifico: "Bacillus methylotrophicus", tipo: "bacteria", concentracao_ufc_ml: 1.3e9, valor_dose_brl: 19 },
  { nome: "Bacillus Pumilus", nome_cientifico: "Bacillus pumilus", tipo: "bacteria", concentracao_ufc_ml: 3.4e10, valor_dose_brl: 19 },
  { nome: "Bacillus Subtilis", nome_cientifico: "Bacillus subtilis", tipo: "bacteria", concentracao_ufc_ml: 1.3e9, valor_dose_brl: 12 },
  { nome: "Bacillus Thuringiensis Aizawai", nome_cientifico: "Bacillus thuringiensis var. aizawai", tipo: "bacteria", concentracao_ufc_ml: 1.4e9, valor_dose_brl: 19 },
  { nome: "Bacillus Thuringiensis Kurstaki", nome_cientifico: "Bacillus thuringiensis var. kurstaki", tipo: "bacteria", concentracao_ufc_ml: 2.5e9, valor_dose_brl: 19 },
  { nome: "Bacillus Velezensis", nome_cientifico: "Bacillus velezensis", tipo: "bacteria", concentracao_ufc_ml: 3.4e10, valor_dose_brl: 19 },
  { nome: "Chromobacterium Subtsugae", nome_cientifico: "Chromobacterium subtsugae", tipo: "bacteria", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 25 },
  { nome: "Methylobacterium Symbioticum", nome_cientifico: "Methylobacterium symbioticum", tipo: "bacteria", concentracao_ufc_ml: 3.5e8, valor_dose_brl: 40 },
  { nome: "Pseudomonas Fluorescens", nome_cientifico: "Pseudomonas fluorescens", tipo: "bacteria", concentracao_ufc_ml: 1.5e9, valor_dose_brl: 25 },
  { nome: "Saccharopolyspora Spinosa", nome_cientifico: "Saccharopolyspora spinosa", tipo: "bacteria", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 25 },
  // Fungos
  { nome: "Beauveria Bassiana", nome_cientifico: "Beauveria bassiana", tipo: "fungo", concentracao_ufc_ml: 2.1e9, valor_dose_brl: 23 },
  { nome: "Cordyceps Javanica", nome_cientifico: "Cordyceps javanica", tipo: "fungo", concentracao_ufc_ml: 1.4e9, valor_dose_brl: 23 },
  { nome: "Isaria Fumosorosea", nome_cientifico: "Isaria fumosorosea", tipo: "fungo", concentracao_ufc_ml: 1.3e9, valor_dose_brl: 23 },
  { nome: "Metarhyzium Anisopliae", nome_cientifico: "Metarhizium anisopliae", tipo: "fungo", concentracao_ufc_ml: 1.5e9, valor_dose_brl: 23 },
  { nome: "Paecilomyces Lilacinus", nome_cientifico: "Paecilomyces lilacinus", tipo: "fungo", concentracao_ufc_ml: 4.5e9, valor_dose_brl: 23 },
  { nome: "Pochonia Chlamydosporia", nome_cientifico: "Pochonia chlamydosporia", tipo: "fungo", concentracao_ufc_ml: 3.4e7, valor_dose_brl: 23 },
  { nome: "Purpurreocillium Lilacinum", nome_cientifico: "Purpureocillium lilacinum", tipo: "fungo", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 23 },
  { nome: "Trichoderma Asperellum", nome_cientifico: "Trichoderma asperellum", tipo: "fungo", concentracao_ufc_ml: 1.4e10, valor_dose_brl: 14 },
  { nome: "Trichoderma Harzianum", nome_cientifico: "Trichoderma harzianum", tipo: "fungo", concentracao_ufc_ml: 1.2e9, valor_dose_brl: 14 },
  { nome: "E.M (Microrganismos Eficientes)", nome_cientifico: "Consórcio de microrganismos eficientes", tipo: "consorcio", concentracao_ufc_ml: 1.5e10, valor_dose_brl: 19 },
];

export interface ImportResult {
  inseridos: number;
  atualizados: number;
  total: number;
}

/**
 * Import idempotente. Para cada linha do seed:
 *  - se `nome` já existe: atualiza somente UFC/dose/valor/litro/safra/meio_cultivo/fornecedor/producao_on_farm,
 *    preservando `codigo`, `b2b_enabled`, `ativo`, fichas técnicas e demais campos manuais.
 *  - se não existe: insere com defaults e deixa o trigger `set_codigo_microrganismo` gerar `codigo`.
 */
export async function importarMicrosARBio2026(): Promise<ImportResult> {
  const { data: existing, error: fetchErr } = await supabase
    .from("microrganismos")
    .select("id,nome")
    .in("nome", SEED_MICROS_AR_BIO_2026.map((s) => s.nome));
  if (fetchErr) throw fetchErr;

  const byNome = new Map<string, string>((existing ?? []).map((r: any) => [r.nome, r.id]));

  const toInsert: any[] = [];
  const toUpdate: { id: string; patch: any }[] = [];

  for (const s of SEED_MICROS_AR_BIO_2026) {
    const patch = {
      nome_cientifico: s.nome_cientifico,
      tipo: s.tipo,
      concentracao_ufc_ml: s.concentracao_ufc_ml,
      dose_ml_ha: 100,
      valor_dose_brl: s.valor_dose_brl,
      valor_litro_brl: Number((s.valor_dose_brl * 10).toFixed(2)),
      fornecedor: "Cultivo Farm",
      safra_referencia: "2026",
      meio_cultivo: "líquido e sólido",
      producao_on_farm: true,
    };
    const id = byNome.get(s.nome);
    if (id) toUpdate.push({ id, patch });
    else toInsert.push({ nome: s.nome, ...patch, ativo: true, b2b_enabled: false });
  }

  if (toInsert.length) {
    const { error } = await supabase.from("microrganismos").insert(toInsert);
    if (error) throw error;
  }
  for (const u of toUpdate) {
    const { error } = await supabase.from("microrganismos").update(u.patch).eq("id", u.id);
    if (error) throw error;
  }

  return {
    inseridos: toInsert.length,
    atualizados: toUpdate.length,
    total: SEED_MICROS_AR_BIO_2026.length,
  };
}
