-- Corrige RPCs que referenciam coluna inexistente produtos.preco_venda → valor_litro_brl
DO $mig$
DECLARE
  fn_def text;
  fn record;
BEGIN
  FOR fn IN
    SELECT oid, proname FROM pg_proc
     WHERE pronamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
       AND prosrc ILIKE '%preco_venda%'
  LOOP
    fn_def := pg_get_functiondef(fn.oid);
    fn_def := replace(fn_def, 'p.preco_venda', 'p.valor_litro_brl');
    fn_def := replace(fn_def, 'preco_venda', 'valor_litro_brl');
    EXECUTE fn_def;
  END LOOP;
END
$mig$;