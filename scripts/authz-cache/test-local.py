#!/usr/bin/env python3
# Harness PostgreSQL descartável para o candidato get_my_authz_fingerprint.
# PostgreSQL isolado (initdb local); NÃO hosted. Cobre: self-only (sem
# parâmetro), negação sem sessão, elegibilidade, mudança de fingerprint por
# revogação/vigência temporal/roles/updated_at (ABA) e ACL fechada.
import subprocess, tempfile, os, time, hashlib, sys
from pathlib import Path

tmp = Path(tempfile.mkdtemp(prefix="authzcache-", dir="/tmp")); tmp.chmod(0o777)
prefix = ["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
base = ["psql","-X","-h",str(tmp),"-p","55499","-U","postgres","-v","ON_ERROR_STOP=1","-qAt"]

checks = 0
def psql(sql, user=None):
    cmd = base + (["-U", user] if user else [])
    return subprocess.run(cmd, input=sql, text=True, capture_output=True)

def run(sql, user=None):
    r = psql(sql, user)
    assert r.returncode == 0, f"{sql[:120]} -> {r.stderr}"
    return r.stdout.strip()

def scalar(sql, user=None):
    return run(sql, user)

try:
    subprocess.run(prefix+["initdb","-D",str(tmp/"data"),"-A","trust","-U","postgres"],check=True,capture_output=True)
    subprocess.run(prefix+["pg_ctl","-D",str(tmp/"data"),"-l",str(tmp/"log"),"-o",f'-k {tmp} -h "" -p 55499',"start"],check=True,capture_output=True)
    run("CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;")
    run("CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;")
    run("""CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now());
           CREATE TABLE public.user_roles(user_id uuid, role text, UNIQUE(user_id, role));
           CREATE TABLE public.user_clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, cliente_id uuid, is_active boolean NOT NULL DEFAULT true, revoked_at timestamptz, valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz, principal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
           CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, user_id uuid, papel text, created_at timestamptz NOT NULL DEFAULT now());""")
    run("""CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(p_user_id uuid) RETURNS uuid[] LANGUAGE sql STABLE AS $$
             SELECT coalesce(array_agg(cliente_id), '{}') FROM public.user_clientes
              WHERE user_id=p_user_id AND is_active AND revoked_at IS NULL
                AND valid_from <= now() AND (valid_until IS NULL OR valid_until >= now()) $$;""")

    cand = open(os.path.join(os.path.dirname(__file__), "candidate.sql.review")).read()
    cand = "\n".join(l for l in cand.splitlines() if not l.strip().startswith("--"))
    run(cand)

    U1, U2 = "00000000-0000-4000-8000-00000000c001", "00000000-0000-4000-8000-00000000c002"
    C1, C2 = "00000000-0000-4000-8000-0000000000c1", "00000000-0000-4000-8000-0000000000c2"

    # 1. sem sessão: negado
    r = psql("SELECT public.get_my_authz_fingerprint();")
    assert r.returncode != 0 and "42501" in r.stderr, r.stderr; checks += 1

    # 2. ACL: anon não executa
    run("CREATE ROLE test_anon LOGIN; GRANT anon TO test_anon;")
    r = psql("SELECT public.get_my_authz_fingerprint();", user="test_anon")
    assert r.returncode != 0 and "permission denied" in r.stderr, r.stderr; checks += 1

    run("CREATE ROLE test_auth LOGIN; GRANT authenticated TO test_auth;")
    as_u1 = f"BEGIN; SET LOCAL ROLE authenticated; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '{U1}'::uuid $$;"

    # 3. perfil inexistente → eligible false
    r = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert '"eligible": false' in r, r; checks += 1

    # 4. perfil ativo sem vínculos → eligible true, fingerprint estável
    run(f"INSERT INTO public.profiles(user_id) VALUES ('{U1}');")
    r1 = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert '"eligible": true' in r1 and '"cliente_ids": []' in r1, r1; checks += 1
    f1 = scalar(f"SELECT (public.get_my_authz_fingerprint())->>'fingerprint'") if False else None
    fp1 = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")

    # 5. adicionar vínculo vigente muda fingerprint e inclui cliente
    run(f"INSERT INTO public.user_clientes(user_id, cliente_id, principal) VALUES ('{U1}','{C1}',true);")
    r2 = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    fp2 = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert fp2 != fp1 and C1 in r2, (fp1, fp2, r2); checks += 1

    # 6. revogação muda fingerprint e remove cliente da elegibilidade
    run(f"UPDATE public.user_clientes SET revoked_at=now() WHERE user_id='{U1}';")
    r3 = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    fp3 = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert fp3 != fp2 and '"cliente_ids": []' in r3, (r3,); checks += 1

    # 7. vigência temporal: valid_until no passado remove da elegibilidade e muda hash
    run(f"UPDATE public.user_clientes SET revoked_at=NULL, valid_until=now()-interval '1 minute' WHERE user_id='{U1}';")
    r4 = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert '"cliente_ids": []' in r4 and run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;") != fp3; checks += 1

    # 8. futuro: valid_from futuro não elegível
    run(f"UPDATE public.user_clientes SET valid_until=NULL, valid_from=now()+interval '1 day' WHERE user_id='{U1}';")
    r5 = run(f"{as_u1} SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert '"cliente_ids": []' in r5; checks += 1

    # 9. role adicionada muda fingerprint
    run(f"UPDATE public.user_clientes SET valid_from=now()-interval '1 hour' WHERE user_id='{U1}';")
    fp9a = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','cliente_produtor');")
    fp9b = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert fp9a != fp9b; checks += 1

    # 10. ABA: updated_at monotônico muda fingerprint mesmo sem mudar vínculos
    run(f"UPDATE public.profiles SET updated_at=now()+interval '1 second' WHERE user_id='{U1}';")
    fp10 = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert fp10 != fp9b; checks += 1

    # 11. self-only: outra identidade não vê dados de U1
    run(f"INSERT INTO public.profiles(user_id) VALUES ('{U2}');")
    r11 = run(f"BEGIN; SET LOCAL ROLE authenticated; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '{U2}'::uuid $$; SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert C1 not in r11 and '"cliente_ids": []' in r11, r11; checks += 1

    # 12. perfil inativo → eligible false
    run(f"UPDATE public.profiles SET ativo=false WHERE user_id='{U2}';")
    r12 = run(f"BEGIN; SET LOCAL ROLE authenticated; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT '{U2}'::uuid $$; SELECT public.get_my_authz_fingerprint()::text; COMMIT;")
    assert '"eligible": false' in r12; checks += 1

    # 13. determinismo: duas chamadas consecutivas idênticas
    a = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    b = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert a == b; checks += 1

    # 14. vínculo partner entra no fingerprint
    run(f"INSERT INTO public.partner_users(user_id, partner_id, papel) VALUES ('{U1}','00000000-0000-4000-8000-0000000000d1','gestor');")
    fp14 = run(f"{as_u1} SELECT (public.get_my_authz_fingerprint())->>'fingerprint'; COMMIT;")
    assert fp14 != a; checks += 1

    print(f"{checks} checks PASS — PostgreSQL isolado; NÃO hosted")
    print("UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, policies completas, resolver canônico live integral")
finally:
    subprocess.run(prefix+["pg_ctl", "-D", str(tmp/"data"), "stop", "-m", "fast"], capture_output=True)
