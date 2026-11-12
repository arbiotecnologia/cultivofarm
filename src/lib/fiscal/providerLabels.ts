import { ALLOWED_PROVIDERS } from "./companyFiscalValidation";

/** Somente rótulos de exibição; escolher um provedor não abre conexão nem autoriza emissão. */
const PROVIDER_LABELS: Record<(typeof ALLOWED_PROVIDERS)[number], string> = {
  NONE: "Nenhum (sem integração)",
  NOT_CONFIGURED: "Não configurado",
  FOCUS_NFE: "Focus NFe",
  PLUGNOTAS: "PlugNotas",
  SEFAZ_DIRETO: "SEFAZ direto",
  NFSE_NACIONAL: "NFS-e Nacional",
  MUNICIPAL: "Prefeitura (municipal)",
  OTHER_FUTURE: "Outro (futuro)",
};
export const PROVIDER_OPTIONS = ALLOWED_PROVIDERS.map((value) => ({ value, label: PROVIDER_LABELS[value] }));
