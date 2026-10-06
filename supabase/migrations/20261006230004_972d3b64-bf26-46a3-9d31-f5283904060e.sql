-- Permite registrar a ação 'superseded' (encerramento de vigência da versão anterior).
-- Rollback: recriar a constraint sem 'superseded' (somente se não houver linhas com essa ação).
ALTER TABLE public.saas_plan_version_audit DROP CONSTRAINT IF EXISTS saas_plan_version_audit_action_valid;
ALTER TABLE public.saas_plan_version_audit ADD CONSTRAINT saas_plan_version_audit_action_valid
  CHECK (action = ANY (ARRAY['draft_created','draft_updated','published','archived','superseded']));