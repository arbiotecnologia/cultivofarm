export type ViewerScope =
  | "comercial"
  | "parceiro_gestor"
  | "parceiro_tecnico"
  | "produtor";

/** Regras de visibilidade por escopo. */
export const scopeCan = {
  discountDetails: (s: ViewerScope) => s === "comercial" || s === "parceiro_gestor",
  financialStatus: (s: ViewerScope) => s === "comercial",
  commercialNotes: (s: ViewerScope) => s === "comercial",
  
  paymentCondition: (s: ViewerScope) => s === "comercial" || s === "parceiro_gestor",
  clienteFinanceInfo: (s: ViewerScope) => s === "comercial" || s === "parceiro_gestor",
  responsaveisInternos: (s: ViewerScope) => s !== "produtor",
  observacoesGerais: (s: ViewerScope) => s !== "produtor",
  openOrderDetail: (s: ViewerScope) => s !== "parceiro_tecnico",
  itemDiscountColumn: (s: ViewerScope) => s === "comercial" || s === "parceiro_gestor",
};
