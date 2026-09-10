#!/usr/bin/env python3
"""Validador determinístico da P0c. Estático: não acessa banco algum."""
import csv, hashlib, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")
PROD = "navfzbwgwzruipouyfnk"
STG = "ikaauvsflpmamgxmkhoq"
SANDBOX = "yzszlzjpovmcteuxjznj"
MARK = ("_fiscal_staging_marker", "fiscal_environment_marker")
CRON_MD5 = "e14782b8984dd461684fdbdc2c4008ff"

ok = fail = 0


def chk(cond, msg):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print("FALHA:", msg)


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return "\n".join(l for l in s.splitlines() if not l.strip().startswith("--"))


def sha(rel):
    return hashlib.sha256(open(os.path.join(ROOT, rel), encoding="utf-8").read().encode()).hexdigest()


def main():
    rows = list(csv.DictReader(open(os.path.join(P, "01-manifesto-migrations.csv"), encoding="utf-8")))
    arows = list(csv.DictReader(open(os.path.join(P, "10-manifesto-artefatos-promocao.csv"), encoding="utf-8")))
    by = {r["version"]: r for r in rows}
    aby = {r["version"]: r for r in arows}

    # 1) 192 versões únicas, todas classificadas, nenhuma bloqueada
    chk(len(rows) == 192, f"01 tem {len(rows)} linhas (esperado 192)")
    chk(len(by) == 192, "versões duplicadas em 01")
    validas = {"PROMOVER", "PROMOVIVEL_COM_ARTEFATO", "PROMOVIVEL_CONDICIONADO", "STAGING_ONLY"}
    ruins = [r["version"] for r in rows if r["classificacao"] not in validas]
    chk(not ruins, f"classificações não finais: {ruins[:5]}")

    # 2) quarentena repo-only fora do pacote
    q = os.path.join(P, ".p0-quarentena.json")
    if os.path.exists(q):
        quarentena = set(json.load(open(q)))
        chk(len(quarentena) == 59, f"quarentena com {len(quarentena)} versões")
        chk(not (quarentena & set(by)), "version em quarentena presente no manifesto")
    else:
        chk(True, "quarentena documentada em 00-preflight-readonly.md")

    # 3) guards: cada version com ref/marcador executável precisa de artefato ou ser STAGING_ONLY
    guard_g0 = guard_art = guard_so = 0
    for r in rows:
        raw = open(os.path.join(ROOT, r["arquivo"]), encoding="utf-8").read()
        exe = strip_comments(raw)
        tem_guarda_exec = (STG in exe) or any(m in exe for m in MARK)
        if not (STG in raw or any(m in raw for m in MARK)):
            continue
        if r["classificacao"] == "STAGING_ONLY":
            guard_so += 1
        elif r["classificacao"] == "PROMOVIVEL_COM_ARTEFATO":
            guard_art += 1
            a = aby.get(r["version"])
            chk(a is not None and a["artefato"] not in ("", "—"),
                f"{r['version']} sem artefato no manifesto 10")
        else:
            guard_g0 += 1
            chk(not tem_guarda_exec,
                f"{r['version']} classificada {r['classificacao']} com guarda EXECUTÁVEL")
    total_guards = guard_g0 + guard_art + guard_so
    # Censo revisado na P0c: 106 = 53 G0 + 46 artefato derivado + 7 STAGING_ONLY.
    # A P0b contava 103 por motivo textual e nao enxergava 20260801221902 nem
    # duas versoes cujo destino ja era artefato/staging-only.
    chk(total_guards == 106, f"{total_guards} versões com guarda (esperado 106)")

    # 4) destrutivas: 15 decididas
    dest = [r for r in rows if "DROP_COLUMN" in r["flags"] or "DROP_TABLE" in r["flags"]
            or "DELETE" in r["flags"] or "TRUNCATE" in r["flags"]]
    chk(len(dest) >= 15, f"{len(dest)} destrutivas mapeadas (esperado >= 15)")
    for v in ("20260727035330", "20260730030920", "20260804022556"):
        chk(by[v]["classificacao"] == "PROMOVIVEL_CONDICIONADO", f"{v} sem condicionamento")

    # 5) artefatos: higiene e hash conferem
    for a in arows:
        if a["classe"] != "PROMOVIVEL_COM_ARTEFATO":
            continue
        rel = a["artefato"]
        chk(os.path.exists(os.path.join(ROOT, rel)), f"artefato ausente: {rel}")
        if not os.path.exists(os.path.join(ROOT, rel)):
            continue
        chk(sha(rel) == a["sha256_artefato"], f"SHA-256 divergente: {rel}")
        chk(sha(a["origem"]) == a["sha256_origem"], f"SHA-256 de origem divergente: {a['origem']}")
        exe = strip_comments(open(os.path.join(ROOT, rel), encoding="utf-8").read())
        for proibido in (STG, SANDBOX, *MARK, "service_role_key", "BEGIN RSA", "PRIVATE KEY"):
            chk(proibido not in exe, f"{rel}: '{proibido}' em código executável")
        chk(not re.search(r"\b\d{4,6}::oid\b", exe), f"{rel}: OID literal em código executável")
        uuids = [u for u in re.findall(r"'([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'", exe)
                 if u != "00000000-0000-0000-0000-000000000000"]
        chk(not uuids, f"{rel}: UUID de fixture em código executável: {uuids[:2]}")
        if a["version"] != "20261101000000":  # convergência não é artefato derivado de migration
            chk(PROD in exe, f"{rel}: guarda canônica de promoção ausente")

    # 6) cron com baseline exato de produção
    cron = open(os.path.join(P, "promotion-sql/20261003000000__promocao_cron.sql"), encoding="utf-8").read()
    chk(CRON_MD5 in cron, "artefato de cron sem o md5 de produção")
    chk("6fcccc17696cc2409fa5afba2a593e78" not in cron, "artefato de cron com md5 de homologação")
    for termo in ("performed_at", "changed_at", "cron.alter_job", "promocao_rollback_baseline",
                  "v_lines_changed <> 2"):
        chk(termo in cron, f"artefato de cron sem '{termo}'")
    chk("cron.schedule(" not in cron, "artefato de cron agenda job novo")
    chk(not re.search(r"^\s*DELETE\s+FROM", cron, re.M | re.I), "artefato de cron executa DELETE")
    rb = os.path.join(P, "rollback-sql/20261003000000__promocao_cron_rollback.sql")
    chk(os.path.exists(rb), "rollback do cron ausente")

    # 7) Vault sem segredos
    comm = open(os.path.join(P, "promotion-sql/20260727161408__promocao.sql"), encoding="utf-8").read()
    for termo in ("vault.decrypted_secrets", "secret_smtp_password IS NOT NULL",
                  "alguma flag de entrega esta ligada"):
        chk(termo in comm, f"artefato de comunicação sem '{termo}'")
    chk("vault.create_secret" not in comm and "vault.update_secret" not in comm,
        "artefato de comunicação cria segredo")

    # 8) H9-E2 e H7L preservam o trabalho real
    h9 = open(os.path.join(P, "promotion-sql/20261023000000__promocao.sql"), encoding="utf-8").read()
    chk(h9.count("CREATE OR REPLACE FUNCTION") == 3, "H9-E2 sem os 3 CREATE OR REPLACE")
    h9e = strip_comments(h9)
    chk("678" not in h9e, "H9-E2 com ledger fixo 678 em código executável")
    chk("ledger_count" not in h9e, "H9-E2 ainda depende de contagem de ledger")
    chk("::regprocedure" in h9, "H9-E2 sem baseline por assinatura")
    chk("visitas_checkin_client_uuid_uq" in h9, "H9-E2 sem precheck do índice único")
    h7 = open(os.path.join(P, "promotion-sql/20260903182144__promocao.sql"), encoding="utf-8").read()
    chk(h7.count("set (security_invoker = true)") == 3, "H7L sem os 3 security_invoker")
    chk(h7.count("alter function ") == 22, "H7L sem as 22 funções endurecidas")

    # 9) 2 views do advisor mapeadas
    views = open(os.path.join(P, "13-security-definer-views.md"), encoding="utf-8").read()
    for v in ("vw_esteira_laboratorio", "vw_fluxo_visita_tecnica"):
        chk(v in views, f"view {v} não mapeada")

    # 10) convergência criada e NÃO executada
    conv_rel = "restoration/promocao-producao-h9/promotion-sql/20261101000000_promocao_convergencia_ledger_v1.sql"
    chk(os.path.exists(os.path.join(ROOT, conv_rel)), "migration de convergência ausente")
    conv = open(os.path.join(ROOT, conv_rel), encoding="utf-8").read()
    chk("schema_migrations" not in strip_comments(conv), "convergência escreve em schema_migrations")
    chk("ENABLE ROW LEVEL SECURITY" in conv and "CREATE POLICY" not in conv,
        "convergência sem deny-by-default")
    chk("IF NOT EXISTS" in conv, "convergência não idempotente")
    chk(not os.path.exists(os.path.join(
        ROOT, "supabase/migrations/20261101000000_promocao_convergencia_ledger_v1.sql")),
        "convergência já colocada em supabase/migrations (seria execução)")

    # 11) binding final em homologação, sandbox ausente
    env = open(os.path.join(ROOT, ".env"), encoding="utf-8").read()
    chk(STG in env and SANDBOX not in env, ".env fora do binding de homologação")
    cli = open(os.path.join(ROOT, "src/integrations/supabase/client.ts"), encoding="utf-8").read()
    chk(SANDBOX not in cli, "client.ts referencia sandbox")

    print(f"{ok} verificacoes OK, {fail} falhas")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
