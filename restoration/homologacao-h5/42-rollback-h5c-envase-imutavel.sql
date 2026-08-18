\set ON_ERROR_STOP on
BEGIN;
DROP TRIGGER IF EXISTS trg_envase_material_imutavel ON public.envase;
DROP FUNCTION IF EXISTS public.fn_envase_material_imutavel();
COMMIT;
