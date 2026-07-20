export type EstagioFenologico = { codigo: string; descricao: string };

const MAPA: Record<string, EstagioFenologico[]> = {
  soja: [
    { codigo: "VE", descricao: "Emergência" },
    { codigo: "VC", descricao: "Cotilédones abertos" },
    { codigo: "V1", descricao: "1º nó (1ª folha trifoliolada)" },
    { codigo: "V2", descricao: "2º nó" },
    { codigo: "V3", descricao: "3º nó" },
    { codigo: "V4", descricao: "4º nó" },
    { codigo: "V5", descricao: "5º nó" },
    { codigo: "V6", descricao: "6º nó" },
    { codigo: "R1", descricao: "Início do florescimento" },
    { codigo: "R2", descricao: "Florescimento pleno" },
    { codigo: "R3", descricao: "Início da formação de vagens" },
    { codigo: "R4", descricao: "Vagem completa" },
    { codigo: "R5.1", descricao: "Início do enchimento de grãos" },
    { codigo: "R5.2", descricao: "Enchimento de grãos (até 25%)" },
    { codigo: "R5.3", descricao: "Enchimento de grãos (26-50%)" },
    { codigo: "R5.4", descricao: "Enchimento de grãos (51-75%)" },
    { codigo: "R5.5", descricao: "Enchimento de grãos (76-100%)" },
    { codigo: "R6", descricao: "Grão cheio" },
    { codigo: "R7", descricao: "Início da maturação" },
    { codigo: "R8", descricao: "Maturação plena" },
  ],
  milho: [
    { codigo: "VE", descricao: "Emergência" },
    { codigo: "V1", descricao: "1ª folha desenvolvida" },
    { codigo: "V2", descricao: "2ª folha" },
    { codigo: "V3", descricao: "3ª folha" },
    { codigo: "V4", descricao: "4ª folha" },
    { codigo: "V5", descricao: "5ª folha" },
    { codigo: "V6", descricao: "6ª folha" },
    { codigo: "V8", descricao: "8ª folha" },
    { codigo: "V10", descricao: "10ª folha" },
    { codigo: "V12", descricao: "12ª folha" },
    { codigo: "VT", descricao: "Pendoamento" },
    { codigo: "R1", descricao: "Florescimento (embonecamento)" },
    { codigo: "R2", descricao: "Grão bolha" },
    { codigo: "R3", descricao: "Grão leitoso" },
    { codigo: "R4", descricao: "Grão pastoso" },
    { codigo: "R5", descricao: "Grão farináceo (dentado)" },
    { codigo: "R6", descricao: "Maturação fisiológica" },
  ],
  arroz: [
    { codigo: "S1", descricao: "Germinação" },
    { codigo: "S2", descricao: "Plântula" },
    { codigo: "S3", descricao: "Perfilhamento" },
    { codigo: "S4", descricao: "Alongamento dos colmos" },
    { codigo: "S5", descricao: "Emborrachamento" },
    { codigo: "S6", descricao: "Floração" },
    { codigo: "S7", descricao: "Grão leitoso" },
    { codigo: "S8", descricao: "Grão pastoso" },
    { codigo: "S9", descricao: "Maturação" },
  ],
  feijao: [
    { codigo: "V0", descricao: "Germinação" },
    { codigo: "V1", descricao: "Emergência" },
    { codigo: "V2", descricao: "Folhas primárias" },
    { codigo: "V3", descricao: "1ª folha trifoliolada" },
    { codigo: "V4", descricao: "3ª folha trifoliolada" },
    { codigo: "R5", descricao: "Pré-floração" },
    { codigo: "R6", descricao: "Floração" },
    { codigo: "R7", descricao: "Formação das vagens" },
    { codigo: "R8", descricao: "Enchimento das vagens" },
    { codigo: "R9", descricao: "Maturação fisiológica" },
  ],
  sorgo: [
    { codigo: "0", descricao: "Emergência" },
    { codigo: "1", descricao: "3ª folha visível" },
    { codigo: "2", descricao: "5ª folha visível" },
    { codigo: "3", descricao: "Diferenciação do ponto de crescimento" },
    { codigo: "4", descricao: "Folha bandeira visível" },
    { codigo: "5", descricao: "Emborrachamento" },
    { codigo: "6", descricao: "Florescimento" },
    { codigo: "7", descricao: "Grão leitoso" },
    { codigo: "8", descricao: "Grão pastoso" },
    { codigo: "9", descricao: "Maturação fisiológica" },
  ],
  canadeacucar: [
    { codigo: "BR", descricao: "Brotação" },
    { codigo: "PE", descricao: "Perfilhamento" },
    { codigo: "CR", descricao: "Crescimento dos colmos" },
    { codigo: "MA", descricao: "Maturação" },
  ],
  citrus: [
    { codigo: "RE", descricao: "Repouso vegetativo" },
    { codigo: "BR", descricao: "Brotação" },
    { codigo: "FL", descricao: "Floração" },
    { codigo: "CH", descricao: "Chumbinho (queda de pétalas)" },
    { codigo: "FR", descricao: "Frutificação" },
    { codigo: "MA", descricao: "Maturação" },
    { codigo: "CO", descricao: "Colheita" },
  ],
};

function normalize(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-\s]/g, "")
    .trim();
}

export function getEstagiosPorCultura(nome?: string | null): EstagioFenologico[] | null {
  if (!nome) return null;
  return MAPA[normalize(nome)] ?? null;
}
