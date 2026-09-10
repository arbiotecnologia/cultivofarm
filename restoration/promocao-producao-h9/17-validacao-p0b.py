#!/usr/bin/env python3
"""P0b — validação estática do pacote de promoção. NÃO acessa banco algum.

Reprova (exit 1) se qualquer invariante do pacote falhar. Somente leitura de
arquivos; nenhum arquivo de supabase/migrations/ é tocado.
"""
import csv, glob, hashlib, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")
PROD, STG, SBX = "navfzbwgwzruipouyfnk", "ikaauvsflpmamgxmkhoq", "yzszlzjpovmcteuxjznj"
MARKERS = ("_fiscal_staging_marker", "fiscal_environment_marker")
falhas, notas = [], []


def chk(cond, msg):
    (notas if cond else falhas).append(("OK  " if cond else "FALHA ") + msg)


def strip_comments(s):
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return "\n".join(l for l in s.splitlines() if not l.strip().startswith("--"))


def read(p):
    return open(os.path.join(ROOT, p), encoding="utf-8", errors="replace").read()


# ---------------------------------------------------------------- manifesto
man = list(csv.DictReader(open(os.path.join(P, "01-manifesto-migrations.csv"), encoding="utf-8")))
vers = [r["version"] for r in man]
chk(len(man) == 192, f"manifesto tem 192 versoes (real {len(man)})")
chk(len(set(vers)) == len(vers), "versoes do manifesto sao unicas")
chk(all(v > "20260723000000" for v in vers), "toda version e posterior ao corte de producao")

# [P0c] censo revisado: 43 linhas apontam ao artefato derivado gerado na P0b.
guard = [r for r in man if "guarda de homologacao substituida" in r["motivo"]]
chk(len(guard) == 43, f"43 linhas com artefato derivado da P0b (real {len(guard)})")

# [P0c] as 15 destrutivas foram decididas: 3 condicionadas, 12 promoviveis.
destr = [r for r in man if r["classificacao"] == "PROMOVIVEL_CONDICIONADO"]
chk(len(destr) == 3, f"3 destrutivas reais condicionadas (real {len(destr)})")

# quarentena: as 59 repo-only nao podem estar no manifesto
qfile = os.path.join(P, "..", "homologacao-h9")
quar = set()
for f in glob.glob(os.path.join(ROOT, "restoration/**/*.csv"), recursive=True):
    if "quarentena" in os.path.basename(f).lower():
        quar |= {r.get("version", "") for r in csv.DictReader(open(f, encoding="utf-8"))}
chk(not (quar & set(vers)), f"zero intersecao com a quarentena ({len(quar)} versoes conhecidas)")

# ------------------------------------------------------- artefatos derivados
art = list(csv.DictReader(open(os.path.join(P, "10-manifesto-artefatos-promocao.csv"), encoding="utf-8")))
chk(len(art) == 49, f"49 linhas no manifesto de artefatos apos a P0c (real {len(art)})")
emit = [r for r in art if r["classe"] == "PROMOVIVEL_COM_ARTEFATO"]
dec = [r for r in art if r["classe"] == "REQUER_DECISAO"]
chk(len(emit) == 48, f"48 artefatos emitidos apos a P0c (real {len(emit)})")
chk(len(dec) == 0, f"nenhum alvo em REQUER_DECISAO apos a P0c (real {len(dec)})")

for r in art:
    src = read(r["origem"])
    chk(hashlib.sha256(src.encode()).hexdigest() == r["sha256_origem"],
        f"SHA-256 da origem confere: {r['version']}")

for r in emit:
    txt = read(r["artefato"])
    chk(hashlib.sha256(txt.encode()).hexdigest() == r["sha256_artefato"],
        f"SHA-256 do artefato confere: {r['version']}")
    exe = strip_comments(txt)
    chk(STG not in exe, f"artefato sem ref de homologacao executavel: {r['version']}")
    chk(not any(m in exe for m in MARKERS), f"artefato sem marcador de homologacao: {r['version']}")
    chk(SBX not in txt, f"artefato sem ref de sandbox: {r['version']}")
    if r["version"] != "20261101000000":  # convergencia nao e artefato derivado
        chk("promocao.target_ref" in exe and PROD in exe, f"guarda canonica presente: {r['version']}")
        chk(exe.strip().upper().startswith("DO $PROMO_GUARD$"), f"guarda e o primeiro comando: {r['version']}")

