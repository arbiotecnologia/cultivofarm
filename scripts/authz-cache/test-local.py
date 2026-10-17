#!/usr/bin/env python3
# Harness PostgreSQL descartável para o candidato v2 get_my_authz_fingerprint.
# PostgreSQL isolado (initdb local); NÃO hosted. Cobre: self-only, negação sem
# sessão, elegibilidade EXTERNA (role externa + vínculo vigente coerente com
# tenant), retorno opaco sem IDs, mudança de fingerprint por revogação/vigência
# temporal/roles/updated_at (ABA)/partner, ACL do núcleo privado fechada.
import subprocess, tempfile, os
from pathlib import Path

tmp = Path(tempfile.mkdtemp(prefix="authzcache-v2-", dir="/tmp")); tmp.chmod(0o777)
prefix = ["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
base = ["psql","-X","-h",str(tmp),"-p","55499","-U","postgres","-v","ON_ERROR_STOP=1","-qAt"]

checks = 0
def psql(sql, user=None):
    cmd = base + (["-U", user] if user else []) + ["-d", "postgres"]
    return subprocess.run(cmd, input=sql, text=True, capture_output=True)

def run(sql, user=None):
    r = psql(sql, user)
    assert r.returncode == 0, f"{sql[:120]} -> {r.stderr}"
    return r.stdout.strip()

try:
    subprocess.run(prefix+["initdb","-D",str(tmp/"data"),"-A","trust","-U","postgres"],check=True,capture_output=True)
    subprocess.run(prefix+["pg_ctl","-D",str(tmp/"data"),"-l",str(tmp/"log"),"-o",f'-k {tmp} -h "" -p 55499',"start"],check=True,capture_output=True)
    run("CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE service_role NOLOGIN;")
    run("CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;")
    run("""CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true, senha_provisoria boolean NOT NULL DEFAULT false, organization_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
           CREATE TABLE public.user_roles(user_id uuid, role text, UNIQUE(user_id, role));
           CREATE TABLE public.clientes(id uuid PRIMARY KEY, status_cliente text NOT NULL DEFAULT 'ativo', organization_id uuid);
           CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true, commercial_owner_organization_id uuid);
           CREATE TABLE public.user_clientes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, cliente_id uuid, is_active boolean NOT NULL DEFAULT true, revoked_at timestamptz, valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz, principal boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
           CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, user_id uuid, papel text, created_at timestamptz NOT NULL DEFAULT now());""")

    cand = open(os.path.join(os.path.dirname(__file__), "candidate.sql.review")).read()
    cand = "\n".join(l for l in cand.splitlines() if not l.strip().startswith("--"))
    run(cand)

    U1, U2 = "00000000-0000-4000-8000-00000000c001", "00000000-0000-4000-8000-00000000c002"
    C1 = "00000000-0000-4000-8000-0000000000c1"
    ORG, ORG2 = "00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"
    P1 = "00000000-0000-4000-8000-0000000000d1"

    def as_user(u, sql):
        return run(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{u}'; {sql}; COMMIT;")
    def fp_of(u):
        return as_user(u, "SELECT (public.get_my_authz_fingerprint())->>'fingerprint';")
    def body(u):
        return as_user(u, "SELECT public.get_my_authz_fingerprint()::text;")

    # 1. sem sessão: negado
    r = psql("SELECT public.get_my_authz_fingerprint();")
    assert r.returncode != 0 and "auth_required" in r.stderr, r.stderr; checks += 1

    # 2. ACL invoker: anon não executa
    run("CREATE ROLE test_anon LOGIN; GRANT anon TO test_anon;")
    r = psql("SELECT public.get_my_authz_fingerprint();", user="test_anon")
    assert r.returncode != 0 and "permission denied" in r.stderr, r.stderr; checks += 1

    # 3. ACL núcleo privado: authenticated NÃO executa o core diretamente
    run("CREATE ROLE test_auth LOGIN; GRANT authenticated TO test_auth;")
    r = psql(f"SELECT public._authz_fingerprint_core('{U1}');", user="test_auth")
    assert r.returncode != 0 and "permission denied" in r.stderr, r.stderr; checks += 1

    # 4. perfil inexistente → eligible false
    assert '"eligible": false' in body(U1); checks += 1

    # 5. perfil ativo sem role externa e sem vínculo → ineligible
    run(f"INSERT INTO public.profiles(user_id, organization_id) VALUES ('{U1}','{ORG}');")
    assert '"eligible": false' in body(U1); checks += 1

    # 6. role INTERNA apenas (administrador) → ineligible mesmo com vínculo
    run(f"INSERT INTO public.clientes(id, organization_id) VALUES ('{C1}','{ORG}');")
    run(f"INSERT INTO public.user_clientes(user_id, cliente_id, principal) VALUES ('{U1}','{C1}',true);")
    run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','administrador');")
    assert '"eligible": false' in body(U1); checks += 1

    # 7. role externa + vínculo vigente coerente → eligible; retorno opaco sem IDs
    run(f"INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','cliente_produtor');")
    b = body(U1)
    assert '"eligible": true' in b and C1 not in b and ORG not in b and "cliente_produtor" not in b, b; checks += 1
    fp1 = fp_of(U1)
    assert fp1 and fp1 != ""; checks += 1

    # 8. revogação → ineligible (sem outro vínculo) e fingerprint some
    run(f"UPDATE public.user_clientes SET revoked_at=now() WHERE user_id='{U1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 9. reativação restaura o MESMO estado → fingerprint igual (state-based;
    # ABA é capturado por profiles.updated_at, provado no caso 14)
    run(f"UPDATE public.user_clientes SET revoked_at=NULL WHERE user_id='{U1}';")
    fp2 = fp_of(U1)
    assert fp2 == fp1; checks += 1

    # 10. vigência temporal: valid_until no passado → ineligible
    run(f"UPDATE public.user_clientes SET valid_until=now()-interval '1 minute' WHERE user_id='{U1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 11. futuro: valid_from futuro → ineligible
    run(f"UPDATE public.user_clientes SET valid_until=NULL, valid_from=now()+interval '1 day' WHERE user_id='{U1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 12. cliente inativo → ineligible
    run(f"UPDATE public.user_clientes SET valid_from=now()-interval '1 hour' WHERE user_id='{U1}';")
    run(f"UPDATE public.clientes SET status_cliente='inativo' WHERE id='{C1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 13. cliente de OUTRO tenant → ineligible
    run(f"UPDATE public.clientes SET status_cliente='ativo', organization_id='{ORG2}' WHERE id='{C1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 14. volta tenant correto → eligible; ABA: updated_at muda fingerprint
    run(f"UPDATE public.clientes SET organization_id='{ORG}' WHERE id='{C1}';")
    fp3 = fp_of(U1)
    run(f"UPDATE public.profiles SET updated_at=now()+interval '1 second' WHERE user_id='{U1}';")
    assert fp_of(U1) != fp3; checks += 1

    # 15. senha_provisoria → ineligible
    run(f"UPDATE public.profiles SET senha_provisoria=true WHERE user_id='{U1}';")
    assert '"eligible": false' in body(U1); checks += 1
    run(f"UPDATE public.profiles SET senha_provisoria=false WHERE user_id='{U1}';")

    # 16. partner inativo não conta como vínculo válido
    run(f"DELETE FROM public.user_clientes WHERE user_id='{U1}';")
    run(f"INSERT INTO public.partner_accounts(id, ativo, commercial_owner_organization_id) VALUES ('{P1}', false, '{ORG}');")
    run(f"INSERT INTO public.partner_users(user_id, partner_id, papel) VALUES ('{U1}','{P1}','gestor');")
    run(f"DELETE FROM public.user_roles WHERE user_id='{U1}'; INSERT INTO public.user_roles(user_id, role) VALUES ('{U1}','parceiro_b2b');")
    assert '"eligible": false' in body(U1); checks += 1

    # 17. partner ativo de outro tenant → ineligible
    run(f"UPDATE public.partner_accounts SET ativo=true, commercial_owner_organization_id='{ORG2}' WHERE id='{P1}';")
    assert '"eligible": false' in body(U1); checks += 1

    # 18. partner ativo do tenant → eligible; mudança de papel muda fingerprint
    run(f"UPDATE public.partner_accounts SET commercial_owner_organization_id='{ORG}' WHERE id='{P1}';")
    fp4 = fp_of(U1)
    assert fp4 and '"eligible": true' in body(U1); checks += 1
    run(f"UPDATE public.partner_users SET papel='tecnico' WHERE user_id='{U1}';")
    assert fp_of(U1) != fp4; checks += 1

    # 19. self-only: outra identidade elegível não vê dados de U1 (retorno opaco)
    run(f"INSERT INTO public.profiles(user_id, organization_id) VALUES ('{U2}','{ORG}');")
    b2 = body(U2)
    assert '"eligible": false' in b2 and C1 not in b2 and P1 not in b2; checks += 1

    # 20. determinismo: duas chamadas consecutivas idênticas
    assert fp_of(U1) == fp_of(U1); checks += 1

    print(f"{checks} checks PASS — PostgreSQL isolado; NÃO hosted")
    print("UNVERIFIED: ensaio hosted BEGIN/ROLLBACK, policies completas, dados live")
finally:
    subprocess.run(prefix+["pg_ctl", "-D", str(tmp/"data"), "stop", "-m", "fast"], capture_output=True)
