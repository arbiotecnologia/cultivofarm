"""11d. Códigos automáticos POR EMPRESA (produtos/microrganismos).

LIVE (captura de fechamento 02/11): set_codigo_produto/set_codigo_microrganismo chamam public.proximo_codigo(prefixo,
tabela), cujo contador `codigo_sequencias(prefixo)` é GLOBAL e cujo alinhamento lê MAX(código) de TODAS as empresas —
vaza a contagem de outra empresa e acopla sequências entre tenants. Aqui:
- contador privado por (empresa, tabela, prefixo), semeado do maior código existente de CADA empresa;
- gerador privado com lock de linha (FOR UPDATE) e alinhamento só com códigos do próprio dono;
- gatilhos reais (mesmos nomes) passam o dono imutável da linha; dono ausente nega (42501);
- o gerador global vira negação explícita (sem leitor cruzado), com pin md5 do corpo LIVE antes de substituir.
Unicidade final continua garantida pelos índices únicos re-escopados (owner_organization_id, ...).
"""

PINS = [("public.proximo_codigo(text,text)", "e061a6487d6d3d30436d9bd3ca0e2be1"),
        ("public.set_codigo_produto()", "e5ef4aa8489889e7d20e03dc62b455ae"),
        ("public.set_codigo_microrganismo()", "22f33bb511f309ada40f710d017fcdb5")]

SEQ = "platform_private.tenant_codigo_sequencias"
GEN = "platform_private.tenant_proximo_codigo(uuid,text,text)"


def _trigger_fn(name, prefixo_fn, tabela, label):
    return f"""CREATE OR REPLACE FUNCTION public.{name}()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_prefixo text;
BEGIN
  IF NEW.owner_organization_id IS NULL THEN
    RETURN NEW;  -- sem dono não há sequência; RLS (WITH CHECK) / NOT NULL rejeitam a linha — o gerador não autoriza
  END IF;
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    v_prefixo := public.{prefixo_fn}(NEW.tipo::text);
    IF v_prefixo IS NULL THEN
      RAISE EXCEPTION 'Tipo de {label} sem prefixo definido: %', NEW.tipo;
    END IF;
    NEW.codigo := platform_private.tenant_proximo_codigo(NEW.owner_organization_id, v_prefixo, '{tabela}');
  ELSE
    NEW.codigo := btrim(NEW.codigo);
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.{name}() FROM PUBLIC, anon, authenticated;"""


def codigo_sql(w, ledger, lit):
    vals = ",".join(f"({lit(s)},{lit(m)})" for s, m in PINS)
    w(f"""DO $cp$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES {vals}) v(sig, md5) LOOP
    IF to_regprocedure(r.sig) IS NULL OR md5(pg_get_functiondef(to_regprocedure(r.sig))) <> r.md5 THEN
      RAISE EXCEPTION 'fn_drift:%', r.sig;
    END IF;
  END LOOP;
END $cp$;
CREATE TABLE {SEQ}(
  owner_organization_id uuid NOT NULL REFERENCES public.organizations(id),
  tabela text NOT NULL CHECK (tabela IN ('produtos','microrganismos')),
  prefixo text NOT NULL CHECK (prefixo ~ '^[A-Z]{{2,5}}$'),
  proximo_numero integer NOT NULL CHECK (proximo_numero >= 1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_organization_id, tabela, prefixo));
REVOKE ALL ON {SEQ} FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO {SEQ}(owner_organization_id, tabela, prefixo, proximo_numero)
  SELECT owner_organization_id, 'produtos', m[1], max(m[2]::int) + 1
    FROM (SELECT owner_organization_id, regexp_match(codigo, '^([A-Z]{{2,5}})-(\\d+)$') m FROM public.produtos) z
   WHERE m IS NOT NULL GROUP BY 1, 3
  UNION ALL
  SELECT owner_organization_id, 'microrganismos', m[1], max(m[2]::int) + 1
    FROM (SELECT owner_organization_id, regexp_match(codigo, '^([A-Z]{{2,5}})-(\\d+)$') m FROM public.microrganismos) z
   WHERE m IS NOT NULL GROUP BY 1, 3;
CREATE FUNCTION platform_private.tenant_proximo_codigo(p_owner uuid, p_prefixo text, p_tabela text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE v_seed int; v_max int; v_next int;
BEGIN
  IF p_owner IS NULL THEN RAISE EXCEPTION 'tenant_codigo_owner_required' USING ERRCODE = '42501'; END IF;
  IF p_tabela IS NULL OR p_tabela NOT IN ('produtos','microrganismos') THEN RAISE EXCEPTION 'tenant_codigo_tabela' USING ERRCODE = '22023'; END IF;
  IF p_prefixo IS NULL OR p_prefixo !~ '^[A-Z]{{2,5}}$' THEN RAISE EXCEPTION 'tenant_codigo_prefixo' USING ERRCODE = '22023'; END IF;
  INSERT INTO {SEQ}(owner_organization_id, tabela, prefixo, proximo_numero) VALUES (p_owner, p_tabela, p_prefixo, 1)
    ON CONFLICT DO NOTHING;
  SELECT s.proximo_numero INTO v_seed FROM {SEQ} s
   WHERE s.owner_organization_id = p_owner AND s.tabela = p_tabela AND s.prefixo = p_prefixo FOR UPDATE;
  -- alinhamento SOMENTE com os códigos do próprio dono (nunca lê outra empresa)
  IF p_tabela = 'produtos' THEN
    SELECT COALESCE(MAX((regexp_match(x.codigo, '^' || p_prefixo || '-(\\d+)$'))[1]::int), 0) + 1 INTO v_max
      FROM public.produtos x WHERE x.owner_organization_id = p_owner;
  ELSE
    SELECT COALESCE(MAX((regexp_match(x.codigo, '^' || p_prefixo || '-(\\d+)$'))[1]::int), 0) + 1 INTO v_max
      FROM public.microrganismos x WHERE x.owner_organization_id = p_owner;
  END IF;
  v_next := GREATEST(v_seed, v_max);
  UPDATE {SEQ} s SET proximo_numero = v_next + 1, updated_at = now()
   WHERE s.owner_organization_id = p_owner AND s.tabela = p_tabela AND s.prefixo = p_prefixo;
  RETURN p_prefixo || '-' || v_next;
END $f$;
REVOKE ALL ON FUNCTION {GEN} FROM PUBLIC, anon, authenticated, service_role;
{_trigger_fn('set_codigo_produto', 'prefixo_para_produto', 'produtos', 'produto')}
{_trigger_fn('set_codigo_microrganismo', 'prefixo_para_microrganismo', 'microrganismos', 'microrganismo')}
CREATE OR REPLACE FUNCTION public.proximo_codigo(_prefixo text, _tabela text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'tenant_codigo_global_generator_closed' USING ERRCODE = '42501';
END;
$function$;
REVOKE ALL ON FUNCTION public.proximo_codigo(text,text) FROM PUBLIC, anon, authenticated;
INSERT INTO {ledger}(step, detail) VALUES ('tenant_codigo', jsonb_build_object(
  'sequences', (SELECT count(*) FROM {SEQ}), 'global_generator', 'closed', 'pins', {lit(str(len(PINS)))}::int));""")
