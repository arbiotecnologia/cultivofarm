-- H9-D-L3 — Correção de exposições comprovadas no lote L3
-- Ambiente: homologação ikaauvsflpmamgxmkhoq. Produção NÃO tocada.
--
-- Exposições comprovadas dinamicamente (sessão authenticated, usuário sem papel
-- e sem vínculo com cliente, em transação revertida):
--  (E1) get_cliente_ids_for_user(uuid) devolvia os cliente_id de QUALQUER
--       usuário informado por parâmetro (BOLA / vazamento de tenant). Prova:
--       ator sem vínculo recebeu {b05e3c22-...} ao informar o uid de um
--       produtor; com o próprio uid recebeu {}.
--  (E2) helpers de autorização com uid parametrizado funcionavam como oráculo
--       de papel/vínculo sobre terceiros:
--         has_active_user_cliente_access(uuid,uuid,text[]) -> true p/ uid alheio
--         is_financial_staff(uuid)                          -> true p/ uid alheio
--         is_delivery_staff(uuid)                           -> true p/ uid alheio
--         pode_acessar_recomendacao(uuid,uuid)              -> true p/ uid alheio
--       Além do oráculo, qualquer chamador que controle o argumento poderia
--       satisfazer a guarda usando o uid de um administrador.
--  (E3) fn_catalogo_preco_canonico(uuid,uuid,text,numeric) devolvia o preço
--       interno derivado de public.catalogo_volumes a qualquer authenticated,
--       contornando a RLS da tabela de origem. Prova: produtor lê 0 linhas em
--       catalogo_volumes e mesmo assim obteve 150.000000 (litro) e 15.00 (ha).
--
-- Correção mínima e reversível, sem fluxo paralelo: assinaturas, parâmetros,
-- defaults, retornos, linguagem, volatilidade e search_path preservados.
-- Todos os callsites reais de E1/E2 passam auth.uid() (políticas RLS e RPCs
-- SECURITY DEFINER); sessões internas sem JWT (pg_cron/service_role,
-- auth.uid() IS NULL) continuam válidas via public.fn_authz_uid_scope_ok.
-- Em E3 todos os consumidores legítimos (fn_b2b_resolve_base_unit_price,
-- fn_resolve_commercial_price, private.h7n_catalogo_ficha_produtos,
-- private.h7n_catalogo_ficha_microrganismos) executam em contexto de owner ou
-- já estão sem EXECUTE para authenticated, portanto são preservados; nenhum
-- callsite do frontend chama a função diretamente.

-- E1 — escopo de identidade no resolvedor de clientes (fail-closed: array vazio)
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
 RETURNS uuid[]
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(
    SELECT cliente_id FROM public.user_clientes WHERE user_id = _user_id
    UNION
    SELECT cliente_id FROM public.profiles WHERE user_id = _user_id AND cliente_id IS NOT NULL
  ) ELSE ARRAY[]::uuid[] END;
$function$;

-- E2 — helpers de autorização com uid parametrizado
CREATE OR REPLACE FUNCTION public.has_active_user_cliente_access(_user_id uuid, _cliente_id uuid, _levels text[] DEFAULT ARRAY['read'::text, 'execute'::text, 'manage'::text])
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _cliente_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.fn_authz_uid_scope_ok(_user_id) THEN
    RETURN false;
  END IF;
  IF public.has_role(_user_id, 'administrador'::public.app_role) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.user_clientes uc
     WHERE uc.user_id = _user_id
       AND uc.cliente_id = _cliente_id
       AND uc.is_active = true
       AND (uc.valid_from IS NULL OR uc.valid_from <= now())
       AND (uc.valid_until IS NULL OR uc.valid_until >= now())
       AND uc.access_level::text = ANY(_levels)
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.is_delivery_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_uid)
     AND (public.has_role(_uid,'administrador'::app_role)
      OR public.has_role(_uid,'gestor'::app_role)
      OR public.has_role(_uid,'administrativo'::app_role)
      OR public.has_role(_uid,'producao'::app_role)
      OR public.has_role(_uid,'operador_onfarm'::app_role)
      OR public.has_role(_uid,'aplicador'::app_role));
$function$;

CREATE OR REPLACE FUNCTION public.is_financial_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.fn_authz_uid_scope_ok(_uid) THEN
    RETURN false;
  END IF;
  RETURN has_role(_uid, 'administrador'::app_role)
      OR has_role(_uid, 'gestor'::app_role)
      OR has_role(_uid, 'financeiro'::app_role);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pode_acessar_recomendacao(_user_id uuid, _recomendacao_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_user_id) AND EXISTS (
    SELECT 1
    FROM public.registros_consultor_recomendacoes r
    JOIN public.registros_consultor rc ON rc.id = r.registro_consultor_id
    WHERE r.id = _recomendacao_id
      AND (
        public.has_role(_user_id, 'administrador'::app_role)
        OR public.has_role(_user_id, 'gestor'::app_role)
        OR public.has_role(_user_id, 'tecnico_agronomo'::app_role)
        OR public.has_role(_user_id, 'consultor_tecnico'::app_role)
        OR EXISTS (
          SELECT 1 FROM public.user_clientes uc
          WHERE uc.user_id = _user_id AND uc.cliente_id = rc.cliente_id
        )
      )
  );
$function$;

-- E3 — menor privilégio no preço interno do catálogo (contrato preservado)
REVOKE EXECUTE ON FUNCTION public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_catalogo_preco_canonico(uuid,uuid,text,numeric) TO service_role;
