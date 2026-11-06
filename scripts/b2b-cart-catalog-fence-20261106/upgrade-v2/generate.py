#!/usr/bin/env python3
"""B2B_CART_CATALOG_FENCE_V2_UPGRADE — a partir do estado INSTALADO (commit 9c99095, migration
b2b_cart_catalog_fence_reviewed_20261106): troca SOMENTE o corpo do helper privado pela versão restrita
(linha por volume + comprador parceiro_b2b sem papel interno). Motor, fence, wrappers e funções expostas: pinados.
Não reenvia o 02 original (que exige o pré-estado antigo)."""
import hashlib, json, pathlib, runpy
HERE = pathlib.Path(__file__).resolve().parent
base = runpy.run_path(str(HERE.parent / "generate.py"), run_name="lib")

def cap(prefix):
    [p] = [x for x in (HERE / "captured").iterdir() if x.name.startswith(prefix + ".")]
    b = p.read_bytes(); md = hashlib.md5(b).hexdigest(); assert md[:8] == p.name.split(".")[-3], p.name
    return b.decode(), md

V1_HELPER, V1_MD5 = cap("platform_private.b2b_partner_cart_volume_price")
CRP_LIVE, CRP_LIVE_MD5 = cap("public.fn_resolve_commercial_price")
assert CRP_LIVE_MD5 == base["CRP_NEW_MD5"], "motor instalado difere do motor do pacote"
V2_HELPER = base["HELPER"]
V2_MD5 = hashlib.md5(V2_HELPER.encode()).hexdigest()
assert V1_MD5 != V2_MD5
SIG, CRP_SIG, pin, ACL = base["HELPER_SIG"], base["CRP_SIG"], base["pin"], base["ACL_CHECK"]
UNCH = dict(base["UNCHANGED"]); UNCH[CRP_SIG] = CRP_LIVE_MD5

def block(label, helper_md5):
    return pin(SIG, helper_md5, label) + "".join(pin(s, m, label) for s, m in UNCH.items()) + ACL.format(sig=SIG, label=label) + ACL.format(sig=CRP_SIG, label=label)

files = {
 "01-pre.sql.readonly": "-- 01 PRE upgrade (somente leitura). Ref canônico swzpzcwiasxmjutrmvkm conferido FORA do SQL.\nDO $$ BEGIN\n" + block("PRE", V1_MD5) + "  RAISE NOTICE 'PRE_OK';\nEND $$;\n",
 "02-upgrade.sql.review": "-- 02 UPGRADE (REVISÁVEL, NÃO APLICAR sem autorização): só o corpo do helper.\nBEGIN;\nDO $$ BEGIN\n" + block("UPGRADE", V1_MD5) + "END $$;\n"
   + V2_HELPER.rstrip("\n") + ";\n" + f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon, authenticated;\n"
   + "DO $$ BEGIN\n" + block("UPGRADE_POST", V2_MD5) + "END $$;\nCOMMIT;\n",
 "03-post.sql.readonly": "-- 03 POST (somente leitura).\nDO $$ BEGIN\n" + block("POST", V2_MD5) + "  RAISE NOTICE 'POST_OK';\nEND $$;\n",
 "04-rollback-to-v1.sql.review": "-- 04 ROLLBACK: volta ao helper instalado (ca57c161), mantendo compradores aprovados; não toca motor/fence.\nBEGIN;\nDO $$ BEGIN\n" + block("ROLLBACK", V2_MD5) + "END $$;\n"
   + V1_HELPER.rstrip("\n") + ";\n" + f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC, anon, authenticated;\n"
   + "DO $$ BEGIN\n" + block("ROLLBACK_POST", V1_MD5) + "END $$;\nCOMMIT;\n",
}
if __name__ == "__main__":
    for n, t in files.items(): (HERE / n).write_text(t)
    meta = {n: hashlib.md5(t.encode()).hexdigest() for n, t in files.items()}
    meta.update({"helper.installed_v1": V1_MD5, "helper.v2": V2_MD5, "motor.installed_unchanged": CRP_LIVE_MD5})
    (HERE / "generated-md5.json").write_text(json.dumps(meta, indent=2) + "\n"); print(json.dumps(meta, indent=2))
