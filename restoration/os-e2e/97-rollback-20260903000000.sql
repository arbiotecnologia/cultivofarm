-- Rollback de 20260903000000_comprovante_entrega_documento_v1
-- Remove o motor documental sem tocar em dados de entrega ja congelados.
DO $guard$
BEGIN
  PERFORM public.fn_os_assert_staging_exato();
END
$guard$;

DROP FUNCTION IF EXISTS public.rpc_get_comprovante_entrega_data(uuid, boolean);
DROP FUNCTION IF EXISTS public.fn_comprovante_entrega_montar_v1(uuid);
-- A sequence e o conteudo de entrega_comprovantes.metadata sao preservados
-- de proposito: numeros ja emitidos nao podem ser reciclados.
