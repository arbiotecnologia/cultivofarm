-- FIXTURE DE HOMOLOGAÇÃO (marker: ARBIO_FIXTURE_HOMOLOGACAO)
-- Origem: bloco 5 da migration 20260729193425 (já aplicado no staging ikaauvsflpmamgxmkhoq).
-- NÃO pertence à cadeia de migrations e NÃO pode ser promovido para produção.
-- Guarda de ambiente obrigatória antes de qualquer execução.
DO $g$
DECLARE v text;
BEGIN
  SELECT project_ref INTO v FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'FIXTURE_GUARD: somente staging';
  END IF;
END $g$;

-- 5) Vínculos de carteira faltantes
INSERT INTO public.user_clientes (user_id, cliente_id, principal)
SELECT '79cdba52-f388-4f03-a919-8b6eaee2c552'::uuid, 'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_clientes
  WHERE user_id = '79cdba52-f388-4f03-a919-8b6eaee2c552'::uuid
    AND cliente_id = 'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid
);

INSERT INTO public.partner_clients (partner_id, cliente_id, active, notes)
SELECT '6f22d1dc-2862-4fdf-a334-cd010de06bb1'::uuid, 'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid, true, 'Carteira homologacao'
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_clients
  WHERE partner_id = '6f22d1dc-2862-4fdf-a334-cd010de06bb1'::uuid
    AND cliente_id = 'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid
);

INSERT INTO public.partner_user_clients
  (partner_id, user_id, user_role, cliente_id, assignment_type, can_create_simulation, can_monitor, active)
SELECT '6f22d1dc-2862-4fdf-a334-cd010de06bb1'::uuid,
       '08832541-8155-43d2-bc4f-6a6bc407f7ae'::uuid,
       'parceiro_b2b_tecnico',
       'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid,
       'tecnico', true, true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_user_clients
  WHERE user_id = '08832541-8155-43d2-bc4f-6a6bc407f7ae'::uuid
    AND cliente_id = 'b05e3c22-5e4a-4443-8f3c-70505045aa5b'::uuid
);

-- CLEANUP (executar apenas em staging, nunca sobre vínculos reais):
-- DELETE FROM public.partner_user_clients WHERE user_id='08832541-8155-43d2-bc4f-6a6bc407f7ae' AND cliente_id='b05e3c22-5e4a-4443-8f3c-70505045aa5b';
-- DELETE FROM public.partner_clients      WHERE partner_id='6f22d1dc-2862-4fdf-a334-cd010de06bb1' AND cliente_id='b05e3c22-5e4a-4443-8f3c-70505045aa5b' AND notes='Carteira homologacao';
-- DELETE FROM public.user_clientes        WHERE user_id='79cdba52-f388-4f03-a919-8b6eaee2c552' AND cliente_id='b05e3c22-5e4a-4443-8f3c-70505045aa5b';
