"""Review cf7d5fb/214 (2): forecast creation pilot. Disposable PG, synthetic Auth only.

Out of pilot the three approvals must keep the ORIGINAL LIVE result/effects (differential
against the captured LIVE bodies inside a rolled-back transaction): no forecast and no new
failure, including a legacy order without internal_economic_snapshot. Pilot: exact short grant;
revocation / gate OFF with a PROVEN waiter (pg_blocking_pids) deny creation only.
"""
import json
import uuid
from pathlib import Path

H = Path(__file__).resolve().parent
CAPTURE5 = H / 'forecast-pre-nf-20261109/capture-5-functions-20261109.json'
LIVE_FUNCS = ('approve_b2b_credit', 'approve_b2b_payment_terms_secure', 'approve_partner_order')
VOLATILE = {'updated_at', 'approved_at', 'credit_approved_at', 'created_at', 'financial_approved_at', 'reviewed_at'}


def claims(uid):
    return json.dumps({'sub': uid, 'role': 'authenticated', 'iat': 1, 'exp': 4102444800}, separators=(',', ':'))


def step_sql(name, uid, call):
    c = claims(uid).replace("'", "''")
    call_sql = call.replace("'", "''")
    return f"""DO $d$ DECLARE r text; BEGIN
 BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub','{uid}',true);
  PERFORM set_config('request.jwt.claims','{c}',true);
  EXECUTE 'SELECT ({call_sql})::text' INTO r;
  PERFORM set_config('role','none',true);
  INSERT INTO pg_temp._fc_steps VALUES('{name}',true,NULL,NULL,r);
 EXCEPTION WHEN OTHERS THEN
  INSERT INTO pg_temp._fc_steps VALUES('{name}',false,SQLSTATE,SQLERRM,NULL);
 END;
END $d$;
"""


def effects_sql(order):
    return f"""SELECT jsonb_build_object(
 'steps',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ord) FROM (SELECT row_number() OVER () ord,* FROM pg_temp._fc_steps) s),
 'order',(SELECT to_jsonb(po) FROM public.partner_orders po WHERE po.id='{order}'),
 'terms',(SELECT to_jsonb(t) FROM public.partner_order_payment_terms t WHERE t.partner_order_id='{order}'),
 'audit',(SELECT coalesce(jsonb_agg(a.acao ORDER BY a.created_at,a.acao),'[]') FROM public.partner_order_audit_logs a WHERE a.order_id='{order}'),
 'notifications',(SELECT count(*) FROM public.notificacoes_operacionais n WHERE n.tipo LIKE 'b2b%'),
 'forecasts',(SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}'),
 'receivables',(SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order}'),
 'schedule',(SELECT count(*) FROM public.partner_order_payment_schedule WHERE partner_order_id='{order}'))::text;"""


def strip(v):
    if isinstance(v, dict):
        return {k: strip(x) for k, x in v.items() if k not in VOLATILE}
    if isinstance(v, list):
        return [strip(x) for x in v]
    return v


