#!/usr/bin/env python3
"""Gera artefatos DERIVADOS de promoção a partir das migrations históricas.

Determinístico e reexecutável. NUNCA altera arquivos em supabase/migrations/.
Não acessa banco. Saída: restoration/promocao-producao-h9/promotion-sql/.

Transformação: remove o bloco DO de guarda de homologação (guarda pura, sem
DDL/DML) e prefixa a guarda canônica de promoção baseada no GUC de sessão
`promocao.target_ref`, que o runner define somente após validar o ref do alvo
por canal externo. Arquivos cuja guarda esteja entrelaçada com trabalho real
são marcados REQUER_DECISAO e nenhum artefato é emitido para eles.
"""
import csv, hashlib, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "restoration/promocao-producao-h9/promotion-sql")
MANIFESTO = os.path.join(ROOT, "restoration/promocao-producao-h9/01-manifesto-migrations.csv")
PROD = "navfzbwgwzruipouyfnk"
STG = "ikaauvsflpmamgxmkhoq"
MARKERS = ("_fiscal_staging_marker", "fiscal_environment_marker")
WORK = re.compile(r"(?i)\b(create|alter|drop|grant|revoke|insert|update|delete|truncate|comment on|pg_get_functiondef)\b")

HDR = """-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : {orig}
-- SHA-256 orig: {oh}
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: {tr}
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = '{prod}'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> '{prod}' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', '{prod}'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

"""


def strip_comments(s: str) -> str:
    s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
    return "\n".join(l for l in s.splitlines() if not l.strip().startswith("--"))


def do_blocks(s: str):
    """Rende (inicio, fim, corpo) de cada bloco DO $tag$ ... $tag$;"""
    for m in re.finditer(r"\bDO\s+(\$[A-Za-z_]*\$)", s):
        tag = m.group(1)
        end = s.find(tag, m.end())
        if end == -1:
            continue
        stop = s.find(";", end + len(tag))
        stop = stop + 1 if stop != -1 else end + len(tag)
        yield m.start(), stop, s[m.start():stop]


def transform(raw: str):
    out = raw
    removed = 0
    while True:
        alvo = None
        for a, b, body in do_blocks(out):
            corpo = strip_comments(body)
            if not (STG in corpo or any(k in corpo for k in MARKERS)):
                continue
            miolo = corpo[corpo.find("BEGIN") + 5:] if "BEGIN" in corpo else corpo
            if WORK.search(miolo):
                continue  # guarda entrelaçada com trabalho real
            alvo = (a, b)
            break
        if not alvo:
            break
        out = out[:alvo[0]] + "-- [guarda de homologação removida pelo gerador de promoção]\n" + out[alvo[1]:]
        removed += 1
    return out, removed


def main():
    rows = {r["version"]: r for r in csv.DictReader(open(MANIFESTO, encoding="utf-8"))}
    alvos = json.load(open(os.path.join(ROOT, "restoration/promocao-producao-h9/.p0b-guard-targets.json")))
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for v in sorted(alvos):
        r = rows[v]
        src = r["arquivo"]
        raw = open(os.path.join(ROOT, src), encoding="utf-8").read()
        oh = hashlib.sha256(raw.encode()).hexdigest()
        body, removed = transform(raw)
        residual = strip_comments(body)
        problemas = []
        if STG in residual:
            problemas.append("ref de homologacao remanescente em codigo executavel")
        if any(k in residual for k in MARKERS):
            problemas.append("marcador de homologacao remanescente em codigo executavel")
        entry = dict(
            version=v, origem=src, sha256_origem=oh,
            dominio=r["dominio"], onda=r["onda"] or "—",
            guardas_removidas=removed,
        )
        if problemas:
            entry.update(classe="REQUER_DECISAO", artefato="—", sha256_artefato="—",
                         transformacao="—", pendencia="; ".join(problemas))
        else:
            tr = f"{removed} bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada"
            texto = HDR.format(orig=src, oh=oh, tr=tr, prod=PROD) + body
            nome = f"{v}__promocao.sql"
            open(os.path.join(OUT, nome), "w", encoding="utf-8").write(texto)
            entry.update(classe="PROMOVIVEL_COM_ARTEFATO",
                         artefato=f"restoration/promocao-producao-h9/promotion-sql/{nome}",
                         sha256_artefato=hashlib.sha256(texto.encode()).hexdigest(),
                         transformacao=tr, pendencia="—")
        manifest.append(entry)
    cols = ["version", "origem", "sha256_origem", "artefato", "sha256_artefato",
            "transformacao", "guardas_removidas", "classe", "pendencia", "onda", "dominio"]
    dest = os.path.join(ROOT, "restoration/promocao-producao-h9/10-manifesto-artefatos-promocao.csv")
    with open(dest, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for e in manifest:
            w.writerow(e)
    from collections import Counter
    print("artefatos:", Counter(e["classe"] for e in manifest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
