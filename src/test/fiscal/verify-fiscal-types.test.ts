/**
 * Fase Fiscal 3.0.2-D — Testes do verify-fiscal-types com fixtures POSITIVAS e NEGATIVAS.
 * Cobre: tabela ausente, coluna ausente, tipo errado, nullability errada,
 * relationship inválida, arg RPC ausente, arg RPC extra, arg opcionalidade,
 * retorno errado, view ausente.
 */
import { describe, test, expect } from "vitest";
import { verifyTypes } from "../../../scripts/verify-fiscal-types";

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
        Insert: { id?: string }
        Update: { id?: string }
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
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: [
          {
            foreignKeyName: "x"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          }
        ]
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
        Insert: { id?: string }
        Update: { id?: string }
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
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: [
          {
            foreignKeyName: "x"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          }
        ]
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
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: []
      }
      fiscal_invoice_items: {
        Row: {
          id: string
          fiscal_invoice_id: string
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: [
          {
            foreignKeyName: "x"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      fiscal_events: {
        Row: {
          id: string
          fiscal_invoice_id: string
          event_type: string
          request_snapshot: Json | null
          response_snapshot: Json | null
        }
        Insert: { id?: string }
        Update: { id?: string }
        Relationships: [
          {
            foreignKeyName: "x"
            columns: ["fiscal_invoice_id"]
            isOneToOne: false
            referencedRelation: "fiscal_invoices"
            referencedColumns: ["id"]
          }
        ]
      }
      fiscal_idempotency_keys: {
        Row: {
          id: string
          idempotency_key: string
          fiscal_invoice_id: string | null
        }
        Insert: { id?: string }
        Update: { id?: string }
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
        Insert: { id?: string }
        Update: { id?: string }
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
        Args: { p_invoice_id: string; p_event_type: string; p_notes?: string }
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

describe("verify-fiscal-types — contrato positivo", () => {
  test("fixture correta passa sem divergências", () => {
    expect(verifyTypes(CORRECT)).toEqual([]);
  });
});

describe("verify-fiscal-types — fixtures NEGATIVAS", () => {
  test("tabela ausente é detectada", () => {
    const src = CORRECT.replace(/fiscal_audit_log:[\s\S]*?Relationships: \[\]\s*\}/, "");
    const miss = verifyTypes(src);
    expect(miss.some((m) => m.kind === "table" && m.detail === "fiscal_audit_log")).toBe(true);
  });

  test("coluna ausente é detectada", () => {
    const src = CORRECT.replace(/\s+ncm: string \| null\n/, "\n");
    expect(verifyTypes(src).some((m) => m.kind === "column" && m.detail.includes("ncm"))).toBe(true);
  });

  test("tipo TS incorreto é detectado", () => {
    const src = CORRECT.replace("nfe_enabled: boolean", "nfe_enabled: string");
    expect(verifyTypes(src).some((m) => m.kind === "type" && m.detail.includes("nfe_enabled"))).toBe(true);
  });

  test("nullability incorreta é detectada", () => {
    const src = CORRECT.replace("cnpj: string | null", "cnpj: string");
    expect(verifyTypes(src).some((m) => m.kind === "nullable" && m.detail.includes("cnpj"))).toBe(true);
  });

  test("fiscal_events.fiscal_invoice_id NÃO pode ser nullable no contrato final", () => {
    const src = CORRECT.replace(
      /fiscal_events:[\s\S]*?fiscal_invoice_id: string\n/,
      (block) => block.replace("fiscal_invoice_id: string", "fiscal_invoice_id: string | null"),
    );
    expect(verifyTypes(src).some((m) => m.kind === "nullable" && m.detail.includes("fiscal_events.fiscal_invoice_id"))).toBe(true);
  });

  test("relationship com referencedRelation errado é detectado", () => {
    const src = CORRECT.replace('referencedRelation: "produtos"', 'referencedRelation: "produtos_wrong"');
    expect(verifyTypes(src).some((m) => m.kind === "relationship" && m.detail.includes("product_fiscal_profiles"))).toBe(true);
  });

  test("view ausente é detectada", () => {
    const src = CORRECT.replace(/v_fiscal_company_readiness:[\s\S]*?Relationships: \[\]\s*\}/, "");
    expect(verifyTypes(src).some((m) => m.kind === "view" && m.detail === "v_fiscal_company_readiness")).toBe(true);
  });

  test("arg obrigatório ausente é detectado", () => {
    const src = CORRECT.replace(
      "Args: { p_invoice_id: string; p_event_type: string; p_notes?: string }",
      "Args: { p_event_type: string; p_notes?: string }",
    );
    expect(verifyTypes(src).some((m) => m.kind === "rpc.arg.missing" && m.detail.includes("p_invoice_id"))).toBe(true);
  });

  test("arg obrigatório marcado opcional é detectado", () => {
    const src = CORRECT.replace(
      "Args: { p_invoice_id: string; p_event_type: string; p_notes?: string }",
      "Args: { p_invoice_id?: string; p_event_type: string; p_notes?: string }",
    );
    expect(verifyTypes(src).some((m) => m.kind === "rpc.arg.optionality" && m.detail.includes("p_invoice_id"))).toBe(true);
  });

  test("arg extra é detectado", () => {
    const src = CORRECT.replace(
      "Args: { p_invoice_id: string; p_event_type: string; p_notes?: string }",
      "Args: { p_invoice_id: string; p_event_type: string; p_notes?: string; p_extra: string }",
    );
    expect(verifyTypes(src).some((m) => m.kind === "rpc.arg.extra" && m.detail.includes("p_extra"))).toBe(true);
  });

  test("retorno RPC incorreto é detectado", () => {
    const src = CORRECT.replace(
      /rpc_fiscal_event_manual:\s*\{\s*Args:[^}]*\}\s*Returns: string/,
      "rpc_fiscal_event_manual: {\n        Args: { p_invoice_id: string; p_event_type: string; p_notes?: string }\n        Returns: number",
    );
    expect(verifyTypes(src).some((m) => m.kind === "rpc.returns")).toBe(true);
  });
});

describe("verify-fiscal-types — posicionamento estrutural (Fase 3.1.1)", () => {
  const VIEW_BLOCK = `      v_fiscal_company_readiness: {
        Row: { configuration_status: string }
        Insert: {}
        Update: {}
        Relationships: []
      }
`;

  test("view declarada dentro de Functions é reprovada", () => {
    // Move v_fiscal_company_readiness de Views para Functions.
    const src = CORRECT
      .replace(VIEW_BLOCK, "")
      .replace("Functions: {\n", `Functions: {\n${VIEW_BLOCK}`);
    const miss = verifyTypes(src);
    expect(
      miss.some(
        (m) => m.kind === "view.misplaced" && m.detail.includes("v_fiscal_company_readiness"),
      ),
    ).toBe(true);
    expect(
      miss.some(
        (m) => m.kind === "view.section" && m.detail.includes("v_fiscal_company_readiness"),
      ),
    ).toBe(true);
  });

  test("view ausente de public.Views é reprovada por view.section", () => {
    const src = CORRECT.replace(VIEW_BLOCK, "");
    expect(
      verifyTypes(src).some(
        (m) => m.kind === "view.section" && m.detail.includes("v_fiscal_company_readiness"),
      ),
    ).toBe(true);
  });

  test("RPC ausente de public.Functions é reprovada por rpc.section", () => {
    const src = CORRECT.replace(
      /rpc_fiscal_event_manual:\s*\{[\s\S]*?Returns: string\s*\}/,
      "",
    );
    expect(
      verifyTypes(src).some(
        (m) => m.kind === "rpc.section" && m.detail.includes("rpc_fiscal_event_manual"),
      ),
    ).toBe(true);
  });

  test("nome duplicado em Views e Functions é reprovado", () => {
    // Copia v_fiscal_company_readiness também para Functions (mantendo em Views).
    const src = CORRECT.replace(
      "Functions: {\n",
      `Functions: {\n${VIEW_BLOCK}`,
    );
    expect(
      verifyTypes(src).some(
        (m) =>
          m.kind === "duplicate.section" &&
          m.detail.includes("v_fiscal_company_readiness"),
      ),
    ).toBe(true);
  });
});

