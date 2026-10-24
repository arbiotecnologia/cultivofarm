-- READ ONLY; mandatory before any deployment/reopening, in addition to preflight.sql.
-- Prove canonical ref swzpzcwiasxmjutrmvkm externally first. No UPDATE/validation performed here.
-- Owner A is the intended scope; B is diagnostic only, not a request to configure B.
BEGIN TRANSACTION READ ONLY;
SELECT o.id AS owner_id, count(c.id) AS active_settings_count,
       coalesce(bool_and(c.configuration_status='VALIDATED'
         AND c.accounting_validated_at IS NOT NULL
         AND nullif(btrim(c.legal_name),'') IS NOT NULL
         AND nullif(btrim(c.cnpj),'') IS NOT NULL),false) AS accounting_ready
FROM public.organizations o
LEFT JOIN public.company_fiscal_settings c ON c.organization_id=o.id AND c.is_active
WHERE o.id IN ('007bb519-cba0-4704-be2c-cb93ad010048','8f57c7dd-0557-4041-b401-7a00f7244626')
GROUP BY o.id ORDER BY o.id;
DO $accounting$
DECLARE n integer; ready boolean;
BEGIN
 SELECT count(*),coalesce(bool_and(configuration_status='VALIDATED'
   AND accounting_validated_at IS NOT NULL
   AND nullif(btrim(legal_name),'') IS NOT NULL
   AND nullif(btrim(cnpj),'') IS NOT NULL),false)
 INTO n,ready FROM public.company_fiscal_settings
 WHERE organization_id='007bb519-cba0-4704-be2c-cb93ad010048' AND is_active;
 IF n<>1 OR NOT ready THEN
   RAISE EXCEPTION 'C2_ACCOUNTING_PREREQUISITE_BLOCKED: owner A requires one genuinely accounting-validated active fiscal configuration; human review required, writer must stay false'
   USING ERRCODE='42501';
 END IF;
END $accounting$;
ROLLBACK;