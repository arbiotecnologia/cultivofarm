#!/usr/bin/env python3
"""P0c — saneamentos finais determinísticos. Não acessa banco."""
import csv, hashlib, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
P = os.path.join(ROOT, "restoration/promocao-producao-h9")

FIXTURES = ("5b3817dd-9894-408f-b4f2-06bb57f6fb56",
            "e848af9d-1a10-4066-9d98-b03a49c284b8",
            "4120a677-0d7f-46a6-aa6a-48b748b879ba")

SUBSTITUTO = """-- [P0c] Quarentena de perfis fiscais SINTÉTICOS de homologação removida do
-- artefato de promoção: os 3 UUIDs são linhas de fixture que não existem em
-- produção. Em vez de propagá-los, o artefato exige fail-closed que eles não
-- existam no alvo; se existirem, a onda aborta e escala para decisão humana.
DO $p0c_fixtures$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.microorganism_fiscal_profiles
   WHERE id::text = ANY (string_to_array(current_setting('promocao.fixture_ids', true), ','));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'F1_ABORT: perfis sinteticos de homologacao presentes no alvo (%)', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM public.product_fiscal_profiles
   WHERE id::text = ANY (string_to_array(current_setting('promocao.fixture_ids', true), ','));
  IF v_n > 0 THEN
    RAISE EXCEPTION 'F1_ABORT: perfis sinteticos de produto presentes no alvo (%)', v_n;
  END IF;
END
$p0c_fixtures$;
"""


def sanear_20260812000000():
    rel = "restoration/promocao-producao-h9/promotion-sql/20260812000000__promocao.sql"
    txt = open(os.path.join(ROOT, rel), encoding="utf-8").read()
    if "p0c_fixtures" in txt:
        return rel, False
    ini = txt.index("-- B.2 Quarentena determinística")
    fim = txt.index("-- B.3 Pós-check fail-closed embutido")
    txt = txt[:ini] + SUBSTITUTO + "\n" + txt[fim:]

    # remove os dois pós-checks de fixture do bloco $post$
    txt = re.sub(
        r"\n  SELECT count\(\*\) INTO v_bad FROM public\.(?:microorganism|product)_fiscal_profiles\n"
        r"  WHERE id\s*(?:=|IN).*?\n(?:.*?\n)?  IF v_bad > 0 THEN RAISE EXCEPTION 'F1_ABORT: perfil sintetico[^\n]*\n",
        "\n", txt)
    for u in FIXTURES:
        assert u not in txt, f"UUID de fixture remanescente: {u}"
    open(os.path.join(ROOT, rel), "w", encoding="utf-8").write(txt)
    return rel, True


def main():
    rel, mudou = sanear_20260812000000()
    print("20260812000000 saneado:", mudou)

    # 20260801221902: gate de ambiente de homologação + fixtures de cockpit
    path = os.path.join(P, "01-manifesto-migrations.csv")
    rows = list(csv.DictReader(open(path, encoding="utf-8")))
    cols = list(rows[0].keys())
    achou = False
    for r in rows:
        if r["version"] == "20260801221902":
            r["classificacao"] = "STAGING_ONLY"
            r["motivo"] = ("infraestrutura de fixtures de cockpit e gate de ambiente de homologacao "
                           "(fn_cockpit_is_hml_environment le _fiscal_staging_marker); nao entrega "
                           "capacidade de negocio em producao; NAO PROMOVER")
            r["onda"] = "—"
            achou = True
    assert achou, "20260801221902 ausente do manifesto"
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)

    # refresca hash do artefato saneado
    apath = os.path.join(P, "10-manifesto-artefatos-promocao.csv")
    arows = list(csv.DictReader(open(apath, encoding="utf-8")))
    acols = list(arows[0].keys())
    for a in arows:
        if a["artefato"] and a["artefato"] != "—" and os.path.exists(os.path.join(ROOT, a["artefato"])):
            a["sha256_artefato"] = hashlib.sha256(
                open(os.path.join(ROOT, a["artefato"]), encoding="utf-8").read().encode()).hexdigest()
        if a["version"] == "20260812000000":
            a["transformacao"] += ("; [P0c] quarentena de 3 perfis fiscais sinteticos de homologacao "
                                   "substituida por precheck fail-closed de ausencia no alvo")
    with open(apath, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=acols)
        w.writeheader()
        w.writerows(arows)

    from collections import Counter
    print("01:", Counter(r["classificacao"] for r in rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
