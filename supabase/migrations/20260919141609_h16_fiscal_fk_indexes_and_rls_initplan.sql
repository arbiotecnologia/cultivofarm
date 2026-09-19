-- H16: covering indexes for fiscal foreign keys used by XML/SEFAZ/document closure.
-- Additive and reversible; no data mutation.
create index if not exists ix_fd_fiscal_event_id
  on public.financial_documents (fiscal_event_id);
create index if not exists ix_fd_fiscal_invoice_id
  on public.financial_documents (fiscal_invoice_id);
create index if not exists ix_fe_related_event_id
  on public.fiscal_events (related_event_id);
create index if not exists ix_fik_fiscal_invoice_id
  on public.fiscal_idempotency_keys (fiscal_invoice_id);
create index if not exists ix_fi_danfe_document_id
  on public.fiscal_invoices (danfe_document_id);
create index if not exists ix_fi_debtor_customer_id
  on public.fiscal_invoices (debtor_customer_id);
create index if not exists ix_fi_debtor_partner_id
  on public.fiscal_invoices (debtor_partner_id);
create index if not exists ix_fi_delivery_id
  on public.fiscal_invoices (delivery_id);
create index if not exists ix_fi_parent_invoice_id
  on public.fiscal_invoices (parent_invoice_id);
create index if not exists ix_fi_substitution_invoice_id
  on public.fiscal_invoices (substitution_invoice_id);
create index if not exists ix_fi_xml_document_id
  on public.fiscal_invoices (xml_document_id);
create index if not exists ix_fpd_transmission_id
  on public.fiscal_protocoled_documents (transmission_id);
create index if not exists ix_fpd_xml_run_id
  on public.fiscal_protocoled_documents (xml_run_id);
create index if not exists ix_fst_xml_run_id
  on public.fiscal_sefaz_transmissions (xml_run_id);
create index if not exists ix_fxr_previous_run_id
  on public.fiscal_xml_runs (previous_run_id);
create index if not exists ix_fxr_reservation_id
  on public.fiscal_xml_runs (reservation_id);

-- Preserve policy semantics while making auth.uid() an initplan.
alter policy fiscal_protocoled_documents_read
on public.fiscal_protocoled_documents
using (
  public.fn_fiscal_can_operate((select auth.uid()))
  and public.h15_invoice_access(fiscal_invoice_id)
);
