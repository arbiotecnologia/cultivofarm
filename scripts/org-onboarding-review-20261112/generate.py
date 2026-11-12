#!/usr/bin/env python3
"""Gera install/preflight/postflight/rollback a partir de live-capture/capture.json (somente leitura do LIVE).
Nunca editar os .sql gerados à mão."""
import json, hashlib, pathlib
H = pathlib.Path(__file__).parent
cap = json.load(open(H/'live-capture/capture.json'))
funcs = {f['sig']: f for f in cap['funcs']}
ANCHOR = 'PERFORM public.h15_require_staff();'
GUARD = ANCHOR + '\n  PERFORM platform_private.fiscal_require_released_org();'
CORE = ['_org_set_status(uuid,text,text)','org_onboarding_complete()','org_onboarding_state()',
        'org_status_transition_ok(text,text)','platform_set_organization_status(uuid,text,text)']
FISCAL = sorted(s for s in funcs if s.startswith('rpc_fiscal_') and ANCHOR in funcs[s]['def'])
PINS = {s: funcs[s]['md5'] for s in CORE + FISCAL}
PINS['org_onboarding_save(jsonb)'] = funcs['org_onboarding_save(jsonb)']['md5']
for k in ['platform_private.issue_ticket(text,uuid)','platform_private.onboarding_validar(jsonb)',
          'platform_private.cnpj_normalizar(text)','platform_private.cnpj_valido(text)']:
    PINS[k] = next(p['md5'] for p in cap['priv'] if p['sig'] == k)

def regproc(sig):
    return sig if sig.startswith('platform_private.') else 'public.' + sig

pre = ["DO $pre$ DECLARE v text; BEGIN",
       "  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id='442444d9-263f-45d9-a991-a679498d06c3' AND cnpj_normalizado='98761243000147') THEN",
       "    RAISE EXCEPTION 'PRE: banco não reconhecido como swzpzcwiasxmjutrmvkm (fixture homolog ausente)'; END IF;",
       "  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='platform_approve_onboarding_review') THEN RAISE EXCEPTION 'PRE: pacote já instalado (rerun bloqueado)'; END IF;",
       "  IF EXISTS (SELECT 1 FROM public.organizations WHERE status NOT IN ('rascunho','aguardando_ativacao','onboarding','ativa','suspensa','cancelada')) THEN RAISE EXCEPTION 'PRE: status inesperado'; END IF;"]
for s, m in PINS.items():
    pre.append(f"  SELECT md5(pg_get_functiondef('{regproc(s)}'::regprocedure)) INTO v; IF v IS DISTINCT FROM '{m}' THEN RAISE EXCEPTION 'PRE drift {s}: %', v; END IF;")
pre.append("END $pre$;")
(H/'00-preflight.sql').write_text('\n'.join(pre) + '\n')

out = ['-- GERADO por generate.py: injeta a contenção após h15_require_staff nas RPCs da Central Fiscal (corpos LIVE capturados).']
for s in FISCAL:
    d = funcs[s]['def']
    assert d.count(ANCHOR) >= 1 and 'fiscal_require_released_org' not in d, s
    out.append(d.replace(ANCHOR, GUARD).rstrip() + ';\n')
(H/'02-fiscal-guard.sql').write_text('\n'.join(out))

post = ["DO $post$ BEGIN"]
for s in FISCAL:
    post.append(f"  IF position('fiscal_require_released_org' in pg_get_functiondef('public.{s}'::regprocedure)) = 0 THEN RAISE EXCEPTION 'POST guard ausente {s}'; END IF;")
    post.append(f"  IF (SELECT proacl::text FROM pg_proc WHERE oid='public.{s}'::regprocedure) IS DISTINCT FROM '{funcs[s]['acl']}' THEN RAISE EXCEPTION 'POST ACL alterada {s}'; END IF;")
for s in CORE:
    post.append(f"  IF (SELECT proacl::text FROM pg_proc WHERE oid='public.{s}'::regprocedure) IS DISTINCT FROM '{funcs[s]['acl']}' THEN RAISE EXCEPTION 'POST ACL alterada {s}'; END IF;")
post += [
 "  IF has_function_privilege('authenticated','public.svc_onboarding_record_cnpj_evidence(uuid,uuid,jsonb,text,text)','EXECUTE') THEN RAISE EXCEPTION 'POST svc exposto'; END IF;",
 "  IF has_function_privilege('anon','public.platform_approve_onboarding_review(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'POST anon aprova'; END IF;",
 "  IF (SELECT count(*) FROM pg_trigger WHERE tgname='a00_fiscal_release_gate') <> 6 THEN RAISE EXCEPTION 'POST triggers'; END IF;",
 "  IF (SELECT count(*) FROM pg_policies WHERE policyname='fiscal_release_containment' AND permissive='RESTRICTIVE') <> 6 THEN RAISE EXCEPTION 'POST policies'; END IF;",
 "  IF has_table_privilege('authenticated','platform_private.organization_onboarding_reviews','SELECT') THEN RAISE EXCEPTION 'POST fila exposta'; END IF;",
 "END $post$;"]
(H/'03-postflight.sql').write_text('\n'.join(post) + '\n')

(H/'install.sql.review').write_text('BEGIN;\nSET LOCAL lock_timeout = \'3s\';\n' + (H/'00-preflight.sql').read_text()
   + (H/'01-core.sql').read_text() + (H/'02-fiscal-guard.sql').read_text() + (H/'03-postflight.sql').read_text() + 'COMMIT;\n')
sums = ''.join(f"{hashlib.sha256((H/n).read_bytes()).hexdigest()}  {n}\n" for n in
  ['live-capture/capture.json','00-preflight.sql','01-core.sql','02-fiscal-guard.sql','03-postflight.sql','install.sql.review','04-rollback.sql.review'] if (H/n).exists())
(H/'SHA256SUMS').write_text(sums)
print('fiscal guarded:', len(FISCAL)); print('\n'.join(FISCAL))
