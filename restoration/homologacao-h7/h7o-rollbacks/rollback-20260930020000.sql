-- H7O P3 ROLLBACK — remove o rate-limit de rpc_validar_comprovante_entrega e restaura o corpo ORIGINAL
-- (pg_get_functiondef capturado no staging ikaauvsflpmamgxmkhoq antes de 20260930020000).
-- Remove job de poda, funções e tabelas privadas (inclusive o pepper — os hashes ficam irrecuperáveis, por desenho).
-- Idempotente. Executar via restoration/os-e2e/staging-psql.sh -1 -f <este arquivo>.
begin;

-- 1) RPC pública: corpo original.
CREATE OR REPLACE FUNCTION public.rpc_validar_comprovante_entrega(p_validation_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp public.entrega_comprovantes%ROWTYPE;
  v_msg text;
BEGIN
  SELECT * INTO v_comp FROM public.entrega_comprovantes WHERE validation_token = p_validation_token;
  IF NOT FOUND OR NOT v_comp.validation_public_enabled THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante não encontrado ou indisponível.');
  END IF;
  IF v_comp.validation_expires_at IS NOT NULL AND v_comp.validation_expires_at < now() THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante expirado.');
  END IF;
  IF v_comp.status IN ('cancelado','rejeitado') THEN
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Comprovante cancelado.');
  END IF;

  v_msg := CASE v_comp.assinatura_tipo
    WHEN 'dispensada' THEN 'Comprovante registrado com dispensa formal de assinatura no sistema AR Bio.'
    WHEN 'digital_tela' THEN 'Comprovante registrado com assinatura digital operacional no sistema AR Bio.'
    WHEN 'fisica_anexada' THEN 'Comprovante registrado com formulário físico assinado no sistema AR Bio.'
    ELSE 'Comprovante de entrega registrado no sistema AR Bio.'
  END;

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_comp.status,
    'assinatura_tipo', v_comp.assinatura_tipo,
    'possui_ressalvas', COALESCE(v_comp.possui_ressalvas, false),
    'numero_formulario', v_comp.numero_formulario,
    'data_confirmacao', v_comp.confirmado_em,
    'data_assinatura', v_comp.data_assinatura,
    'validation_hash', v_comp.validation_hash,
    'mensagem', v_msg
  );
END $function$
;

-- 2) Job de poda.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'h7o-prune-public-validation-rate-limit') THEN
      PERFORM cron.unschedule('h7o-prune-public-validation-rate-limit');
    END IF;
  END IF;
END
$cron$;

-- 3) Funções e tabelas privadas.
DROP FUNCTION IF EXISTS private.fn_public_validation_rate_check(uuid);
DROP FUNCTION IF EXISTS private.fn_public_validation_rate_prune(interval);
DROP TABLE IF EXISTS private.public_validation_rate_counters;
DROP TABLE IF EXISTS private.public_validation_rate_policy;
DROP TABLE IF EXISTS private.public_validation_rate_pepper;
-- O schema private é preservado (contém os wrappers H7N).

DO $post$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.rpc_validar_comprovante_entrega(uuid)'::regprocedure
                AND prosrc LIKE '%fn_public_validation_rate_check%') THEN
    RAISE EXCEPTION 'H7O P3 ROLLBACK ABORT: RPC ainda referencia o rate-limit';
  END IF;
  IF to_regclass('private.public_validation_rate_counters') IS NOT NULL THEN
    RAISE EXCEPTION 'H7O P3 ROLLBACK ABORT: tabela de contadores ainda existe';
  END IF;
END $post$;
commit;
