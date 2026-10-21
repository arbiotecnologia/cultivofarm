# Harness v2 — PostgreSQL local descartável, dados 100% sintéticos. NÃO equivale a JWT/RLS live.
# v2: lock consistente (duas transações concorrentes), replay antes da revalidação mutante,
# guard de baseline com md5/ACL/owner exatos e RPC de leitura para leitores autorizados.
from pathlib import Path
import os, subprocess, tempfile, select, time

HERE = Path(__file__).resolve().parent
root = Path(tempfile.mkdtemp(prefix='labels-pg-', dir='/tmp')); root.chmod(0o777)
prefix = ['setpriv', '--reuid=1000', '--regid=1000', '--clear-groups'] if os.getuid() == 0 else []
base = ['psql', '-X', '-h', str(root), '-p', '55498', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1']
checks = []
active_actor = None

def sql(s, deny=None):
    r = subprocess.run(base, input=(f"SET test.actor='{active_actor}';\n" if active_actor else "") + s,
                       text=True, capture_output=True)
    if deny:
        assert r.returncode != 0 and deny in r.stderr, (deny, r.stderr)
    else:
        assert r.returncode == 0, r.stderr
    return r.stdout.strip()

def check(name, s, want):
    actual = sql(s)
    assert actual == want, (name, actual, want)
    checks.append(name)

def uid(n): return f'00000000-0000-4000-8000-{n:012d}'

def actor(n):
    global active_actor
    active_actor = uid(n)

class Sess:
    """Sessão psql interativa para testes de concorrência (duas transações reais).
    stdbuf força saída line-buffered; stderr é mesclado ao stdout para capturar ERRORs.
    Leitura binária via os.read: select+readline em TextIOWrapper perde dados no buffer."""
    def __init__(self, actor_uid):
        self.p = subprocess.Popen(['stdbuf', '-oL', '-eL'] + base[:-2], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=0)
        self.out = ''
        self.buf = b''
        self.n = 0
        self.p.stdin.write(f"SET test.actor='{actor_uid}';\n".encode()); self.p.stdin.flush()
    def send(self, s):
        self.n += 1
        m = f'MARK{self.n}'
        self.p.stdin.write((s.rstrip().rstrip(';') + f";\nSELECT '{m}';\n").encode()); self.p.stdin.flush()
        return m
    def wait(self, m, timeout=10):
        tgt = m.encode()
        end = time.time() + timeout
        while time.time() < end:
            if tgt in self.buf:
                self.out += self.buf.decode(errors='replace'); self.buf = b''
                return True
            r, _, _ = select.select([self.p.stdout], [], [], 0.2)
            if r:
                chunk = os.read(self.p.stdout.fileno(), 4096)
                if not chunk:
                    self.out += self.buf.decode(errors='replace'); self.buf = b''
                    return False
                self.buf += chunk
        self.out += self.buf.decode(errors='replace'); self.buf = b''
        return False  # bloqueado (sem resposta dentro do timeout)
    def close(self):
        self.p.stdin.write(b'ROLLBACK;\n\\q\n'); self.p.stdin.flush()
        self.p.wait(timeout=10)

# Esquema SINTÉTICO mínimo: helpers de autorização são simulados, NÃO JWT/RLS LIVE.
# Inclui o core ORIGINAL de classificação (lista literal) para provar a troca pela fonte canônica.
SCHEMA = """
CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
CREATE TYPE public.app_role AS ENUM('administrador','superadmin','parceiro_b2b');
CREATE TABLE public.profiles(user_id uuid, ativo boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE SET search_path TO public AS $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public AS $$SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r)$$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path TO public AS $$SELECT public.has_role(u,'superadmin')$$;
CREATE FUNCTION platform_private.catalog_metadata_require_actor() RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE v uuid := auth.uid(); BEGIN
  IF v IS NULL OR NOT (public.has_role(v,'superadmin') AND public.is_platform_superadmin(v)
     AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=v AND p.ativo)) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_actor_forbidden'; END IF;
  RETURN v; END $$;
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, familia_catalogo text, classe_catalogo text, updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.produtos ADD CONSTRAINT produtos_familia_catalogo_check
  CHECK (familia_catalogo IS NULL OR familia_catalogo IN ('biologico','quimico','fertilizante_adubo'));
ALTER TABLE public.produtos ADD CONSTRAINT produtos_classe_catalogo_coerente_check CHECK (
  classe_catalogo IS NULL
  OR (familia_catalogo IS NOT NULL AND (
       (familia_catalogo = 'biologico' AND classe_catalogo IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
    OR (familia_catalogo = 'quimico'   AND classe_catalogo IN ('fungicida','inseticida','herbicida'))) IS TRUE));
CREATE FUNCTION public.produtos_touch() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at := clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER produtos_touch BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.produtos_touch();
CREATE TABLE public.catalogo_volumes(id uuid, produto_id uuid);
CREATE TABLE public.catalog_platform_admin_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor uuid, operation text,
  reason text, idempotency_key uuid, request jsonb, receipt jsonb, old_row jsonb, new_row jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE public.catalog_platform_admin_audit ADD CONSTRAINT catalog_platform_admin_audit_operation_check
  CHECK (operation IN ('wipe_global_products','update_global_product_metadata','create_global_product','set_global_product_status',
    'create_global_microorganism','update_global_microorganism','set_global_microorganism_status',
    'create_global_culture','update_global_culture','set_global_culture_status',
    'create_global_volume','update_global_volume','set_global_volume_status',
    'set_global_b2b_enabled','set_global_product_family'));
CREATE FUNCTION platform_private.catalog_entity_replay(p_actor uuid, p_operation text, p_request jsonb, p_reason text, p_key uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r jsonb; BEGIN
  SELECT a.receipt INTO r FROM public.catalog_platform_admin_audit a WHERE a.operation=p_operation AND a.idempotency_key=p_key;
  IF r IS NOT NULL THEN RETURN jsonb_set(r,'{idempotent}','true'); END IF;
  RETURN NULL; END $$;
CREATE FUNCTION platform_private.catalog_entity_audit(p_actor uuid, p_operation text, p_reason text, p_key uuid,
  p_request jsonb, p_receipt jsonb, p_old jsonb, p_new jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN INSERT INTO public.catalog_platform_admin_audit(actor,operation,reason,idempotency_key,request,receipt,old_row,new_row)
  VALUES (p_actor,p_operation,p_reason,p_key,p_request,p_receipt,p_old,p_new); END $$;
-- Core ORIGINAL (lista literal), substituído pela candidata via CREATE OR REPLACE.
CREATE FUNCTION platform_private.set_global_product_family_core(p_id uuid, p_expected_updated_at timestamptz,
  p_familia text, p_classe text, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_req jsonb; v_replay jsonb; v_receipt jsonb; v_audit uuid := gen_random_uuid();
  v_op public.produtos%ROWTYPE; v_np public.produtos%ROWTYPE; v_old jsonb; v_new jsonb;
  v_vols_before jsonb; v_vols_after jsonb; v_classe text := NULLIF(pg_catalog.btrim(COALESCE(p_classe,'')), '');
BEGIN
  v_actor := platform_private.catalog_metadata_require_actor();
  IF p_id IS NULL OR p_expected_updated_at IS NULL OR NOT pg_catalog.isfinite(p_expected_updated_at) OR p_idempotency_key IS NULL
     OR p_familia IS NULL OR p_familia NOT IN ('biologico','quimico','fertilizante_adubo')
     OR NOT (v_classe IS NULL
       OR (p_familia='biologico' AND v_classe IN ('biofungicida','bioinseticida','inoculante','solubilizador'))
        OR (p_familia='quimico'   AND v_classe IN ('fungicida','inseticida','herbicida'))) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_invalid';
  END IF;
  v_req := pg_catalog.jsonb_build_object('id',p_id,'expected_updated_at',p_expected_updated_at,
    'familia_catalogo',p_familia,'classe_catalogo',v_classe,'reason',pg_catalog.btrim(COALESCE(p_reason,'')));
  v_replay := platform_private.catalog_entity_replay(v_actor,'set_global_product_family',v_req,p_reason,p_idempotency_key);
  IF v_replay IS NOT NULL THEN RETURN v_replay; END IF;
  SELECT * INTO v_op FROM public.produtos WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='catalog_family_unavailable'; END IF;
  IF v_op.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_conflict'; END IF;
  IF v_op.familia_catalogo IS NOT DISTINCT FROM p_familia AND v_op.classe_catalogo IS NOT DISTINCT FROM v_classe THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='catalog_family_no_change'; END IF;
  v_old := pg_catalog.to_jsonb(v_op);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_before
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;
  UPDATE public.produtos SET familia_catalogo=p_familia, classe_catalogo=v_classe
   WHERE id=p_id AND updated_at=p_expected_updated_at RETURNING * INTO v_np;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;
  v_new := pg_catalog.to_jsonb(v_np);
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cv) ORDER BY cv.id),'[]'::jsonb) INTO v_vols_after
    FROM public.catalogo_volumes cv WHERE cv.produto_id=p_id;
  IF v_np.familia_catalogo IS DISTINCT FROM p_familia OR v_np.classe_catalogo IS DISTINCT FROM v_classe
     OR v_np.updated_at IS NULL OR v_np.updated_at <= v_op.updated_at
     OR (v_old - ARRAY['familia_catalogo','classe_catalogo','updated_at']) IS DISTINCT FROM (v_new - ARRAY['familia_catalogo','classe_catalogo','updated_at'])
     OR v_vols_before IS DISTINCT FROM v_vols_after THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='catalog_family_confirmation_failed'; END IF;
  v_receipt := pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,
    'updated_at',v_np.updated_at,'idempotency_key',p_idempotency_key,'audit_id',v_audit,'idempotent',false);
  PERFORM platform_private.catalog_entity_audit(v_actor,'set_global_product_family',p_reason,p_idempotency_key,v_req,v_receipt,
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',v_op.familia_catalogo,'classe_catalogo',v_op.classe_catalogo,'updated_at',v_op.updated_at),
    pg_catalog.jsonb_build_object('id',p_id,'familia_catalogo',p_familia,'classe_catalogo',v_classe,'updated_at',v_np.updated_at));
  RETURN v_receipt;
END;
$$;
-- ACL materializada igual ao baseline live (owner postgres + authenticated).
REVOKE ALL ON FUNCTION platform_private.set_global_product_family_core(uuid,timestamptz,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_private.set_global_product_family_core(uuid,timestamptz,text,text,text,uuid) TO authenticated;
CREATE FUNCTION public.platform_set_global_product_family(p_id uuid, p_expected_updated_at timestamptz,
  p_familia text, p_classe text, p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS
$$ SELECT platform_private.set_global_product_family_core(p_id,p_expected_updated_at,p_familia,p_classe,p_reason,p_idempotency_key) $$;
"""

try:
    r = subprocess.run(prefix + ['initdb', '-D', str(root/'data'), '-A', 'trust', '-U', 'postgres'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    r = subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-l', str(root/'log'), '-o', f'-k {root} -p 55498 -h ""', 'start'], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    sql(SCHEMA)
    sql(f"INSERT INTO public.profiles VALUES('{uid(1)}',true),('{uid(2)}',true),('{uid(3)}',false);"
        f"INSERT INTO public.user_roles VALUES('{uid(1)}','superadmin');")
    sql(f"INSERT INTO public.produtos(id,nome) VALUES('{uid(50)}','P50'),('{uid(51)}','P51'),('{uid(60)}','P60'),('{uid(61)}','P61');")

    # ACL/owner do baseline sintético devem reproduzir o baseline live revisado.
    check('baseline acl/owner do core reproduzem live',
          "SELECT p.proacl::text||'|'||r.rolname FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner"
          " WHERE p.oid='platform_private.set_global_product_family_core(uuid,timestamp with time zone,text,text,text,uuid)'::regprocedure",
          '{postgres=X/postgres,authenticated=X/postgres}|postgres')

    candidate = (HERE/'candidate.sql.review').read_text()

    # Guard de drift: candidate com md5 LIVE num ambiente cujo baseline difere deve abortar.
    sql(candidate, deny='catalog_labels_core_baseline_drift')
    checks.append('guard aborta com md5 do core divergente')

    # Injeta os md5 do baseline SINTÉTICO (o artifact mantém os md5 LIVE byte-finais).
    core_md5 = sql("SELECT md5(pg_get_functiondef('platform_private.set_global_product_family_core(uuid,timestamp with time zone,text,text,text,uuid)'::regprocedure))")
    check_md5 = sql("SELECT md5(pg_get_constraintdef(oid)) FROM pg_constraint WHERE conrelid='public.produtos'::regclass AND conname='produtos_classe_catalogo_coerente_check'")
    cand = candidate.replace('8bd3ce69c5bd55b678246acb9d264548', core_md5).replace('0ae66545cef182ce716ee3958ef634b6', check_md5)
    assert cand != candidate
    sql(cand); checks.append('candidate applies cleanly')

    actor(1)
    check('seed count is 7', "SELECT count(*) FROM public.catalog_family_labels", '7')
    check('seed all active', "SELECT bool_and(ativo) FROM public.catalog_family_labels", 't')
    check('fertilizer starts without labels', "SELECT count(*) FROM public.catalog_family_labels WHERE familia='fertilizante_adubo'", '0')
    check('superadmin lists 4 biologico labels', "SELECT jsonb_array_length(public.platform_list_catalog_labels('biologico'))", '4')
    sql("SELECT public.platform_list_catalog_labels('semente')", 'catalog_label_family_invalid'); checks.append('list invalid family denied')
    actor(2)
    sql("SELECT public.platform_list_catalog_labels('biologico')", 'catalog_actor_forbidden'); checks.append('non-superadmin list denied')
    sql(f"SELECT public.platform_create_catalog_label('quimico','x1','X1','motivo valido dez','{uid(900)}')", 'catalog_actor_forbidden'); checks.append('non-superadmin create denied')
    actor(1)
    check('create fertilizer label', f"SELECT (public.platform_create_catalog_label('fertilizante_adubo','npk','NPK','motivo valido dez','{uid(901)}'))->>'ativo'", 'true')
    sql(f"SELECT public.platform_create_catalog_label('fertilizante_adubo','npk','NPK','motivo valido dez','{uid(902)}')", 'duplicate key'); checks.append('duplicate label denied (SQLSTATE 23505 via PostgREST)')
    check('replay returns idempotent', f"SELECT (public.platform_create_catalog_label('fertilizante_adubo','npk','NPK','motivo valido dez','{uid(901)}'))->>'idempotent'", 'true')
    sql(f"SELECT public.platform_create_catalog_label('quimico','NPK!','X','motivo valido dez','{uid(903)}')", 'catalog_label_invalid'); checks.append('invalid rotulo format denied')
    sql(f"SELECT public.platform_create_catalog_label('semente','abc','Abc','motivo valido dez','{uid(904)}')", 'catalog_label_invalid'); checks.append('invalid family denied')
    v50 = sql(f"SELECT updated_at FROM public.produtos WHERE id='{uid(50)}'")
    check('assign active seeded label', f"SELECT (public.platform_set_global_product_family('{uid(50)}','{v50}','quimico','herbicida','motivo valido dez','{uid(910)}'))->>'classe_catalogo'", 'herbicida')
    v50b = sql(f"SELECT updated_at FROM public.produtos WHERE id='{uid(50)}'")
    check('assign new fertilizer label', f"SELECT (public.platform_set_global_product_family('{uid(50)}','{v50b}','fertilizante_adubo','npk','motivo valido dez','{uid(911)}'))->>'familia_catalogo'", 'fertilizante_adubo')
    lid = sql("SELECT id FROM public.catalog_family_labels WHERE familia='quimico' AND rotulo='herbicida'")
    lv = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{lid}'")
    check('inactivate label', f"SELECT (public.platform_set_catalog_label_active('{lid}','{lv}',false,'motivo valido dez','{uid(912)}'))->>'ativo'", 'false')
    sql(f"SELECT public.platform_set_catalog_label_active('{lid}','{lv}',false,'motivo valido dez','{uid(913)}')", 'catalog_label_conflict'); checks.append('stale CAS denied')
    lv2 = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{lid}'")
    sql(f"SELECT public.platform_set_catalog_label_active('{lid}','{lv2}',false,'motivo valido dez','{uid(914)}')", 'catalog_label_no_change'); checks.append('no-change denied')
    v51 = sql(f"SELECT updated_at FROM public.produtos WHERE id='{uid(51)}'")
    sql(f"SELECT public.platform_set_global_product_family('{uid(51)}','{v51}','quimico','herbicida','motivo valido dez','{uid(915)}')", 'catalog_family_invalid'); checks.append('new assignment of inactive label denied')
    # Revisão v2: retry legítimo (mesma chave/fingerprint da atribuição 910) NÃO pode ser
    # rejeitado pela inativação posterior do rótulo — o replay vem antes da revalidação.
    check('replay legitimo apos inativacao retorna recibo',
          f"SELECT (public.platform_set_global_product_family('{uid(50)}','{v50}','quimico','herbicida','motivo valido dez','{uid(910)}'))->>'idempotent'", 'true')
    sql(f"UPDATE public.produtos SET nome='renomeado' WHERE id='{uid(50)}'"); checks.append('legacy assignment preserved on unrelated update')
    sql(f"UPDATE public.produtos SET classe_catalogo='herbicida' WHERE id='{uid(50)}'", 'catalog_label_not_active'); checks.append('trigger blocks reassignment to inactive label')
    sql(f"UPDATE public.produtos SET classe_catalogo='inventado' WHERE id='{uid(50)}'", 'catalog_label_not_active'); checks.append('trigger blocks unknown label')
    lv3 = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{lid}'")
    check('rename keeps key', f"SELECT (public.platform_update_catalog_label('{lid}','{lv3}','Herbicida seletivo','motivo valido dez','{uid(916)}'))->>'rotulo'", 'herbicida')
    check('rename bumped version', f"SELECT updated_at > '{lv3}'::timestamptz FROM public.catalog_family_labels WHERE id='{lid}'", 't')

    # RPC de leitura para leitores autorizados (não admin): só rótulos ATIVOS, sem id/versão.
    check('read omite rotulo inativo',
          "SELECT count(*) FROM jsonb_array_elements(public.catalog_family_labels_read('quimico')) e WHERE e->>'rotulo'='herbicida'", '0')
    check('read lista rotulo ativo',
          "SELECT count(*) FROM jsonb_array_elements(public.catalog_family_labels_read('quimico')) e WHERE e->>'rotulo'='fungicida'", '1')
    actor(2)
    check('leitor autorizado nao-admin le ativos', "SELECT jsonb_array_length(public.catalog_family_labels_read('biologico'))", '4')
    actor(3)
    sql("SELECT public.catalog_family_labels_read('biologico')", 'catalog_label_read_forbidden'); checks.append('perfil inativo nao le')
    actor(None) if False else None
    active_actor = None
    sql("SELECT public.catalog_family_labels_read('biologico')", 'catalog_label_read_forbidden'); checks.append('anonimo nao le')
    actor(1)

    # Concorrência real (duas transações): atribuição × inativação, nas duas ordens.
    nid = sql("SELECT id FROM public.catalog_family_labels WHERE familia='fertilizante_adubo' AND rotulo='npk'")
    # Caso A: atribuição locka primeiro; inativação espera e conclui depois do commit.
    v60 = sql(f"SELECT updated_at FROM public.produtos WHERE id='{uid(60)}'")
    nv = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{nid}'")
    s1, s2 = Sess(uid(1)), Sess(uid(1))
    m = s1.send('BEGIN;')
    assert s1.wait(m)
    m = s1.send(f"SELECT public.platform_set_global_product_family('{uid(60)}','{v60}','fertilizante_adubo','npk','motivo valido dez','{uid(920)}')")
    assert s1.wait(m)  # chamada concluiu, transação ABERTA segurando FOR KEY SHARE no rótulo
    m = s2.send('BEGIN;')
    assert s2.wait(m)
    m2 = s2.send(f"SELECT public.platform_set_catalog_label_active('{nid}','{nv}',false,'motivo valido dez','{uid(921)}')")
    assert not s2.wait(m2, timeout=3)  # bloqueado no FOR UPDATE do rótulo
    checks.append('inativacao bloqueia atras de atribuicao em transacao aberta')
    m = s1.send('COMMIT;')
    assert s1.wait(m)
    assert s2.wait(m2, timeout=10)  # desbloqueou e inativou
    m = s2.send('COMMIT;')
    assert s2.wait(m)
    s1.close(); s2.close()
    check('atribuicao concorrente valeu', f"SELECT classe_catalogo FROM public.produtos WHERE id='{uid(60)}'", 'npk')
    check('rotulo inativado apos commit da atribuicao', f"SELECT ativo FROM public.catalog_family_labels WHERE id='{nid}'", 'f')

    # Caso B: inativação commita primeiro; atribuição posterior falha.
    nv = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{nid}'")
    sql(f"SELECT public.platform_set_catalog_label_active('{nid}','{nv}',true,'motivo valido dez','{uid(922)}')")  # reativa
    nv = sql(f"SELECT updated_at FROM public.catalog_family_labels WHERE id='{nid}'")
    v61 = sql(f"SELECT updated_at FROM public.produtos WHERE id='{uid(61)}'")
    s1, s2 = Sess(uid(1)), Sess(uid(1))
    m = s2.send('BEGIN;')
    assert s2.wait(m)
    m = s2.send(f"SELECT public.platform_set_catalog_label_active('{nid}','{nv}',false,'motivo valido dez','{uid(923)}')")
    assert s2.wait(m)  # inativou, transação ABERTA segurando FOR UPDATE
    m1 = s1.send(f"SELECT public.platform_set_global_product_family('{uid(61)}','{v61}','fertilizante_adubo','npk','motivo valido dez','{uid(924)}')")
    assert not s1.wait(m1, timeout=3)  # bloqueado no FOR KEY SHARE
    checks.append('atribuicao bloqueia atras de inativacao em transacao aberta')
    m = s2.send('COMMIT;')
    assert s2.wait(m)
    assert s1.wait(m1, timeout=10)  # desbloqueou e falhou
    assert 'catalog_family_invalid' in s1.out, s1.out
    checks.append('atribuicao apos inativacao commitada falha')
    s1.close(); s2.close()
    check('produto sem rotulo apos falha', f"SELECT coalesce(classe_catalogo,'NULL') FROM public.produtos WHERE id='{uid(61)}'", 'NULL')

    sql(cand, 'catalog_labels_already_installed'); checks.append('drift guard blocks reapply')
    sql("SET ROLE authenticated; INSERT INTO public.catalog_family_labels (familia,rotulo,rotulo_exibicao) VALUES ('quimico','direto','Direto')", 'permission denied'); checks.append('direct insert as authenticated denied')
    sql("SET ROLE authenticated; SELECT count(*) FROM public.catalog_family_labels", 'permission denied'); checks.append('direct select as authenticated denied')
    check('audit recorded operations', "SELECT count(*) >= 5 FROM public.catalog_platform_admin_audit WHERE operation IN ('create_catalog_label','update_catalog_label','set_catalog_label_active','set_global_product_family')", 't')
    print(f"PASS {len(checks)}/{len(checks)}")
    for c in checks: print(' -', c)
finally:
    subprocess.run(prefix + ['pg_ctl', '-D', str(root/'data'), '-m', 'immediate', 'stop'], capture_output=True)
