"""Candidate AR Bio x FSF Price schedule — OFFLINE COMPONENT ONLY, never runtime/SQL.

Owner decisions: up to 3 monthly installments, Price (interest on outstanding
balance); 1x -> 0%; 2x/3x -> 1.8% a.m. from the first period; 4+ rejected;
40% discount applied once; credit limit 100000; AR Bio creditor.
2026-10-29T17:49Z: first due = fiscal invoice (NF) issue date + 30 days; a late
or repeated manual generation never restarts the term.

Still CANDIDATE (not decided): civil-month clamp for later dues, business-day
rolling, pro-rata/irregular periods, and the credit exposure basis (principal
vs financed total). `production_eligibility` therefore always denies.
Historical titles (10300/7550 regressions) are never repriced here.
"""
from decimal import Decimal, ROUND_HALF_UP, getcontext, InvalidOperation
import calendar, datetime, json, sys, pathlib
from fractions import Fraction

getcontext().prec = 50
CENT = Decimal('0.01')
LIMIT = Decimal('100000.00')
DISCOUNT = Decimal('40')
RATE_BY_N = {1: Decimal('0'), 2: Decimal('1.8'), 3: Decimal('1.8')}
EXPOSURE_BASES = ('principal', 'financed_total')


class Rejected(Exception):
    pass


def money(v, label, allow_zero=False):
    """Explicit domain validation: only str/int/Decimal, finite, cents, sign."""
    if isinstance(v, bool) or isinstance(v, float) or v is None:
        raise Rejected(label + '_INVALID_TYPE')
    if not isinstance(v, (str, int, Decimal)):
        raise Rejected(label + '_INVALID_TYPE')
    try:
        d = Decimal(v.strip()) if isinstance(v, str) else Decimal(v)
    except (InvalidOperation, ValueError):
        raise Rejected(label + '_INVALID')
    if not d.is_finite():
        raise Rejected(label + '_NOT_FINITE')
    if d < 0 or (d == 0 and not allow_zero):
        raise Rejected(label + ('_NEGATIVE' if d < 0 else '_NOT_POSITIVE'))
    if d != d.quantize(CENT):
        raise Rejected(label + '_SUBCENT')
    return d.quantize(CENT)


def installments(n):
    if not isinstance(n, int) or isinstance(n, bool):
        raise Rejected('INSTALLMENTS_INVALID')
    if n < 1 or n > 3:
        raise Rejected('INSTALLMENTS_OUT_OF_RANGE')
    return n


def net_principal(table_amount):
    t = money(table_amount, 'TABLE')
    return (t * (Decimal(100) - DISCOUNT) / 100).quantize(CENT, ROUND_HALF_UP)


def price_schedule(principal, n):
    """Pure schedule; no credit/eligibility decision."""
    n = installments(n)
    p = money(principal, 'PRINCIPAL')
    i = RATE_BY_N[n] / 100
    pmt = p / n if i == 0 else p * i / (1 - (1 + i) ** (-n))
    pmt_c = pmt.quantize(CENT, ROUND_HALF_UP)
    bal, rows = p, []
    for k in range(1, n + 1):
        interest = (bal * i).quantize(CENT, ROUND_HALF_UP)
        amort = pmt_c - interest if k < n else bal  # last closes balance
        bal -= amort
        rows.append(dict(period=k, interest=interest, principal=amort,
                         payment=interest + amort, balance=bal))
    if any(r['principal'] <= 0 or r['payment'] <= 0 for r in rows) or bal != 0:
        raise Rejected('PLAN_NOT_REPRESENTABLE_IN_CENTS')
    return dict(principal=p, n=n, rate=RATE_BY_N[n], pmt_exact=pmt, rows=rows)


def credit_check(amount, exposure_before, credit_limit):
    lim = money(credit_limit, 'CREDIT_LIMIT', allow_zero=True)
    if lim == 0:
        raise Rejected('ZERO_CREDIT_LIMIT')
    exp = money(exposure_before, 'EXPOSURE', allow_zero=True)
    if exp + amount > lim:
        raise Rejected('LIMIT_EXCEEDED_BLOCK')
    return lim - exp - amount


