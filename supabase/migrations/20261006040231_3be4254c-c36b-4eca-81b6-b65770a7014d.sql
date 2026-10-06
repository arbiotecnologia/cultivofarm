ALTER TABLE public.saas_plan_versions
  DROP CONSTRAINT IF EXISTS saas_plan_versions_publication_reason_length;
ALTER TABLE public.saas_plan_versions
  ADD CONSTRAINT saas_plan_versions_publication_reason_length
  CHECK (publication_reason IS NULL OR char_length(btrim(publication_reason)) BETWEEN 2 AND 500)
  NOT VALID;
ALTER TABLE public.saas_plan_versions
  VALIDATE CONSTRAINT saas_plan_versions_publication_reason_length;

ALTER TABLE public.saas_plan_version_audit
  DROP CONSTRAINT IF EXISTS saas_plan_version_audit_reason_length;
ALTER TABLE public.saas_plan_version_audit
  ADD CONSTRAINT saas_plan_version_audit_reason_length
  CHECK (char_length(btrim(reason)) BETWEEN 2 AND 500)
  NOT VALID;
ALTER TABLE public.saas_plan_version_audit
  VALIDATE CONSTRAINT saas_plan_version_audit_reason_length;