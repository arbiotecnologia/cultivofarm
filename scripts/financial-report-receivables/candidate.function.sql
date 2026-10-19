CREATE OR REPLACE FUNCTION public.get_report_receivables(_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(installment_id uuid, receivable_id uuid, customer_name text, description text, category text, due_date date, amount numeric, paid numeric, balance numeric, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _org uuid;
  _from date;
  _to date;
  _status text;
  _customer uuid;
  _key text;
BEGIN
  -- Live actor (no JWT claims for role/tenant): profile/org/readiness and
  -- user_roles are read from the database on every call.
  IF _uid IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  _org := platform_private.h15_actor_organization();
  IF _org IS NULL THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF NOT (platform_private.has_role(_uid, 'administrador'::public.app_role)
       OR platform_private.has_role(_uid, 'gestor'::public.app_role)
       OR platform_private.has_role(_uid, 'financeiro'::public.app_role)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF _filters IS NULL OR jsonb_typeof(_filters) <> 'object' THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;
  FOR _key IN SELECT jsonb_object_keys(_filters) LOOP
    IF _key NOT IN ('from', 'to', 'status', 'customer_id') THEN
      RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(_filters->'from') IS DISTINCT FROM 'string'
     OR jsonb_typeof(_filters->'to') IS DISTINCT FROM 'string'
     OR (_filters ? 'status' AND jsonb_typeof(_filters->'status') NOT IN ('string', 'null'))
     OR (_filters ? 'customer_id' AND jsonb_typeof(_filters->'customer_id') NOT IN ('string', 'null'))
     OR (_filters->>'from') !~ '^\d{4}-\d{2}-\d{2}$'
     OR (_filters->>'to') !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;
  BEGIN
    _from := (_filters->>'from')::date;
    _to := (_filters->>'to')::date;
    _customer := NULLIF(_filters->>'customer_id', '')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END;
  _status := NULLIF(_filters->>'status', '');
  IF _to < _from OR (_status IS NOT NULL AND _status NOT IN ('OPEN', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELED')) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE = '22023';
  END IF;
  -- A customer from another tenant is denied, never silently empty.
  IF _customer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes c WHERE c.id = _customer AND c.organization_id = _org
  ) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id, ar.id, COALESCE(c.nome, c.razao_social, '—'), ar.description, fc.name,
         i.due_date, i.original_amount,
         COALESCE(i.received_amount,0),
         i.original_amount - COALESCE(i.received_amount,0) - COALESCE(i.discount_amount,0),
         i.status
  FROM public.accounts_receivable_installments i
  JOIN public.accounts_receivable ar ON ar.id = i.receivable_id
  JOIN public.clientes c ON c.id = ar.customer_id
  LEFT JOIN public.financial_categories fc ON fc.id = ar.category_id
  WHERE ar.organization_id = _org
    AND i.organization_id = _org
    AND c.organization_id = _org
    AND i.due_date >= _from
    AND i.due_date <= _to
    AND (_status IS NULL OR i.status = _status)
    AND (_customer IS NULL OR ar.customer_id = _customer)
    AND ar.status <> 'CANCELED'
  ORDER BY i.due_date, i.id;
END;$function$