def candidate_plan(principal, n, exposure_before, credit_limit, exposure_basis, generation='manual_authorized'):
    """Candidate API for offline tests. Requires an explicit exposure basis."""
    if generation != 'manual_authorized':
        raise Rejected('AUTO_GENERATION_BLOCKED')
    if exposure_basis not in EXPOSURE_BASES:
        raise Rejected('EXPOSURE_BASIS_REQUIRED')
    s = price_schedule(principal, n)
    amount = s['principal'] if exposure_basis == 'principal' else sum(r['payment'] for r in s['rows'])
    s['available_after'] = credit_check(amount, exposure_before, credit_limit)
    s['exposure_basis'] = exposure_basis
    return s


def production_eligibility(*_a, **_k):
    """Separated from the candidate API: production stays denied."""
    return dict(eligible=False, reasons=[
        'EXPOSURE_BASIS_UNPROVEN_IN_CONTRACT', 'CALENDAR_CLAMP_BUSINESS_DAY_PRORATA_UNDECIDED',
        'GENERATORS_WITHOUT_PRICE', 'PAYMENT_TERMS_NOT_DEFINED', 'C2_ACCOUNTING_PENDING',
        'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED', 'JWT_RLS_AB_NOT_PROVEN'])


def add_months_clamped(d, months):
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    return datetime.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def due_dates_candidate(nf_issue_date, n, generated_at=None):
    """Decided: first due = NF issue + 30 days. CANDIDATE: later dues are civil
    months from the first due with month-end clamp; no business-day rolling and
    no pro-rata are applied (not decided). generated_at never moves dates."""
    n = installments(n)
    if type(nf_issue_date) is not datetime.date:
        raise Rejected('NF_ISSUE_DATE_REQUIRED')
    if generated_at is not None:
        if type(generated_at) is not datetime.date:
            raise Rejected('GENERATED_AT_INVALID')
        if generated_at < nf_issue_date:
            raise Rejected('GENERATION_BEFORE_NF')
    first = nf_issue_date + datetime.timedelta(days=30)
    return [add_months_clamped(first, k) for k in range(n)]


# ---------- independent oracle (Fraction, own rounding, no shared helpers) ----
def _round_cent(f):
    q = f * 100
    sign = -1 if q < 0 else 1
    q = abs(q)
    whole = q.numerator // q.denominator
    if q - whole >= Fraction(1, 2):
        whole += 1
    return Fraction(sign * whole, 100)


def oracle_rows(p, n, rate_pct):
    P, i = Fraction(str(p)), Fraction(str(rate_pct)) / 100
    pmt = P / n if i == 0 else P * i * (1 + i) ** n / ((1 + i) ** n - 1)
    pmt = _round_cent(pmt)
    bal, out = P, []
    for k in range(n):
        it = _round_cent(bal * i)
        am = bal if k == n - 1 else pmt - it
        bal -= am
        fmt = lambda f: '%d.%02d' % divmod(int(f * 100), 100)
        out.append((fmt(it), fmt(am)))
    return out


