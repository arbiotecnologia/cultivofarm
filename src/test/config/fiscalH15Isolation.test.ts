import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const sql = readFileSync('restoration/fiscal-h15/20261038000000_h15_fiscal_company_isolation.sql', 'utf8');
const changes = JSON.parse(readFileSync('restoration/fiscal-h15/function-changes.json', 'utf8')) as {signature: string; action: string}[];
describe('H15 candidate migration safety contracts (not live isolation certification)', () => {
  it('locks and checks the canonical baseline before any backfill', () => {
    expect(sql.indexOf('LOCK TABLE')).toBeLessThan(sql.indexOf('UPDATE public.company_fiscal_settings SET organization_id'));
    expect(sql.indexOf('H15_BASELINE_CHANGED')).toBeLessThan(sql.indexOf('ALTER TABLE public.company_fiscal_settings'));
    expect(sql).toContain("project_ref='swzpzcwiasxmjutrmvkm'");
    expect(sql).toContain('production_emission_allowed IS FALSE');
    expect(sql).toContain('H15_FUNCTION_DRIFT');
  });
  it('requires issuer ownership and restrictive foreign keys', () => {
    expect(sql).toContain('ALTER COLUMN organization_id SET NOT NULL');
    expect(sql).toContain('company_settings_id uuid NOT NULL REFERENCES public.company_fiscal_settings(id) ON DELETE RESTRICT');
    expect(sql).toContain('ux_company_fiscal_settings_active_organization');
    expect(sql).toContain('ix_fiscal_invoices_company_settings');
  });
  it('binds identity to the caller, not a caller-supplied uid', () => {
    expect(sql).toContain('p.user_id=auth.uid() AND p.ativo IS TRUE');
    expect(sql).not.toContain('user_metadata');
    expect(sql).toContain('H15_CREATOR_FORGED');
    expect(sql).toContain('H15_CREATOR_ORGANIZATION_MISMATCH');
    expect(sql).toContain('H15_INVOICE_OWNERSHIP_IMMUTABLE');
  });
  it('preserves the producer policy and does not turn production on', () => {
    expect(sql).not.toContain('ALTER POLICY "fi_producer_read"');
    expect(sql).not.toMatch(/production_enabled\s*=\s*true/i);
    expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('DISABLE TRIGGER');
  });
  it('validates snapshot identity and secondary cross-links', () => {
    for (const gate of ['H15_SNAPSHOT_CNPJ_REQUIRED', 'H15_SNAPSHOT_MISMATCH', 'H15_CNPJ_MISMATCH', 'H15_CROSS_COMPANY_REFERENCE', 'H15_PARENT_IMMUTABLE']) expect(sql).toContain(gate);
    for (const table of ['fiscal_invoices','fiscal_invoice_items','fiscal_invoice_references','fiscal_invoice_item_references','fiscal_xml_runs','fiscal_sefaz_transmissions','fiscal_protocoled_documents']) expect(sql).toContain(`ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.h15_related_integrity`);
  });
  it('contains scoped versions of every required public contract', () => {
    for (const name of ['rpc_fiscal_company_settings_init','rpc_fiscal_company_rtc_get','rpc_fiscal_company_rtc_save','rpc_fiscal_draft_save','rpc_upsert_fiscal_invoice_manual','rpc_fiscal_tax_preview_v1','rpc_fiscal_xml_status_v1','rpc_fiscal_sefaz_transmission_status_v1','fn_financial_inconsistencies','rpc_fiscal_nfe_readiness_v1','rpc_fiscal_preflight_v1','rpc_fiscal_reserve_nfe_number_v1']) expect(changes.some(c => c.signature.startsWith(name+'(') && c.action==='scoped_definition')).toBe(true);
  });
  it('revokes technical operations rather than exposing a service bypass', () => {
    for (const c of changes.filter(c=>c.action==='service_only')) expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${c.signature} FROM PUBLIC,anon,authenticated;`);
    expect(sql).not.toContain('DELETE FROM (');
  });
});
