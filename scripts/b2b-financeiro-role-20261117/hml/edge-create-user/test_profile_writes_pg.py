#!/usr/bin/env python3
"""Gravações do create-user HML rev.1 (UPDATE profiles + INSERT user_roles como service_role) sob os gatilhos
de profiles/user_roles carregados VERBATIM (md5 = C7 HML). Perfil inicial do Auth simulado (gatilho de auth.users
do HML não capturado). PG descartável; não prova Auth/PostgREST hospedados."""
import os, shutil, subprocess, tempfile, uuid
from pathlib import Path
UE = Path(__file__).resolve().parents[3] / "user-edit-access-email-links-20261117"
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]
tmp = tempfile.mkdtemp(prefix="cu-", dir="/tmp"); os.chmod(tmp, 0o777); data = os.path.join(tmp, "d"); port = "55671"
AS = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.geteuid() == 0 else []
subprocess.run(AS + ["initdb", "-D", data, "-U", "postgres", "--auth=trust"], check=True, capture_output=True)
subprocess.run(AS + ["pg_ctl", "-D", data, "-o", f"-p {port} -k {tmp} -c listen_addresses=''", "-l", tmp + "/log", "-w", "start"], check=True, capture_output=True)
R = []
def ps(sql, ok=True):
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", sql], capture_output=True, text=True)
    if ok and p.returncode: raise RuntimeError(p.stderr)
    return p
def load(f):
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qX", "-f", str(f)], capture_output=True, text=True)
    if p.returncode: raise RuntimeError(p.stderr[-600:])
def chk(n, c, d=""): R.append(c); print(("PASS " if c else "FAIL ") + n, "" if c else d)
SVC = "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SET ROLE service_role; "
PINS = {"guard_profile_senha_provisoria": "e38505f726490b064e61d9aa4e3be5a7", "guard_profile_senha_ticket": "bb9ea2f95f8f151ebd4b97c2a2e747b7",
        "guard_profile_sensitive_fields": "1c2ad8d0ef38ea66866f8b85d3acb109", "h15_profile_organization_guard": "43be4da16aae664a48fa4c73315b4420",
        "guard_profile_tenant_fields": "bd6d513d936f5c5fb0490b5d1d2f9f1d", "enforce_cliente_id_for_produtor": "ecad56badcb2120f7048fad7519f76f4",
        "guard_superadmin_role_assignment": "4a59f48e25096848a79be6de9d959cef", "acquire_gate": "b0dd9a14d5fd799a40df0975baf4c5a6",
        "require_admin": "ec8e7077521cdee212be924bfb400e8a", "advance_stamp": "ce295ff5799d306ad81578047cd9bff5"}
try:
    for f in ("harness-stubs.sql", "captured-prod-user-triggers-20261117.sql"): load(UE / f)
    load(Path(__file__).parent / "live" / "cf_guards_live.sql")  # corpos LIVE (md5 = C7 HML) substituem captura antiga
    for fn, h in PINS.items():
        chk(f"pin_{fn}_igual_C7_HML", h in ps(f"SELECT md5(pg_get_functiondef(oid)) FROM pg_proc WHERE proname='{fn}'").stdout.split())
    ps("GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON public.profiles, public.user_roles TO service_role")  # ACL padrão Supabase
    OA, ADM, NEW, NEW2 = (str(uuid.uuid4()) for _ in range(4))
    ps(f"INSERT INTO public.organizations(id) VALUES ('{OA}')")
    ps(f"SET session_replication_role=replica; INSERT INTO auth.users VALUES ('{ADM}','a@x.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{ADM}','a','a@x.test','{OA}'); INSERT INTO public.user_roles(user_id,role) VALUES ('{ADM}','administrador'); SET session_replication_role=origin")
    for u in (NEW, NEW2):  # perfil criado pelo gatilho de auth.users (simulado), sem organização
        ps(f"INSERT INTO auth.users VALUES ('{u}','{u[:6]}@qa-fin.invalid'); INSERT INTO public.profiles(user_id,nome,email) VALUES ('{u}','QA','{u[:6]}@qa-fin.invalid')")
    p = ps(SVC + f"UPDATE public.profiles SET telefone=NULL,cargo=NULL,cpf_cnpj=NULL,crea=NULL,especialidade=NULL,cliente_id=NULL,organization_id='{OA}' WHERE user_id='{NEW}' RETURNING user_id", ok=False)
    chk("service_atualiza_perfil_org", p.returncode == 0 and NEW in p.stdout, p.stderr[-300:])
    p = ps(SVC + f"INSERT INTO public.user_roles(user_id,role) VALUES ('{NEW}','aplicador')", ok=False); chk("service_insere_papel_interno", p.returncode == 0, p.stderr[-300:])
    chk("estado_final", ps(f"SELECT max(p.organization_id::text)||':'||string_agg(r.role::text,',') FROM public.profiles p JOIN public.user_roles r USING(user_id) WHERE user_id='{NEW}' ").stdout.strip() == f"{OA}:aplicador")
    # superadmin: o gatilho NÃO bloqueia service_role — a única barreira é o Edge (superadmin_role_reserved, teste Deno).
    p = ps(f"SELECT set_config('request.jwt.claims','{{\"sub\":\"{NEW2}\",\"role\":\"authenticated\"}}',false); SET ROLE authenticated; UPDATE public.profiles SET organization_id='{OA}' WHERE user_id='{NEW2}' RETURNING 1", ok=False)
    chk("usuario_nao_se_atribui_org", p.returncode != 0 or p.stdout.strip() == "", p.stdout)
finally:
    subprocess.run(AS + ["pg_ctl", "-D", data, "stop", "-m", "fast"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
print("TOTAL", len(R), "PASS" if all(R) else "FAIL"); raise SystemExit(0 if all(R) else 1)