def run(out=None):
    checks = []

    def check(name, expected, actual, mode='PRICE_GREEN'):
        checks.append(dict(test=name, expected=str(expected), actual=str(actual), mode=mode,
                           status='PASS' if expected == actual else 'FAIL'))

    def rejects(name, code, fn, mode='PRICE_GREEN'):
        try:
            fn(); actual = 'ACCEPTED'
        except Rejected as e:
            actual = str(e)
        except Exception as e:  # uncontrolled exception is a FAIL, not a reject
            actual = 'UNCONTROLLED:' + type(e).__name__
        check(name, code, actual, mode)

    q = lambda x: str(Decimal(x).quantize(CENT))
    p = net_principal('100000.00')
    check('discount 40% once', Decimal('60000.00'), p)
    check('discount odd cents', Decimal('0.01'), net_principal('0.02'))
    # Hard-coded independent vectors (computed outside the engine).
    s3 = price_schedule(p, 3); s2 = price_schedule(p, 2); s1 = price_schedule(p, 1)
    check('3x 60000 rows', [('1080.00', '19644.28'), ('726.40', '19997.88'), ('366.44', '20357.84')],
          [(q(r['interest']), q(r['principal'])) for r in s3['rows']])
    check('3x 60000 payments', ['20724.28', '20724.28', '20724.28'], [q(r['payment']) for r in s3['rows']])
    check('2x 60000 payments', ['30812.41', '30812.41'], [q(r['payment']) for r in s2['rows']])
    check('1x 60000 no interest', [('0.00', '60000.00')], [(q(r['interest']), q(r['principal'])) for r in s1['rows']])
    for n in (1, 2, 3):
        for principal in ('0.03', '0.07', '0.10', '1.00', '12345.67', '60000.00', '99999.99', '100000.00'):
            tag = f'{n}x {principal}'
            s = price_schedule(principal, n); rows = s['rows']
            check('oracle full rows ' + tag, oracle_rows(principal, n, s['rate']),
                  [(q(r['interest']), q(r['principal'])) for r in rows])
            check('sum principal ' + tag, Decimal(principal), sum(r['principal'] for r in rows))
            check('no zero/negative row ' + tag, True, all(r['principal'] > 0 and r['payment'] > 0 for r in rows))
            check('interest non-increasing ' + tag, True, all(a['interest'] >= b['interest'] for a, b in zip(rows, rows[1:])))
            check('first period interest ' + tag, (Decimal(principal) * RATE_BY_N[n] / 100).quantize(CENT, ROUND_HALF_UP), rows[0]['interest'])
    for principal, n in (('0.01', 2), ('0.01', 3), ('0.02', 3)):
        rejects(f'not representable {n}x {principal}', 'PLAN_NOT_REPRESENTABLE_IN_CENTS', lambda: price_schedule(principal, n))
    # Superseded rule (RED): whole principal compounded to last due.
    legacy3 = (p * Decimal('1.018') ** 3).quantize(CENT, ROUND_HALF_UP)
    check('RED legacy full-term 3m total', Decimal('63298.67'), legacy3, 'PRICE_RED_SUPERSEDED')
    check('RED legacy overcharge vs Price', Decimal('1125.83'), legacy3 - sum(r['payment'] for r in s3['rows']), 'PRICE_RED_SUPERSEDED')
    # Financed total is not reused as principal (no double interest).
    total3 = sum(r['payment'] for r in s3['rows'])
    check('financed total', Decimal('62172.84'), total3)
    check('total interest = total - principal', total3 - p, sum(r['interest'] for r in s3['rows']))
    # Input validation (each must be a controlled domain error).
    bad = [('NaN', 'NOT_FINITE'), ('Infinity', 'NOT_FINITE'), ('-Infinity', 'NOT_FINITE'), ('sNaN', 'NOT_FINITE'),
           ('abc', 'INVALID'), ('', 'INVALID'), (True, 'INVALID_TYPE'), (60000.0, 'INVALID_TYPE'), (None, 'INVALID_TYPE'),
           ([1], 'INVALID_TYPE'), ('1.001', 'SUBCENT'), ('-1', 'NEGATIVE'), ('0', 'NOT_POSITIVE')]
    for v, code in bad:
        rejects(f'principal {v!r}', 'PRINCIPAL_' + code, lambda: price_schedule(v, 2))
        lim_code = 'ZERO_CREDIT_LIMIT' if code == 'NOT_POSITIVE' else 'CREDIT_LIMIT_' + code
        rejects(f'credit_limit {v!r}', lim_code, lambda: candidate_plan(p, 2, '0', v, 'principal'))
        exp_code = None if code == 'NOT_POSITIVE' else 'EXPOSURE_' + code
        if exp_code:
            rejects(f'exposure {v!r}', exp_code, lambda: candidate_plan(p, 2, v, LIMIT, 'principal'))
    for n, code in ((4, 'INSTALLMENTS_OUT_OF_RANGE'), (0, 'INSTALLMENTS_OUT_OF_RANGE'), (True, 'INSTALLMENTS_INVALID'), (2.0, 'INSTALLMENTS_INVALID'), ('2', 'INSTALLMENTS_INVALID')):
        rejects(f'schedule n={n!r}', code, lambda: price_schedule(p, n))
        rejects(f'dates n={n!r}', code, lambda: due_dates_candidate(datetime.date(2026, 1, 1), n))
    # Credit: negative exposure can no longer open room past the limit.
    rejects('negative exposure cannot widen limit', 'EXPOSURE_NEGATIVE', lambda: candidate_plan('100000.00', 1, '-50000', LIMIT, 'principal'))
    rejects('limit exceeded', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan('100000.01', 1, '0', LIMIT, 'principal'))
    check('exact limit accepted principal basis', Decimal('0.00'), candidate_plan('100000.00', 1, '0', LIMIT, 'principal')['available_after'])
    # Basis ambiguity: same operation passes on principal and fails on financed total.
    check('principal basis fits', Decimal('0.00'), candidate_plan('60000.00', 3, '40000.00', LIMIT, 'principal')['available_after'])
    rejects('financed basis exceeds', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan('60000.00', 3, '40000.00', LIMIT, 'financed_total'))
    rejects('basis required', 'EXPOSURE_BASIS_REQUIRED', lambda: candidate_plan(p, 3, '0', LIMIT, None))
    for _ in range(2):
        rejects('automatic generation blocked (replay)', 'AUTO_GENERATION_BLOCKED', lambda: candidate_plan(p, 2, '0', LIMIT, 'principal', 'automatic'))
    check('production eligibility denied', False, production_eligibility(p, 3)['eligible'], 'PRODUCTION_GATE')
    check('production reasons include basis', True, 'EXPOSURE_BASIS_UNPROVEN_IN_CONTRACT' in production_eligibility()['reasons'], 'PRODUCTION_GATE')
    # Dates: NF anchor decided; later dues candidate only.
    D = datetime.date
    for nf, expected in [
        (D(2026, 1, 1), ['2026-01-31', '2026-02-28', '2026-03-31']),
        (D(2027, 12, 31), ['2028-01-30', '2028-02-29', '2028-03-30']),
        (D(2026, 1, 29), ['2026-02-28', '2026-03-28', '2026-04-28']),
        (D(2026, 12, 2), ['2027-01-01', '2027-02-01', '2027-03-01']),
        (D(2026, 3, 1), ['2026-03-31', '2026-04-30', '2026-05-31']),
        (D(2023, 12, 31), ['2024-01-30', '2024-02-29', '2024-03-30']),
    ]:
        got = [d.isoformat() for d in due_dates_candidate(nf, 3)]
        check('NF+30 first due ' + nf.isoformat(), (nf + datetime.timedelta(days=30)).isoformat(), got[0], 'NF_ANCHOR_DECIDED')
        check('later dues candidate ' + nf.isoformat(), expected[1:], got[1:], 'CALENDAR_CANDIDATE_ONLY')
    nf = D(2026, 11, 3)
    base = due_dates_candidate(nf, 3)
    for late in (D(2026, 11, 3), D(2026, 11, 20), D(2027, 1, 15)):
        check('late manual generation keeps NF due ' + late.isoformat(), base, due_dates_candidate(nf, 3, generated_at=late), 'NF_ANCHOR_DECIDED')
    check('replay twice same dates', base, due_dates_candidate(nf, 3, generated_at=D(2027, 1, 15)), 'NF_ANCHOR_DECIDED')
    for v, code in ((None, 'NF_ISSUE_DATE_REQUIRED'), ('2026-11-03', 'NF_ISSUE_DATE_REQUIRED'), (datetime.datetime(2026, 11, 3), 'NF_ISSUE_DATE_REQUIRED')):
        rejects(f'nf date {v!r}', code, lambda: due_dates_candidate(v, 2))
    rejects('generation before NF', 'GENERATION_BEFORE_NF', lambda: due_dates_candidate(nf, 2, generated_at=D(2026, 11, 2)))
    rejects('generated_at string', 'GENERATED_AT_INVALID', lambda: due_dates_candidate(nf, 2, generated_at='2026-11-20'))
    summary = {}
    for c in checks:
        summary.setdefault(c['mode'], {}).setdefault(c['status'], 0)
        summary[c['mode']][c['status']] += 1
    blocked = ['PG end-to-end: captured generators implement no Price schedule and billing stays denied (PAYMENT_TERMS_NOT_DEFINED, C2_ACCOUNTING_PENDING, B2B_INTERNAL_DOWNSTREAM_UNVERIFIED); component tests only',
               'Exposure basis principal vs financed total not proven in contract (captured fn_b2b_credit_exposure uses original_amount-received and final_amount_with_interest)',
               'Later-due civil-month clamp, business-day rolling and pro-rata remain candidate/undecided',
               'Fiscal/accounting provenance and real JWT/RLS A/B']
    result = dict(checks=checks, summary=summary, blocked=blocked, fail=sum(c['status'] == 'FAIL' for c in checks))
    if out:
        pathlib.Path(out).write_text(json.dumps(result, indent=1, default=str))
    return result


if __name__ == '__main__':
    r = run(sys.argv[1] if len(sys.argv) > 1 else None)
    print(json.dumps(dict(total=len(r['checks']), fail=r['fail'], summary=r['summary']), default=str))
    for c in r['checks']:
        if c['status'] == 'FAIL':
            print('FAIL', c)
    raise SystemExit(1 if r['fail'] else 0)