class Run:
    def __init__(self, B, Q, OUT, barrier):
        self.B, self.Q, self.OUT, self.barrier = B, Q, OUT, barrier
        self.live = {r['proname']: r['definition'] for r in json.loads(CAPTURE5.read_text())['functions'] if r['proname'] in LIVE_FUNCS}
        self.results = []

    def new_order(self, label):
        Q, B = self.Q, self.B
        choice = Q.ch('boleto', 2, 30)
        simulated, error = Q.sim(Q.UBC, Q.P3, [Q.S(2)], choice, partner=Q.PC)
        assert simulated is not None, (label, error)
        journal, error = Q.call(Q.UBC, f"public.recover_partner_order_attempt_v1('{Q.PC}',NULL,NULL,false,NULL)")
        assert journal is not None, (label, error)
        if journal['state'] == 'committed':
            journal, error = Q.call(Q.UBC, f"public.recover_partner_order_attempt_v1('{Q.PC}','{journal['key']}',{journal['generation']},true,'{journal['order_id']}')")
            assert journal is not None, (label, error)
        assert journal['state'] == 'reserved', (label, journal)
        Q._forecast_auto_grant = False          # out-of-pilot by construction
        try:
            created, error = Q.create(Q.UBC, Q.P3, [Q.S(2)], simulated['cart_hash'], journal['key'], choice, partner=Q.PC)
        finally:
            Q._forecast_auto_grant = True
        assert created is not None, (label, error)
        return created['id']

    def sequence(self, order):
        Q = self.Q
        return [('credit', Q.UFIN, f"public.approve_b2b_credit('{order}','FC CREDIT')"),
                ('terms', Q.UFIN, f"public.approve_b2b_payment_terms_secure('{order}','FC TERMS')"),
                ('commercial', Q.UADM, f"public.approve_partner_order('{order}',NULL,NULL)")]

    def run_sequence(self, order, live_bodies, commit, seq=None):
        body = "CREATE TEMP TABLE IF NOT EXISTS _fc_steps(step text,ok boolean,sqlstate text,message text,ret text);TRUNCATE pg_temp._fc_steps;GRANT ALL ON pg_temp._fc_steps TO authenticated;\n"
        if live_bodies:
            body += ''.join(self.live[n].rstrip().rstrip(';') + ';\n' for n in LIVE_FUNCS)
        body += ''.join(step_sql(n, u, c) for n, u, c in (seq or self.sequence(order)))
        out = self.B.run_raw('BEGIN;\n' + body + effects_sql(order) + ('\nCOMMIT;' if commit else '\nROLLBACK;'))
        assert out.returncode == 0, out.stderr[-1500:]
        line = [l for l in out.stdout.splitlines() if l.startswith('{')][-1]
        return json.loads(line)

    def differential(self, order, label):
        live = self.run_sequence(order, True, False)
        cand = self.run_sequence(order, False, False)
        steps = []
        for a, b in zip(live['steps'], cand['steps']):
            steps.append(dict(step=a['step'], live_ok=a['ok'], candidate_ok=b['ok'], live_error=a['message'], candidate_error=b['message'],
                              live_ret=a['ret'], candidate_ret=b['ret']))
            assert not (a['ok'] and not b['ok']), ('NEW_FAILURE_OUT_OF_PILOT', label, a, b)
        assert cand['forecasts'] == 0 and cand['receivables'] == 0, (label, cand)
        same = all(s['live_ok'] == s['candidate_ok'] for s in steps)
        effects_equal = strip({k: live[k] for k in ('order', 'terms', 'audit', 'notifications', 'schedule')}) == strip({k: cand[k] for k in ('order', 'terms', 'audit', 'notifications', 'schedule')})
        diffs = {}
        if not effects_equal:
            for k in ('order', 'terms'):
                lv, cv = strip(live[k]) or {}, strip(cand[k]) or {}
                diffs[k] = {f: [lv.get(f), cv.get(f)] for f in set(lv) | set(cv) if lv.get(f) != cv.get(f)}
            for k in ('audit', 'notifications', 'schedule'):
                if live[k] != cand[k]:
                    diffs[k] = [live[k], cand[k]]
        return dict(label=label, steps=steps, same_step_outcomes=same, effects_equal=effects_equal, effect_diffs=diffs,
                    live_forecasts=live['forecasts'], candidate_forecasts=cand['forecasts'], rolled_back=True)

    def grant(self, order, actor, org=None, partner=None, minutes=30):
        Q = self.Q
        gid = str(uuid.uuid4())
        self.B.sql(f"INSERT INTO platform_private.b2b_forecast_creation_allowlist_v1(id,actor_id,organization_id,partner_id,order_id,valid_until,created_by) VALUES('{gid}','{actor}','{org or Q.A}','{partner or Q.PC}','{order}',now()+interval '{minutes} minutes','{Q.UADM}');")
        return gid

    def forecasts(self, order):
        return int(self.B.last(f"SELECT count(*) FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}';"))

    def prepare_until_final(self, order):
        """Credit + terms by the real canonical writers; final commercial approval left for the case."""
        Q = self.Q
        for name, uid, call in self.sequence(order)[:2]:
            r = Q.as_user(uid, f"SELECT {call};")
            assert r.returncode == 0, (name, r.stderr[-600:])
        assert self.forecasts(order) == 0

    def final_sql(self, order):
        Q = self.Q
        return f"SET ROLE authenticated; SET request.jwt.claim.sub='{Q.UADM}'; SET request.jwt.claims='{claims(Q.UADM)}';SELECT public.approve_partner_order('{order}',NULL,NULL);"

    def case(self, name, fn):
        try:
            self.results.append(dict(name=name, status='PASS', detail=fn()))
        except Exception as exc:
            self.results.append(dict(name=name, status='FAIL', error=repr(exc)[:3000]))

    def out_of_pilot(self):
        order = self.new_order('out-of-pilot')
        d = self.differential(order, 'out-of-pilot snapshot order, gate ENABLED, no grant')
        real = self.run_sequence(order, False, True)
        assert real['forecasts'] == 0 and all(s['ok'] for s in real['steps']) is all(s['candidate_ok'] for s in d['steps']), real
        d['committed_candidate'] = dict(steps=real['steps'], forecasts=real['forecasts'], status=real['order']['status'])
        return d

    def legacy_no_snapshot(self):
        order = self.new_order('legacy-no-snapshot')
        # Declared fixture seam: legacy shape (NULL economic snapshot) via replica role; no guard disabled at call time.
        self.B.sql(f"SET session_replication_role=replica;UPDATE public.partner_orders SET internal_economic_snapshot=NULL WHERE id='{order}';SET session_replication_role=origin;")
        assert self.B.last(f"SELECT internal_economic_snapshot IS NULL FROM public.partner_orders WHERE id='{order}';") == 't'
        d = self.differential(order, 'legacy order without internal_economic_snapshot, no grant')
        assert not any('B2B_FORECAST' in (s['candidate_error'] or '') for s in d['steps']), d
        return d

    def pilot_legit(self):
        order = self.new_order('pilot')
        self.prepare_until_final(order)
        gid = self.grant(order, self.Q.UADM)
        r = self.B.run_raw(self.final_sql(order))
        assert r.returncode == 0, r.stderr[-600:]
        row = json.loads(self.B.last(f"SELECT jsonb_build_object('n',count(*),'state',min(state),'credit',bool_and(credit_decision_snapshot IS NOT NULL),'residual',min(residual_amount),'total',min(total_amount))::text FROM platform_private.b2b_financial_forecasts WHERE order_id='{order}';"))
        assert row['n'] == 1 and row['state'] == 'aguardando_fiscal' and row['credit'] and row['residual'] == row['total'], row
        assert self.B.last(f"SELECT count(*) FROM public.accounts_receivable WHERE origin_id='{order}';") == '0'
        return dict(order=order, grant=gid, forecast=row)

    def _wait_case(self, kind):
        order = self.new_order('wait-' + kind)
        self.prepare_until_final(order)
        gid = self.grant(order, self.Q.UADM)
        if kind == 'revoke':
            lock = f"SELECT id FROM platform_private.b2b_forecast_creation_allowlist_v1 WHERE id='{gid}' FOR UPDATE;"
            mut = f"UPDATE platform_private.b2b_forecast_creation_allowlist_v1 SET revoked_at=clock_timestamp(),revoke_reason='FC_WAIT_REVOKE' WHERE id='{gid}';"
        else:
            lock = "SELECT singleton FROM platform_private.b2b_forecast_creation_gate_v1 WHERE singleton FOR UPDATE;"
            mut = "UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false,reason='FC_WAIT_GATE_OFF' WHERE singleton;"
        called, proof = self.barrier.revoke_after_proven_wait(self.B, lock, self.final_sql(order), mut)
        if kind == 'gate_off':
            self.B.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=true,reason='FC_LOCAL_REENABLE' WHERE singleton;")
        assert called.returncode == 0, called.stderr[-600:]
        status = self.B.last(f"SELECT status FROM public.partner_orders WHERE id='{order}';")
        assert status == 'aprovado' and self.forecasts(order) == 0, (status, self.forecasts(order))
        return dict(order=order, approval_status=status, forecasts=0, barrier=proof)

    def gate_closed(self):
        order = self.new_order('gate-closed')
        self.prepare_until_final(order)
        self.grant(order, self.Q.UADM)
        self.B.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false,reason='FC_CLOSED_CASE' WHERE singleton;")
        try:
            r = self.B.run_raw(self.final_sql(order))
        finally:
            self.B.sql("UPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=true,reason='FC_LOCAL_REENABLE' WHERE singleton;")
        assert r.returncode == 0 and self.forecasts(order) == 0, (r.stderr[-400:], self.forecasts(order))
        return dict(order=order, forecasts=0)

    def wrong_scope(self):
        Q = self.Q
        out = {}
        for label, kw in (('other_actor', dict(actor=Q.UFIN)), ('other_org', dict(actor=Q.UADM, org=str(uuid.uuid4()))),
                          ('other_partner', dict(actor=Q.UADM, partner=Q.P)), ('expired', dict(actor=Q.UADM, minutes=-1))):
            order = self.new_order('scope-' + label)
            self.prepare_until_final(order)
            if label == 'expired':
                self.B.sql(f"INSERT INTO platform_private.b2b_forecast_creation_allowlist_v1(actor_id,organization_id,partner_id,order_id,valid_from,valid_until) VALUES('{Q.UADM}','{Q.A}','{Q.PC}','{order}',now()-interval '2 hours',now()-interval '1 minute');")
            else:
                self.grant(order, kw['actor'], kw.get('org'), kw.get('partner'))
            r = self.B.run_raw(self.final_sql(order))
            assert r.returncode == 0 and self.forecasts(order) == 0, (label, r.stderr[-400:])
            out[label] = dict(order=order, forecasts=0)
        long_grant = self.B.run_raw(f"INSERT INTO platform_private.b2b_forecast_creation_allowlist_v1(actor_id,organization_id,partner_id,order_id,valid_until) VALUES('{Q.UADM}','{Q.A}','{Q.PC}','{uuid.uuid4()}',now()+interval '5 hours');")
        assert long_grant.returncode != 0 and '23514' in long_grant.stderr, long_grant.stderr
        out['grant_over_4h_rejected'] = '23514'
        for role in ('authenticated', 'service_role'):
            d = self.B.run_raw(f"SET ROLE {role};SELECT count(*) FROM platform_private.b2b_forecast_creation_allowlist_v1;")
            assert d.returncode != 0 and 'permission denied' in d.stderr, (role, d.stderr)
            out[f'{role}_table_denied'] = True
        return out

    def run(self):
        self.case('out_of_pilot_differential_live_vs_candidate', self.out_of_pilot)
        self.case('legacy_without_snapshot_differential', self.legacy_no_snapshot)
        self.case('pilot_exact_grant_creates_one_forecast', self.pilot_legit)
        self.case('grant_revoked_during_proven_wait', lambda: self._wait_case('revoke'))
        self.case('gate_off_during_proven_wait', lambda: self._wait_case('gate_off'))
        self.case('gate_closed_with_valid_grant', self.gate_closed)
        self.case('grant_scope_mismatch_and_acl', self.wrong_scope)
        (self.OUT / 'forecast-creation-pilot.json').write_text(json.dumps(dict(results=self.results, hosted=False,
            auth='SYNTHETIC SQL-role authenticated; not JWT/RLS proof'), indent=2) + '\n')
        failed = [r for r in self.results if r['status'] != 'PASS']
        assert not failed, failed
        return self.results


def run(B, Q, OUT, barrier):
    return Run(B, Q, OUT, barrier).run()
