export const OBJ_LABELS: Record<string, string> = {
  preventivo: "Preventivo",
  corretivo: "Corretivo",
  reducao_pressao: "Redução de Pressão",
  tratamento_solo: "Tratamento de Solo",
  reequilibrio_biologico: "Reequilíbrio Biológico",
  suporte_fisiologico: "Suporte Fisiológico",
  manejo_integrado: "Manejo Integrado",
};

export const ESTRATEGIA_LABELS: Record<string, string> = {
  biologico: "Biológico",
  manejo_integrado: "Manejo Integrado",
  monitoramento: "Monitoramento",
  correcao_operacional: "Correção Operacional",
  ajuste_aplicacao: "Ajuste de Aplicação",
  ajuste_janela: "Ajuste de Janela",
  outro: "Outro",
};

export const MODO_LABELS: Record<string, string> = {
  foliar: "Foliar",
  aplicacao_no_colo_da_planta: "Colo da planta",
  via_solo: "Via solo",
  tratamento_semente: "Tratamento de semente",
  sulco_plantio: "Sulco de plantio",
  jato_dirigido: "Jato dirigido",
  outro: "Outro",
};

export const CATEGORIA_LABELS: Record<string, string> = {
  insetos_praga: "Insetos-praga",
  doencas_fungicas: "Doenças fúngicas",
  doencas_bacterianas: "Doenças bacterianas",
  nematoides: "Nematoides",
  plantas_daninhas: "Plantas daninhas",
  desequilibrio_biologico_solo: "Desequilíbrio biológico do solo",
  baixa_vitalidade: "Baixa vitalidade",
  falha_estande: "Falha de estande",
  fitotoxidade: "Fitotoxidade",
  outro: "Outro",
};

export const STATUS_LABELS: Record<string, string> = {
  finalizado: "Finalizado",
  enviado_aprovacao: "Em aprovação",
  aprovado: "Aprovado",
  convertido_os: "Convertido em OS",
  arquivado: "Arquivado",
};

export const PRESSAO_VARIANT: Record<string, "secondary" | "destructive" | "outline"> = {
  baixo: "outline",
  medio: "secondary",
  alto: "destructive",
  severo: "destructive",
};

export const PRIORIDADE_LABELS: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export const PRIORIDADE_CLASSES: Record<string, string> = {
  baixa: "bg-emerald-100 text-emerald-700 border-emerald-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  alta: "bg-orange-100 text-orange-700 border-orange-200",
  critica: "bg-red-100 text-red-700 border-red-200",
};

export const RETORNO_LABELS: Record<string, string> = {
  sim: "Sim",
  nao: "Não",
  avaliar_depois: "A avaliar",
};
