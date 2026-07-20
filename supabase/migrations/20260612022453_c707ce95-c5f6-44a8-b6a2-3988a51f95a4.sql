-- 1. Correção de Segurança: can_user_access_cliente
-- Anteriormente permitia qualquer cliente_produtor ver qualquer cliente.
CREATE OR REPLACE FUNCTION public.can_user_access_cliente(_cliente_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path = public
AS $function$
  SELECT (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
    OR has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
    OR _cliente_id = ANY(get_cliente_ids_for_user(auth.uid()))
  );
$function$;

-- 2. Suporte a Estorno de Estoque
-- Adiciona 'estornado' ao enum se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum JOIN pg_type ON pg_type.oid = pg_enum.enumtypid WHERE pg_type.typname = 'status_estoque' AND enumlabel = 'estornado') THEN
        ALTER TYPE public.status_estoque ADD VALUE 'estornado';
    END IF;
END
$$;

-- 3. Garantir RLS em registros_consultor_arquivos (reforço da Fase 10.2.1.11.2)
DROP POLICY IF EXISTS "Cliente read released files" ON public.registros_consultor_arquivos;
CREATE POLICY "Cliente read released files" ON public.registros_consultor_arquivos
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM registros_consultor r 
        WHERE r.id = registros_consultor_arquivos.registro_consultor_id 
        AND can_user_access_cliente(r.cliente_id)
        AND r.status IN ('aprovado', 'convertido_os', 'finalizado')
    )
);