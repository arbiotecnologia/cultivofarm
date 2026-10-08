-- P1B PROPOSTA NÃO APLICADA. Não autoriza nem ativa qualquer vínculo.
-- Submeter pelo mecanismo oficial de migration somente após revisão do contrato.
-- Sem backfill, sem alteração de ACL BF01–03/P1A e sem fluxo operacional paralelo.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                 WHERE project_ref = 'swzpzcwiasxmjutrmvkm')
     OR EXISTS (SELECT 1 FROM public.fiscal_environment_marker
                WHERE project_ref <> 'swzpzcwiasxmjutrmvkm') THEN
    RAISE EXCEPTION 'canonical_project_required';
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public.b2b_operation_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_key uuid NOT NULL,
  revision integer NOT NULL,
  predecessor_id uuid REFERENCES public.b2b_operation_mandates(id) ON DELETE RESTRICT,
  contractor_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  partner_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  partner_account_id uuid NOT NULL REFERENCES public.partner_accounts(id) ON DELETE RESTRICT,
  debtor_customer_id uuid REFERENCES public.clientes(id) ON DELETE RESTRICT,
  creditor_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  issuer_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  document_model text NOT NULL,
  action_scope text[] NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  authored_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  contractor_reviewed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  partner_reviewed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  evidence_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_key, revision)
);
GRANT SELECT ON public.b2b_operation_mandates TO authenticated;
GRANT ALL ON public.b2b_operation_mandates TO service_role;
ALTER TABLE public.b2b_operation_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY b2b_mandate_closed ON public.b2b_operation_mandates
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Registro imutável e INATIVO. Ativação/revisão exigem outra migration aprovada,
-- RPC com ator/tenant/papel/plano/aceites A e P e ticket privado não forjável.
CREATE OR REPLACE FUNCTION public.guard_b2b_mandate_draft()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $body$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'mandate_revision_immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM 'DRAFT'
     OR NEW.contractor_reviewed_by_profile_id IS NOT NULL
     OR NEW.partner_reviewed_by_profile_id IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL THEN
    RAISE EXCEPTION 'mandate_activation_unavailable' USING ERRCODE = '42501';
  END IF;
  IF NEW.revision < 1 OR NEW.contractor_organization_id = NEW.partner_organization_id
     OR NOT isfinite(NEW.valid_from) OR NOT isfinite(NEW.valid_until)
     OR NEW.valid_until <= NEW.valid_from
     OR NEW.document_model NOT IN ('55', 'NFSE')
     OR cardinality(NEW.action_scope) < 1
     OR array_position(NEW.action_scope, NULL) IS NOT NULL
     OR NOT NEW.action_scope <@ ARRAY[
       'clients.list', 'clients.assign', 'clients.unassign', 'orders.read',
       'orders.create', 'production.create', 'deliveries.read',
       'receivables.read', 'receivables.generate', 'receivables.cancel', 'fiscal.draft'
     ]::text[]
     OR length(btrim(NEW.evidence_reference)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'mandate_invalid_payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_accounts p
                  WHERE p.id = NEW.partner_account_id
                    AND p.commercial_owner_organization_id = NEW.contractor_organization_id
                    AND p.ativo AND p.deleted_at IS NULL)
     OR NOT EXISTS (SELECT 1 FROM public.organizations o
                     WHERE o.id = NEW.partner_organization_id
                       AND o.partner_account_id = NEW.partner_account_id
                       AND o.ativo AND o.status = 'ativa')
     OR (SELECT count(*) FROM public.organizations o
          WHERE o.partner_account_id = NEW.partner_account_id) <> 1 THEN
    RAISE EXCEPTION 'mandate_relationship_unproven' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations o
                  WHERE o.id = NEW.contractor_organization_id AND o.ativo AND o.status = 'ativa')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p
                     WHERE p.id = NEW.authored_by_profile_id AND p.ativo
                       AND p.organization_id = NEW.contractor_organization_id)
     OR NEW.creditor_organization_id NOT IN (NEW.contractor_organization_id, NEW.partner_organization_id)
     OR NEW.issuer_organization_id NOT IN (NEW.contractor_organization_id, NEW.partner_organization_id)
     OR (NEW.debtor_customer_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.clientes c WHERE c.id = NEW.debtor_customer_id
         AND c.organization_id = NEW.creditor_organization_id)) THEN
    RAISE EXCEPTION 'mandate_party_unproven' USING ERRCODE = '42501';
  END IF;
  IF (NEW.revision = 1 AND NEW.predecessor_id IS NOT NULL)
     OR (NEW.revision > 1 AND NOT EXISTS (
       SELECT 1 FROM public.b2b_operation_mandates m WHERE m.id = NEW.predecessor_id
         AND m.contract_key = NEW.contract_key AND m.revision = NEW.revision - 1)) THEN
    RAISE EXCEPTION 'mandate_predecessor_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $body$;
REVOKE ALL ON FUNCTION public.guard_b2b_mandate_draft() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER b2b_mandate_draft_guard BEFORE INSERT OR UPDATE OR DELETE
  ON public.b2b_operation_mandates FOR EACH ROW EXECUTE FUNCTION public.guard_b2b_mandate_draft();

-- Integração FUTURA: order guarda mandate_id + revision + snapshot imutável,
-- com credor/emissor/devedor/operação. Backfill proibido. Não adicionar FK default
-- nem resolver o contrato pelo "mais recente". Nenhuma função atual o consome.
-- Reexecução: CREATE POLICY/TRIGGER deliberadamente exige revisão do ledger;
-- aplicar UMA VEZ via ferramenta oficial, não reutilizar como seed.