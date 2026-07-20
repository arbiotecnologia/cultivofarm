// Tipos compartilhados dos relatórios financeiros.
// Forma dos dados retornados pelas RPCs `get_report_*` (Lovable Cloud).
// Mantidos aqui para evitar `any` espalhado pelos componentes de relatório.

export interface MonthlyReport {
  received?: number;
  paid?: number;
  expected_receivable?: number;
  expected_payable?: number;
  net_cash?: number;
}

export interface ReceivableRow {
  installment_id: string;
  due_date: string;
  customer_name: string;
  description: string;
  category: string | null;
  amount: number;
  paid: number;
  balance: number;
  status: string;
}

export interface PayableRow {
  installment_id: string;
  due_date: string;
  supplier: string;
  description: string;
  category: string | null;
  amount: number;
  paid: number;
  balance: number;
  status: string;
}

export interface DelinquencyRow {
  installment_id: string;
  customer_name: string;
  description: string;
  due_date: string;
  balance: number;
  days_overdue: number;
}

export interface NFePendingRow {
  receivable_id: string;
  issue_date: string;
  customer_name: string;
  description: string;
  total_amount: number;
  fiscal_invoice_status: string;
}

export interface DeliveryBillingRow {
  delivery_id: string;
  delivery_date: string;
  customer_name: string;
  total_value: number;
  billed: boolean;
}

export interface CustomerStatement {
  delivered?: number;
  billed?: number;
  received?: number;
  open_balance?: number;
}

export interface AccountabilitySummary {
  delivered?: number;
  billed?: number;
  received?: number;
  open_balance?: number;
}

export interface AccountabilityReport {
  summary?: AccountabilitySummary;
}

export interface AccountabilityScope {
  customer_id?: string;
  from?: string;
  to?: string;
}
