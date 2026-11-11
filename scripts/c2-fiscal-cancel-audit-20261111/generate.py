"""Generate a diagnostic-only review delta from captured r12 metadata; no database connection."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent
SIG='public.fn_fiscal_invoice_eligibility(text,uuid)'
PIN='70dba08838cd4d5eea29f37f5f8a3373'
def generate():
    pins=json.loads((H/'capture/pins.json').read_text())
    base=(H/'capture/eligibility.sql').read_text()
    assert pins[SIG]['md5']==PIN
    anchor="  RETURN jsonb_build_object(\n    'eligible', jsonb_array_length(reasons) = 0,"
    assert base.count(anchor)==1
    new=base.replace('  v_owner_org uuid;','  v_owner_org uuid;\n  v_econ jsonb; v_ev jsonb; v_diag jsonb; v_com boolean; v_credit boolean;')
    block="""  -- Diagnostic only: canonical pilot reader owns viewer authorization; no new read authority.
  IF _source_type='PARTNER_ORDER' AND po.c2_external_origin_snapshot->>'contract'='C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1' THEN
    v_diag:=jsonb_build_object('available',false,'commercial_explicit',NULL::boolean,'credit_explicit',NULL::boolean,
      'operational_commercial_registered',po.approved_at IS NOT NULL AND po.approved_by IS NOT NULL,
      'accounting_pending',true,'operational_blocked',true,'fiscal_blocked',true);
    BEGIN
      v_econ:=public.c2_pilot_economic_state_v1(po.id);
      IF (v_econ->>'available')::boolean IS TRUE AND v_econ->'evidence' IS NOT NULL AND v_econ->'evidence'<>'null'::jsonb THEN
        v_ev:=v_econ->'evidence';
        SELECT coalesce(bool_or(a.kind='commercial'),false),coalesce(bool_or(a.kind='credit'),false)
          INTO v_com,v_credit
          FROM platform_private.c2_pilot_econ_approvals_v1 a
          JOIN platform_private.c2_pilot_econ_allowlist_v1 g ON g.id=a.allowlist_id
          JOIN public.profiles ap ON ap.user_id=a.actor_id
          JOIN public.organizations ao ON ao.id=a.organization_id
          WHERE a.order_id=po.id AND a.organization_id=v_owner_org AND a.partner_id=po.partner_id
            AND a.approved_at IS NOT NULL AND a.actor_id IS NOT NULL
            AND a.evidence_hash=v_ev->>'evidence_hash' AND a.evidence=v_ev
            AND g.order_id=a.order_id AND g.organization_id=a.organization_id AND g.partner_id=a.partner_id
            AND g.actor_id=a.actor_id AND g.kind=a.kind AND g.revoked_at IS NULL
            AND g.valid_from<=clock_timestamp() AND g.valid_until>clock_timestamp()
            AND ap.ativo IS TRUE AND ap.organization_id=a.organization_id AND ao.ativo IS TRUE
            AND public.has_role(a.actor_id,a.actor_role::public.app_role);
        v_diag:=v_diag||jsonb_build_object('available',true,'commercial_explicit',v_com,'credit_explicit',v_credit);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL; -- unavailable is not absence
    END;
  END IF;
"""
    new=new.replace(anchor,block+anchor)
    tail="    'has_canceled_history', canceled);"
    assert new.count(tail)==1
    new=new.replace(tail,"    'has_canceled_history', canceled)||CASE WHEN v_diag IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('economicDiagnosis',v_diag) END;")
    (H/'diagnostic/candidate.sql').write_text(new)
    def guard(p,label):
        stm=[]
        for sig,pin in p.items():
            expected=json.dumps(pin,separators=(',',':')).replace("'","''")
            stm.append(f"IF (SELECT jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(p.proacl)x),'config',to_jsonb(p.proconfig),'secdef',p.prosecdef) FROM pg_proc p WHERE oid=to_regprocedure('{sig}')) IS DISTINCT FROM '{expected}'::jsonb THEN RAISE EXCEPTION '{label}_DRIFT:{sig}'; END IF;")
        return "DO $guard$ BEGIN "+'\n'.join(stm)+" END $guard$;\n"
    pre=guard(pins,'DIAGNOSTIC_PRE')
    (H/'diagnostic/01-pre.sql.readonly').write_text('BEGIN READ ONLY;\n'+pre+'ROLLBACK;\n')
    (H/'diagnostic/02-install.sql.review').write_text('BEGIN;\n'+pre+new+';\nCOMMIT;\n')
    # PostgreSQL functiondef canonical hash is measured after executing candidate locally.
    postfile=H/'capture/post-pins.json'
    if postfile.exists():
        post=json.loads(postfile.read_text());postguard=guard(post,'DIAGNOSTIC_POST')
        (H/'diagnostic/03-post.sql.readonly').write_text('BEGIN READ ONLY;\n'+postguard+'ROLLBACK;\n')
        (H/'diagnostic/04-rollback.sql.review').write_text('BEGIN;\n'+postguard+base+';\n'+pre+'COMMIT;\n')
    files=list((H/'diagnostic').glob('*'))+list((H/'capture').glob('*'))
    (H/'diagnostic/SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(H)}\n' for p in sorted(files) if p.is_file() and p.name!='SHA256SUMS'))
if __name__=='__main__':generate()