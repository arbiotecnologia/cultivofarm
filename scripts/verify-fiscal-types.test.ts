/**
 * Fase Fiscal 3.0.1 — Teste unitário do próprio verificador.
 * Fixtures embutidas: correta, coluna ausente, nullable errado, RPC errada.
 */
import { describe, test, expect } from "vitest";
import { verifyTypes } from "../scripts/verify-fiscal-types";

const CORRECT = `
export type Database = {
  public: {
    Tables: {
      company_fiscal_settings: {
        Row: {
          id: string
          cnpj: string | null
          fiscal_environment: string
          fiscal_provider: string
          configuration_status: string
          nfe_enabled: boolean
          nfse_enabled: boolean
          production_enabled: boolean
        }
        Insert: {}
        Update: {}
        Relationships: []
      }
      product_fiscal_profiles: {
        Row: {
          id: string
          product_id: string
          ncm: string | null
          cfop_in_state: string | null
          cfop_interstate: string | null
          profile_status: string
        }
        Insert: {}
        Update: {}
        Relationships: [{ columns: ["product_id"] }]
      }
      service_fiscal_profiles: {
        Row: {
          id: string
          service_id: string | null
          source_reference: string | null
          lc116_item: string | null
          cnae: string | null
          profile_status: string
        }
        Insert: {}
        Update: {}
        Relationships: []
      }
      customer_fiscal_profiles: {
        Row: {
          id: string
          customer_id: string
          taxpayer_indicator: string | null
          fiscal_municipality_ibge_code: string | null
          profile_status: string
        }
        Insert: {}
        Update: {}
        Relationships: [{ columns: ["customer_id"] }]
      }
      fiscal_invoices: {
        Row: {
          id: string
          company_cnpj: string | null
          document_model: string | null
          environment: string | null
          series: string | null
          invoice_number: number | null
          status: string
        }
        Insert: {}
        Update: {}
        Relationships: []
      }
      fiscal_invoice_items: {
        Row: {
          id: string
          fiscal_invoice_id: string
        }
        Insert: {}
        Update: {}
        Relationships: [{ columns: ["fiscal_invoice_id"] }]
      }
      fiscal_events: {
        Row: {
          id: string
          fiscal_invoice_id: string | null
          event_type: string
          request_snapshot: Json | null
          response_snapshot: Json | null
        }
        Insert: {}
        Update: {}
        Relationships: [{ columns: ["fiscal_invoice_id"] }]
      }
      fiscal_idempotency_keys: {
        Row: {
          id: string
          idempotency_key: string
          fiscal_invoice_id: string | null
        }
        Insert: {}
        Update: {}
        Relationships: []
      }
      fiscal_audit_log: {
        Row: {
          id: string
          action: string
          changed_by: string | null
          changed_at: string
          old_values: Json | null
          new_values: Json | null
        }
        Insert: {}
        Update: {}
        Relationships: []
      }
    }
    Views: {
      v_fiscal_company_readiness: {
        Row: { configuration_status: string }
        Insert: {}
        Update: {}
        Relationships: []
      }
      v_product_fiscal_readiness: {
        Row: { product_id: string; profile_status: string }
        Insert: {}
        Update: {}
        Relationships: []
      }
      v_service_fiscal_readiness: {
        Row: { service_id: string | null; profile_status: string }
        Insert: {}
        Update: {}
        Relationships: []
      }
      v_customer_fiscal_readiness: {
        Row: { customer_id: string; profile_status: string }
        Insert: {}
        Update: {}
        Relationships: []
      }
      v_fiscal_document_reconciliation_pending: {
        Row: { fiscal_invoice_id: string; reconciliation_status: string | null }
        Insert: {}
        Update: {}
        Relationships: []
      }
    }
    Functions: {
      rpc_fiscal_event_manual: {
        Args: { p_invoice_id: string; p_event_type: string; p_notes: string }
        Returns: string
      }
      mask_sensitive_jsonb: {
        Args: { v: Json }
        Returns: Json
      }
    }
  }
}
`;

describe("verify-fiscal-types — fixtures embutidas", () => {
  test("fixture correta passa sem divergências", () => {
    expect(verifyTypes(CORRECT)).toEqual([]);
  });

  test("coluna ausente é detectada", () => {
    const src = CORRECT.replace(/\s+ncm: string \| null\n/, "\n");
    const miss = verifyTypes(src);
    expect(miss.some((m) => m.kind === "column" && m.detail.includes("ncm"))).toBe(true);
  });

  test("nullable incorreto é detectado", () => {
    const src = CORRECT.replace(
      "cnpj: string | null",
      "cnpj: string",
    );
    const miss = verifyTypes(src);
    expect(miss.some((m) => m.kind === "nullable" && m.detail.includes("cnpj"))).toBe(true);
  });

  test("RPC ausente ou com retorno errado é detectada", () => {
    const src = CORRECT.replace(
      "rpc_fiscal_event_manual: {\n        Args: { p_invoice_id: string; p_event_type: string; p_notes: string }\n        Returns: string",
      "rpc_fiscal_event_manual: {\n        Args: { p_invoice_id: string; p_event_type: string; p_notes: string }\n        Returns: number",
    );
    const miss = verifyTypes(src);
    expect(miss.some((m) => m.kind === "rpc.returns")).toBe(true);
  });
});