disco = {os.path.basename(f) for f in glob.glob(os.path.join(P, "promotion-sql", "*.sql"))}
chk(disco == {os.path.basename(r["artefato"]) for r in emit},
    f"arquivos em promotion-sql batem com o manifesto ({len(disco)})")

# --------------------------------------------------------------- higiene
SEG = re.compile(r"(?i)(eyJ[A-Za-z0-9_-]{20,}\.|sb_secret_[A-Za-z0-9_-]{10,}|BEGIN [A-Z ]*PRIVATE KEY|postgres(ql)?://[^\s'\"]*:[^\s'\"]*@)")
for f in glob.glob(os.path.join(P, "**/*"), recursive=True):
    if not os.path.isfile(f) or f.endswith((".pyc",)):
        continue
    rel = os.path.relpath(f, ROOT)
    t = open(f, encoding="utf-8", errors="replace").read()
    chk(not SEG.search(t), f"sem segredo literal: {rel}")
    if f.endswith(".sql"):
        chk(SBX not in t, f"SQL sem ref de sandbox: {rel}")
    if os.path.basename(f) in ("03-prechecks.sql", "04-postchecks.sql"):
        chk(not re.search(r"(?im)^\s*(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE|GRANT|REVOKE)\b", t),
            f"{rel} e estritamente somente leitura")

# ------------------------------------------------------------ dossies P0b
for nome, termos in [
    ("09-p0b-resolucao-guards.md", ["106", "43", "promocao.target_ref"]),
    ("11-destrutivas-precheck-rollback.md", ["20260727035330", "20260730030920", "20260804022556"]),
    ("12-auth-schema-decision.md", ["20260727161408", "vault"]),
    ("13-security-definer-views.md", ["vw_esteira_laboratorio", "vw_fluxo_visita_tecnica", "security_invoker"]),
    ("15-cron-manifest.md", ["prune-old-audit-logs", "h7o-prune-public-validation-rate-limit"]),
    ("16-secrets-checklist.md", ["INTERNAL_FUNCTION_SECRET", "FISCAL_CERTIFICATE_MASTER_KEY"]),
]:
    t = read(f"restoration/promocao-producao-h9/{nome}")
    chk(all(x in t for x in termos), f"dossie completo: {nome}")

# ---------------------------------------------------------- edge functions
ef = list(csv.DictReader(open(os.path.join(P, "14-edge-functions-manifest.csv"), encoding="utf-8")))
chk(len(ef) == 37, f"37 Edge Functions classificadas (real {len(ef)})")
disc_fn = {os.path.basename(d.rstrip("/")) for d in glob.glob(os.path.join(ROOT, "supabase/functions/*/"))} - {"_shared"}
chk(disc_fn == {r["funcao"] for r in ef}, "manifesto cobre exatamente as funcoes do repositorio")
chk(all(r["classificacao"] in {"PROMOVER", "PRESERVAR_PRODUCAO", "NAO_DEPLOYAR",
                               "REQUER_SEGREDO_CONFIG", "REQUER_DECISAO"} for r in ef),
    "toda funcao tem classificacao valida")
for h in ("entrega-runtime-harness", "fase-e-runtime-harness", "hml-b2b-runtime-harness", "fiscal-binding-diagnostics"):
    chk(next(r["classificacao"] for r in ef if r["funcao"] == h) == "NAO_DEPLOYAR",
        f"harness/diagnostico marcado NAO_DEPLOYAR: {h}")
chk(all(r["classificacao"] != "PROMOVER" for r in ef if r["authz_interna_comprovada"] == "NAO"),
    "nenhuma funcao sem authz comprovada esta marcada PROMOVER")

# ------------------------------------------------------------------ binding
env = read(".env")
chk(f'VITE_SUPABASE_PROJECT_ID="{STG}"' in env, "binding do .env aponta para homologacao")
chk(SBX not in env and PROD not in env, ".env sem ref de sandbox ou producao")
chk(len(read("src/integrations/supabase/types.ts").splitlines()) > 20000, "types.ts com contrato completo")

# ------------------------------------------------------------------ saida
for l in falhas:
    print(l)
print(f"\nP0b: {len(notas)} verificacoes OK, {len(falhas)} falhas")
print("VALIDACAO_P0B_OK" if not falhas else "VALIDACAO_P0B_FALHOU")
sys.exit(1 if falhas else 0)
