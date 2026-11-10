"""Local canonical wrapper containment; never hosted or a release certificate."""
import json
from lifecycle_lock_barrier import assert_authorization_control, revoke_after_proven_wait


def grant_sql(Q, order, partner):
    return f"""INSERT INTO platform_private.b2b_forecast_lifecycle_allowlist_v1
      (operation,actor_id,organization_id,partner_id,order_id,valid_until)
      SELECT op,actor,'{Q.A}','{partner}','{order}',clock_timestamp()+interval '1 hour'
      FROM unnest(ARRAY['forecast_sync','forecast_cancel','forecast_begin']) op
      CROSS JOIN unnest(ARRAY['{Q.UADM}'::uuid,'{Q.UFIN}'::uuid]) actor;"""


def run(B, Q, OUT, order, doc, version):
    from forecast_residual_scenario import forecast_row
    assert B.last("SELECT count(*) FROM platform_private.b2b_forecast_lifecycle_allowlist_v1;") == '0'
    assert B.last("SELECT enabled::text FROM platform_private.b2b_forecast_lifecycle_gate_v1 WHERE singleton;") == 'false'
    assert B.last("SELECT enabled::text FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == 'false'
    before = forecast_row(B, order)
    claims = json.dumps({'sub': Q.UFIN, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800})
    ctx = f"SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claim.sub='{Q.UFIN}';SET LOCAL request.jwt.claims='{claims}';"
    calls = {
        'forecast_sync': f"SELECT public.rpc_b2b_forecast_fiscal_sync_v1('{doc['tx']}',{version});",
        'forecast_cancel': f"SELECT public.rpc_b2b_forecast_cancel_residual_v1('{order}',{version},'LOCAL REVIEW');",
    }
    for op, call in calls.items():
        r=B.run_raw('BEGIN ISOLATION LEVEL REPEATABLE READ;'+ctx+call+'ROLLBACK;')
        assert r.returncode!=0 and '42501' in r.stderr and 'READ_COMMITTED_REQUIRED' in r.stderr,r.stderr
    rows = []
    def expect(name, sql, token):
        r = B.run_raw(sql)
        rows.append(dict(case=name, exit=r.returncode, stdout=r.stdout, stderr=r.stderr, expected=token))
        (OUT/'lifecycle-containment.json').write_text(json.dumps(dict(hosted=False, synthetic_auth=True, checks=rows), indent=2)+'\n')
        assert r.returncode != 0 and '42501' in r.stderr and token in r.stderr, rows[-1]
        assert forecast_row(B, order) == before
    # A historical forecast, valid role and existing physical/read grants do not authorize these operations.
    for op, call in calls.items():
        expect(op+'-installed-closed', 'BEGIN;'+ctx+call+'ROLLBACK;', 'B2B_FORECAST_')
    grant = grant_sql(Q, order, Q.P)
    gate_on = "UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=true WHERE singleton;"
    logistics_on = "UPDATE platform_private.b2b_resale_logistics_gate_v1 SET enabled=true WHERE singleton;"
    for feature in ('pedidos_b2b', 'contas_receber'):
        for op, call in calls.items():
            expect(op+'-feature-off-'+feature, 'BEGIN;'+grant+gate_on+
                   f"UPDATE public.saas_features SET active=false WHERE key='{feature}';"+ctx+call+'ROLLBACK;', 'B2B_FORECAST_FEATURE_DENIED')
    variants = {
        'gate-off': "UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=false WHERE singleton;",
        # Inverse: open LOGISTICS gate never authorizes lifecycle when its own gate is off.
        'logistics-open-lifecycle-off': "UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=false WHERE singleton;"+logistics_on,
        'logistics-open-no-lifecycle-grant': "DELETE FROM platform_private.b2b_forecast_lifecycle_allowlist_v1;"+logistics_on,
        'other-operation-only': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET operation='forecast_begin';",
        'revoked': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=clock_timestamp();",
        'expired': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET valid_from=clock_timestamp()-interval '2 hours',valid_until=clock_timestamp()-interval '1 hour';",
        'wrong-order': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET order_id=gen_random_uuid();",
        'wrong-actor': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET actor_id=gen_random_uuid();",
        'wrong-tenant': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET organization_id=gen_random_uuid();",
        'wrong-partner': "UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET partner_id=gen_random_uuid();",
    }
    for name, change in variants.items():
        # Mutate only lifecycle grants, never legacy physical/read grant shapes.
        if change.startswith('UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1') and ' WHERE ' not in change:
            change=change.rstrip(';')+" WHERE operation IN ('forecast_sync','forecast_cancel');"
        for op, call in calls.items():
            expect(op+'-'+name, 'BEGIN;'+grant+gate_on+change+ctx+call+'ROLLBACK;', 'B2B_FORECAST_')
    # Permission checks must still pass when exact local grants are enabled.
    B.sql(grant+gate_on)
    assert B.last("SELECT enabled::text FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == 'false'
    for op, call in calls.items():
        # Same live transmission remains in flight: passing authority must NOT
        # imply cancellation success, and must not relax the business guard.
        r=B.run_raw('BEGIN;'+ctx+call+'ROLLBACK;')
        classification=assert_authorization_control(op,r)
        rows.append(dict(case=op+'-exact-authorization-control',exit=r.returncode,
                         stdout=r.stdout,stderr=r.stderr,classification=classification,
                         functional_cancel_success=False))
        assert forecast_row(B,order)==before
    # Revoke during aggregate wait. No trigger/body/role alteration or forecast UPDATE.
    for op, call in calls.items():
        mutations = {
            'gate': ("UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=false WHERE singleton;",gate_on),
            'pilot': (f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=clock_timestamp() WHERE operation='{op}';",f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=NULL WHERE operation='{op}';"),
            'pedidos_b2b': ("UPDATE public.saas_features SET active=false WHERE key='pedidos_b2b';","UPDATE public.saas_features SET active=true WHERE key='pedidos_b2b';"),
            'contas_receber': ("UPDATE public.saas_features SET active=false WHERE key='contas_receber';","UPDATE public.saas_features SET active=true WHERE key='contas_receber';"),
            'role': (f"UPDATE public.user_roles SET role='tecnico_agronomo' WHERE user_id='{Q.UFIN}' AND role='financeiro';",f"UPDATE public.user_roles SET role='financeiro' WHERE user_id='{Q.UFIN}' AND role='tecnico_agronomo';"),
            'tenant': (f"UPDATE public.organizations SET ativo=false WHERE id='{Q.A}';",f"UPDATE public.organizations SET ativo=true WHERE id='{Q.A}';"),
        }
        for name, (change, restore) in mutations.items():
            # Hold the shared aggregate without a timed release; dispatch only
            # after holder readiness, then revoke only after proven caller wait.
            lock = f"SELECT id FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}' FOR UPDATE;"
            called,barrier=revoke_after_proven_wait(B,lock,'BEGIN;'+ctx+call+'COMMIT;',change)
            rows.append(dict(case=op+'-revoked-after-wait-'+name,exit=called.returncode,
                             stderr=called.stderr,barrier=barrier))
            assert called.returncode!=0 and '42501' in called.stderr and 'B2B_FORECAST_' in called.stderr,rows[-1]
            assert forecast_row(B,order)==before
            B.sql(restore)
            expect(op+'-post-revocation-'+name,'BEGIN;'+change+ctx+call+'ROLLBACK;','B2B_FORECAST_')
    own_locks = {
        'own-allowlist': lambda op: f"SELECT id FROM platform_private.b2b_forecast_lifecycle_allowlist_v1 WHERE operation='{op}' AND actor_id='{Q.UFIN}' FOR UPDATE;",
        'own-gate': lambda op: "SELECT singleton FROM platform_private.b2b_forecast_lifecycle_gate_v1 WHERE singleton FOR UPDATE;",
    }
    for op, call in calls.items():
        for lk, lock_fn in own_locks.items():
            for name, (change, restore) in (
                ('gate-off', ("UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=false WHERE singleton;", gate_on)),
                ('grant-revoked', (f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=clock_timestamp() WHERE operation='{op}';",
                                   f"UPDATE platform_private.b2b_forecast_lifecycle_allowlist_v1 SET revoked_at=NULL WHERE operation='{op}';"))):
                called, barrier = revoke_after_proven_wait(B, lock_fn(op), 'BEGIN;'+ctx+call+'COMMIT;', change)
                rows.append(dict(case=f'{op}-wait-in-{lk}-{name}', holder_lock=lock_fn(op), exit=called.returncode,
                                 stderr=called.stderr, barrier=barrier))
                assert called.returncode!=0 and 'B2B_FORECAST_PILOT_DENIED' in called.stderr, rows[-1]
                assert forecast_row(B, order) == before
                B.sql(restore)
    assert B.last("SELECT enabled::text FROM platform_private.b2b_resale_logistics_gate_v1 WHERE singleton;") == 'false'
    (OUT/'lifecycle-containment.json').write_text(json.dumps(dict(hosted=False,synthetic_auth=True,checks=rows,logistics_gate_open_during_positive=False,positive_projection='BLOCKED_NOT_REPLACED_BY_NEGATIVE',authorization_source='canonical entitlement + OWN lifecycle gate/allowlist (decoupled from logistics), not forecast'),indent=2)+'\n')
    return rows