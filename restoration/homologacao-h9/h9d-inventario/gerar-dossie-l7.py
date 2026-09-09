#!/usr/bin/env python3
"""H9-D-L7 — gera dossie-l7.json e decisoes-l7.json (1 assinatura) e atualiza
inventario/classificacao/resumo. Ambiente exclusivo: staging ikaauvsflpmamgxmkhoq."""
import hashlib, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
DIR = ROOT / "restoration/homologacao-h9/h9d-inventario"
SIG = "start_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,text,uuid)"
FW = "restoration/homologacao-h9/h9d-forwards/20261019000000_h9dl7_start_visit_scope_and_idempotency_v1.sql"
RB = "restoration/homologacao-h9/h9d-rollbacks/20261019000000_h9dl7_start_visit_scope_and_idempotency_v1_rollback.sql"
sha = lambda p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()

entrada = {
  "classificacao": "EXPOSICAO_COMPROVADA_CORRIGIDA",
  "guarda_textual": (
    "Corpo lido integralmente (72 linhas antes, 78 depois). Antes da 20261019000000 a funcao autenticava "
    "com auth.uid() (28000) mas executava o SELECT de idempotencia por client_uuid e o SELECT em "
    "registros_consultor ANTES de qualquer autorizacao. Depois da correcao a capacidade administrativa e "
    "avaliada e public._visita_scope_ok(v_uid, p_registro_id) e exigido ANTES de qualquer leitura; NULL "
    "resolve fail-closed via COALESCE(...,false) e o unico erro possivel para identidade sem escopo e "
    "not_visit_owner (42501)."
  ),
  "cadeia_transitiva": (
    "public._visita_scope_ok(uuid,uuid) — SQL, STABLE, SECURITY DEFINER, search_path=public, EXECUTE apenas "
    "para postgres/service_role — combina can_manage_technical_visit, is_active_visit_participant e a autoria "
    "em registros_consultor (created_by, consultor_responsavel, consultor_profile_id), com fail-closed em NULL. "
    "has_role(uuid,app_role) SECDEF/STABLE/search_path=public. Trigger preexistente "
    "validate_registro_status_transition permanece intocada."
  ),
  "callsites": (
    "Busca recursiva em src/ e supabase/functions/: nenhum callsite de aplicacao invoca a funcao (apenas a "
    "migration de origem 20260716203929 e o tipo gerado em src/integrations/supabase/types.ts). O check-in de "
    "produto usa rpc_realizar_checkin_visita (src/hooks/useFluxoVisitaTecnica.ts). Ainda assim a funcao permanece "
    "alcancavel por qualquer identidade authenticated via PostgREST, o que torna a correcao obrigatoria."
  ),
  "prova_individual": (
    "Antes (staging, sub arbitrario 0000...00aa): registro real alheio -> not_visit_owner (42501); UUID inexistente "
    "-> registro_not_found (22023) — oraculo de existencia; client_uuid real de terceiro -> retornou "
    "(01a72cfc-5870-4148-9c70-dabc79e90120, false), BOLA/IDOR antes de qualquer autorizacao. "
    "Depois: registro real alheio, UUID inexistente, NULL e client_uuid alheio produzem respostas indistinguiveis "
    "(not_visit_owner, 42501); anon recebe permission denied for function. Idempotencia legitima preservada: o dono "
    "do check-in recebe o proprio checkin_id com is_new=false. Resíduo zero (delta visitas_checkin=0, "
    "delta visitas_logs=0) em todos os ensaios, executados em transacao revertida."
  ),
  "fingerprint_vivo": {
    "definition_md5": "1f5e5484078b843ac68e810376d360e2",
    "definition_len": 2711,
    "functiondef_md5": "2b9d1fb6ae2851c154849e4179c48978",
    "functiondef_md5_pre_l7": "e627fdff91374ada08cdcd4fbf72c557",
    "proconfig": "search_path=public",
    "acl": "postgres=X/postgres|authenticated=X/postgres|service_role=X/postgres",
    "owner": "postgres",
    "security_definer": True,
    "volatilidade": "VOLATILE",
    "oid": 24596,
    "overloads": 1,
  },
}

