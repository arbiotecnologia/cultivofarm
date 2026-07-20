-- Atualiza a função is_financial_staff para remover 'administrativo'
CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN has_role(_uid, 'administrador'::app_role)
      OR has_role(_uid, 'gestor'::app_role)
      OR has_role(_uid, 'financeiro'::app_role);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Garante search_path nas funções criadas anteriormente
ALTER FUNCTION public.fn_recurring_generation_audit() SET search_path = public;
ALTER FUNCTION public.fn_revert_recurring_generation(UUID) SET search_path = public;