base = {
  "ambiente": "ikaauvsflpmamgxmkhoq",
  "producao_proibida": "navfzbwgwzruipouyfnk",
  "lote": "H9-D-L7",
  "ledger": 675,
  "ultima_migration": "20261019000000",
  "total": 1,
  "forward_aplicado": "20261019000000_h9dl7_start_visit_scope_and_idempotency_v1 (aplicado uma unica vez; ledger 674 -> 675)",
  "forward_path": FW,
  "forward_sha256": sha(FW),
  "rollback_path": RB,
  "rollback_sha256": sha(RB),
  "metodo": (
    "Assinatura canonica completa, pg_get_functiondef integral, ACL/owner/prosecdef/proconfig/volatilidade/OID, "
    "helpers transitivos, callsites em src/ e supabase/functions/, provas adversariais em transacao revertida "
    "no staging. Regex e nome nunca classificam."
  ),
  "resumo_lote": (
    "Unica assinatura pendente do H9-D fechada. Exposicoes comprovadas (oraculo de existencia e BOLA/IDOR na "
    "idempotencia) corrigidas pelo forward reversivel 20261019000000, com preflight em transacao revertida, "
    "aplicacao unica e rollback exato para o fingerprint pre-L7 e627fdff91374ada08cdcd4fbf72c557."
  ),
  "incidente_preflight": (
    "O primeiro preflight desta fase envolveu os artefatos, que ja contem BEGIN/COMMIT proprios, em uma transacao "
    "externa; o COMMIT interno encerrou a transacao e o par forward+rollback ficou efetivado no staging antes do "
    "ROLLBACK final, que apenas emitiu 'there is no transaction in progress'. O ledger NAO foi tocado (permaneceu "
    "674) e nenhum dado foi alterado. O efeito residual foi apenas a normalizacao de CRLF para LF no corpo da funcao "
    "(fingerprint 5cab21724fda5fde040c10748386c35d). O rollback foi reconstruido preservando os bytes CRLF originais "
    "e reaplicado, restaurando o fingerprint exato e627fdff91374ada08cdcd4fbf72c557 antes do preflight correto e da "
    "aplicacao unica da 20261019000000. Incidente registrado por transparencia."
  ),
  "assinaturas": {SIG: entrada},
}
(DIR / "dossie-l7.json").write_text(json.dumps(base, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
(DIR / "decisoes-l7.json").write_text(json.dumps(base, ensure_ascii=False, indent=1) + "\n", encoding="utf8")

# inventario + classificacao
inv = DIR / "secdef-authenticated-inventory-h9d.tsv"
lines = inv.read_text(encoding="utf8").split("\n")
EV = ("H9-D-L7: corpo lido integralmente; oraculo de existencia e BOLA/IDOR na idempotencia por client_uuid "
      "comprovados dinamicamente e corrigidos pelo forward reversivel 20261019000000 (ledger 674 -> 675); "
      "autorizacao via _visita_scope_ok antes de qualquer leitura, idempotencia escopada ao autor, "
      "respostas indistinguiveis e resíduo zero. Ver h9d-inventario/dossie-l7.json.")
for i, l in enumerate(lines):
    c = l.split("\t")
    if c[0:2] == ["public", SIG]:
        c[13] = "2711"; c[14] = "1f5e5484078b843ac68e810376d360e2"
        c[15] = "EXPOSICAO_COMPROVADA_CORRIGIDA"; c[16] = EV
        lines[i] = "\t".join(c)
inv.write_text("\n".join(lines), encoding="utf8")

cls = DIR / "classificacao-h9d.tsv"
cl = cls.read_text(encoding="utf8").split("\n")
for i, l in enumerate(cl):
    c = l.split("\t")
    if c[0] == SIG:
        c[2] = "EXPOSICAO_COMPROVADA_CORRIGIDA"; c[3] = EV
        cl[i] = "\t".join(c)
cls.write_text("\n".join(cl), encoding="utf8")

res = json.loads((DIR / "resumo-h9d.json").read_text(encoding="utf8"))
res["ledger"] = 675
res["por_classificacao"] = {"AUTH_COMPROVADA": 257, "EXPOSICAO_COMPROVADA_CORRIGIDA": 31,
                            "NAO_APLICAVEL": 4, "PENDENTE_EVIDENCIA": 0}
if "H9-D-L7" not in res["lotes_auditados"]:
    res["lotes_auditados"].append("H9-D-L7")
if "20261019000000" not in res["forwards_aplicados"]:
    res["forwards_aplicados"].append("20261019000000")
(DIR / "resumo-h9d.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
print("ok", sha(FW), sha(RB))
