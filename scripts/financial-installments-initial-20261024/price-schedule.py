"""Candidate AR Bio x FSF Price schedule — OFFLINE COMPONENT ONLY, never runtime/SQL.

Owner decisions: up to 3 monthly installments, Price (interest on outstanding
balance); 1x -> 0%; 2x/3x -> 1.8% a.m. from the first period; 4+ rejected;
40% discount applied once; credit limit 100000; AR Bio creditor.
2026-10-29T17:49Z: first due = fiscal invoice (NF) issue date + 30 days; a late
or repeated manual generation never restarts the term.

Decided 2026-10-29 (owner confirmation; applied 18:00Z): civil-month clamp (same day of the first nominal in
following months, last day of a shorter month), pro-rata fixed monthly Price
(no per-day adjustment), credit exposure basis = financed total including
interest (rounded installment sum). Business-day rolling is decided in
principle (next business day, no extra interest) but still requires the real
locality calendar (Paracatu-MG v2 dataset 2026-2027; 2028+ uncovered); `production_eligibility`
therefore still denies.
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
EXPOSURE_BASES = ('financed_total',)
MAX_MONEY = Decimal('1000000000000')


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
    if abs(d) > MAX_MONEY:
        raise Rejected(label + '_OUT_OF_RANGE')
    try:
        qd = d.quantize(CENT)
    except InvalidOperation:
        raise Rejected(label + '_OUT_OF_RANGE')
    if d < 0 or (d == 0 and not allow_zero):
        raise Rejected(label + ('_NEGATIVE' if d < 0 else '_NOT_POSITIVE'))
    if d != qd:
        raise Rejected(label + '_SUBCENT')
    return qd


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
    if exposure_basis == 'principal':
        raise Rejected('EXPOSURE_BASIS_PRINCIPAL_REJECTED')
    if exposure_basis not in EXPOSURE_BASES:
        raise Rejected('EXPOSURE_BASIS_REQUIRED')
    s = price_schedule(principal, n)
    amount = s['principal'] if exposure_basis == 'principal' else sum(r['payment'] for r in s['rows'])
    s['available_after'] = credit_check(amount, exposure_before, credit_limit)
    s['exposure_basis'] = exposure_basis
    return s


SUPERSEDED_ROOT_KEYS = ('formula', 'policies', 'reference_vectors', 'boundary_fixtures', 'interest_decision', 'owner_override', 'technical_proposals')


def resolve_new_plan_policy(policy, n, rate_request=None):
    """Offline reader: new plans resolve ONLY from active_candidate; any
    superseded rule at the root or an unresolved contradiction fails closed."""
    if policy.get('runtime_enabled') is not False:
        raise Rejected('RUNTIME_MUST_STAY_DISABLED')
    leaked = [k for k in SUPERSEDED_ROOT_KEYS if k in policy]
    if leaked:
        raise Rejected('SUPERSEDED_RULE_AT_ROOT')
    a = policy.get('active_candidate')
    if not a or policy.get('authority', {}).get('new_plans_may_use_only') != 'active_candidate':
        raise Rejected('ACTIVE_CANDIDATE_MISSING')
    if policy['credit'].get('credit_limit') != a['credit_limit']:
        raise Rejected('CREDIT_LIMIT_CONTRADICTION')
    if a['system'] != 'price_interest_on_outstanding_balance' or a['receivable_generation'] != 'manual_authorized_only':
        raise Rejected('ACTIVE_CANDIDATE_CONTRADICTION')
    n = installments(n)
    if n > a['installments']['max']:
        raise Rejected('INSTALLMENTS_OUT_OF_RANGE')
    rate = Decimal(a['rates']['n1_30d' if n == 1 else 'n%d' % n])
    if rate != RATE_BY_N[n] or (rate_request is not None and Decimal(str(rate_request)) != rate):
        raise Rejected('RATE_NOT_FROM_ACTIVE_CANDIDATE')
    if a.get('exposure_basis') != 'financed_total_rounded_sum_of_installments_including_interest' or a.get('pro_rata') != 'none':
        raise Rejected('ACTIVE_CANDIDATE_CONTRADICTION')
    return dict(n=n, rate=rate, credit_limit=money(a['credit_limit'], 'CREDIT_LIMIT'), first_due=a['first_due'], exposure_basis='financed_total')


REQUIRED_LOCALITY = 'Paracatu-MG'
CALENDAR_SCHEMA = 'cultivofarm.holiday-calendar.v1'
# Coverage/locality are sealed with the data: widening coverage cannot turn
# unknown dates into business days.
INTEGRITY_FIELDS = ('schema', 'version', 'locality', 'kind', 'coverage_start', 'coverage_end', 'consulted_on', 'sources', 'data')


def load_real_calendar(path, policy):
    """Load an official versioned dataset; authority pins locality. No
    fallback to national-only or another municipality's dataset."""
    import hashlib
    want = (policy or {}).get('active_candidate', {}).get('holiday_calendar_locality')
    if want != REQUIRED_LOCALITY:
        raise Rejected('CALENDAR_LOCALITY_AUTHORITY_REQUIRED')
    try:
        doc = json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise Rejected('CALENDAR_SOURCE_REQUIRED')
    if not isinstance(doc, dict) or doc.get('schema') != CALENDAR_SCHEMA or doc.get('kind') != 'REAL_OFFICIAL_SOURCES':
        raise Rejected('CALENDAR_METADATA_REQUIRED')
    pin = (policy or {}).get('active_candidate', {}).get('holiday_calendar_dataset_version')
    if pin is not None and pathlib.Path(path).name == pathlib.Path(policy['active_candidate'].get('holiday_calendar_dataset', '')).name and doc.get('version') != pin:
        raise Rejected('CALENDAR_VERSION_MISMATCH')
    if doc.get('locality') != want:
        raise Rejected('CALENDAR_LOCALITY_MISMATCH')
    if not doc.get('sources') or not all(str(s.get('url', '')).startswith('https://') for s in doc['sources']) or not doc.get('consulted_on'):
        raise Rejected('CALENDAR_METADATA_REQUIRED')
    data = doc.get('data')
    sealed = {k: doc.get(k) for k in INTEGRITY_FIELDS}
    canon = json.dumps(sealed, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    if hashlib.sha256(canon.encode()).hexdigest() != (doc.get('integrity') or {}).get('sha256'):
        raise Rejected('CALENDAR_INTEGRITY_MISMATCH')
    try:
        hol = [datetime.date.fromisoformat(h['date']) for h in data['holidays'] if h.get('classification') == 'FERIADO']
        opt = {datetime.date.fromisoformat(x['date']) for x in data.get('excluded_optional_points', [])}
        cs, ce = datetime.date.fromisoformat(doc['coverage_start']), datetime.date.fromisoformat(doc['coverage_end'])
    except (KeyError, TypeError, ValueError):
        raise Rejected('CALENDAR_HOLIDAYS_INVALID')
    if len(hol) != len(data['holidays']) or len(set(hol)) != len(hol) or opt & set(hol):
        raise Rejected('CALENDAR_HOLIDAYS_INVALID')  # facultativo never becomes holiday
    return dict(version=doc['version'], locality=doc['locality'], source=doc['sources'][0]['url'],
                coverage_start=cs, coverage_end=ce, holidays=frozenset(hol), kind='REAL')


def _norm(t):
    import unicodedata
    return ' '.join(unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode().casefold().split())


def resolve_payment_method(policy, catalog_rows):
    """Resolve the decided default method against a CAPTURED catalog only.
    catalog_rows=None means the rows were never captured (schema-only)."""
    dm = (policy or {}).get('active_candidate', {}).get('default_payment_method') or {}
    if dm.get('decision') != 'BOLETO_BANCARIO':
        raise Rejected('PAYMENT_METHOD_DECISION_REQUIRED')
    if catalog_rows is None:
        raise Rejected('PAYMENT_METHOD_CATALOG_ROWS_NOT_CAPTURED')
    hits = [r for r in catalog_rows if isinstance(r, dict) and isinstance(r.get('name'), str) and _norm(r['name']) == 'boleto bancario']
    if not hits:
        raise Rejected('PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG')
    active = [r for r in hits if r.get('active') is True]
    if not active:
        raise Rejected('PAYMENT_METHOD_BOLETO_INACTIVE')
    if len(active) > 1:
        raise Rejected('PAYMENT_METHOD_BOLETO_AMBIGUOUS')
    if not isinstance(active[0].get('id'), str) or len(active[0]['id']) != 36:
        raise Rejected('PAYMENT_METHOD_ID_INVALID')
    return active[0]['id']


def production_eligibility(*_a, calendar_dataset=None, **_k):
    """Separated from the candidate API: production stays denied. The
    calendar reason is precise: absent source vs valid dataset with limited
    coverage."""
    if calendar_dataset is None:
        cal = ['CALENDAR_SOURCE_REQUIRED']
    else:
        validate_calendar(calendar_dataset)
        cal = ['CALENDAR_COVERAGE_LIMITED_TO_%s..%s' % (calendar_dataset['coverage_start'], calendar_dataset['coverage_end'])]
    return dict(eligible=False, reasons=cal + [
        'GENERATORS_WITHOUT_PRICE', 'PAYMENT_TERMS_NOT_DEFINED', 'C2_ACCOUNTING_PENDING',
        'B2B_INTERNAL_DOWNSTREAM_UNVERIFIED', 'JWT_RLS_AB_NOT_PROVEN'])


def add_months_clamped(d, months):
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    return datetime.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def _nf(nf_issue_date, generated_at):
    if type(nf_issue_date) is not datetime.date:
        raise Rejected('NF_ISSUE_DATE_REQUIRED')
    if generated_at is not None:
        if type(generated_at) is not datetime.date:
            raise Rejected('GENERATED_AT_INVALID')
        if generated_at < nf_issue_date:
            raise Rejected('GENERATION_BEFORE_NF')
    return nf_issue_date


def nominal_dates(nf_issue_date, n, generated_at=None):
    """Decided: first nominal = NF + 30 days; k-th = same day of first nominal
    in month +k, last day if shorter, always from the FIRST nominal (no drift).
    generated_at (manual click) never moves dates."""
    n = installments(n)
    nf = _nf(nf_issue_date, generated_at)
    try:
        first = nf + datetime.timedelta(days=30)
        return [add_months_clamped(first, k) for k in range(n)]
    except (OverflowError, ValueError):
        raise Rejected('DATE_OUT_OF_RANGE')


def validate_calendar(cal):
    if cal is None:
        raise Rejected('CALENDAR_SOURCE_REQUIRED')
    if not isinstance(cal, dict) or not all(cal.get(k) for k in ('version', 'locality', 'source')):
        raise Rejected('CALENDAR_METADATA_REQUIRED')
    if type(cal.get('coverage_start')) is not datetime.date or type(cal.get('coverage_end')) is not datetime.date or cal['coverage_end'] < cal['coverage_start']:
        raise Rejected('CALENDAR_COVERAGE_REQUIRED')
    hol = cal.get('holidays')
    if not isinstance(hol, (set, frozenset, list, tuple)) or any(type(h) is not datetime.date for h in hol):
        raise Rejected('CALENDAR_HOLIDAYS_INVALID')
    if any(not (cal['coverage_start'] <= h <= cal['coverage_end']) for h in hol):
        raise Rejected('CALENDAR_HOLIDAY_OUTSIDE_COVERAGE')
    return frozenset(hol)


def adjusted_due(nominal, cal):
    hol = validate_calendar(cal)
    d = nominal
    for _ in range(60):
        if not (cal['coverage_start'] <= d <= cal['coverage_end']):
            raise Rejected('CALENDAR_COVERAGE_EXCEEDED')  # absence of data != no holiday
        if d.weekday() < 5 and d not in hol:
            return d
        try:
            d += datetime.timedelta(days=1)
        except OverflowError:
            raise Rejected('DATE_OUT_OF_RANGE')
    raise Rejected('CALENDAR_NO_BUSINESS_DAY')


def due_schedule(nf_issue_date, n, cal, generated_at=None):
    """Nominal calendar kept separate from adjusted (business-day) due dates.
    Interest is fixed monthly Price on nominal periods: no extra interest."""
    noms = nominal_dates(nf_issue_date, n, generated_at)
    return [dict(nominal=x, adjusted=adjusted_due(x, cal)) for x in noms]


def due_dates_candidate(nf_issue_date, n, generated_at=None):
    return nominal_dates(nf_issue_date, n, generated_at)


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
        rejects(f'credit_limit {v!r}', lim_code, lambda: candidate_plan(p, 2, '0', v, 'financed_total'))
        exp_code = None if code == 'NOT_POSITIVE' else 'EXPOSURE_' + code
        if exp_code:
            rejects(f'exposure {v!r}', exp_code, lambda: candidate_plan(p, 2, v, LIMIT, 'financed_total'))
    for n, code in ((4, 'INSTALLMENTS_OUT_OF_RANGE'), (0, 'INSTALLMENTS_OUT_OF_RANGE'), (True, 'INSTALLMENTS_INVALID'), (2.0, 'INSTALLMENTS_INVALID'), ('2', 'INSTALLMENTS_INVALID')):
        rejects(f'schedule n={n!r}', code, lambda: price_schedule(p, n))
        rejects(f'dates n={n!r}', code, lambda: due_dates_candidate(datetime.date(2026, 1, 1), n))
    for v, code in (('1E+999999', 'OUT_OF_RANGE'), ('9' * 40, 'OUT_OF_RANGE'), ('-1E+999999', 'OUT_OF_RANGE'), ('1E+13', 'OUT_OF_RANGE'), ('1E-999999', 'SUBCENT')):
        rejects(f'principal magnitude {v}', 'PRINCIPAL_' + code, lambda: price_schedule(v, 2))
        rejects(f'limit magnitude {v}', 'CREDIT_LIMIT_' + code, lambda: candidate_plan(p, 2, '0', v, 'financed_total'))
        rejects(f'exposure magnitude {v}', 'EXPOSURE_' + code, lambda: candidate_plan(p, 2, v, LIMIT, 'financed_total'))
    FT = 'financed_total'
    rejects('negative exposure cannot widen limit', 'EXPOSURE_NEGATIVE', lambda: candidate_plan('100000.00', 1, '-50000', LIMIT, FT))
    rejects('principal basis rejected', 'EXPOSURE_BASIS_PRINCIPAL_REJECTED', lambda: candidate_plan(p, 3, '0', LIMIT, 'principal'))
    rejects('basis required', 'EXPOSURE_BASIS_REQUIRED', lambda: candidate_plan(p, 3, '0', LIMIT, None))
    # Limit on rounded installment sum incl. interest: exact threshold and +0.01.
    check('3x 60000 exact threshold', Decimal('0.00'), candidate_plan(p, 3, '37827.16', LIMIT, FT)['available_after'], 'CREDIT_FINANCED_TOTAL')
    rejects('3x 60000 threshold +0.01', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan(p, 3, '37827.17', LIMIT, FT), 'CREDIT_FINANCED_TOTAL')
    rejects('RED old principal basis would fit (now blocked)', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan('60000.00', 3, '40000.00', LIMIT, FT), 'CREDIT_FINANCED_TOTAL')
    check('2x 60000 exact threshold', Decimal('0.00'), candidate_plan(p, 2, '38375.18', LIMIT, FT)['available_after'], 'CREDIT_FINANCED_TOTAL')
    rejects('2x 60000 threshold +0.01', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan(p, 2, '38375.19', LIMIT, FT), 'CREDIT_FINANCED_TOTAL')
    check('1x exact limit', Decimal('0.00'), candidate_plan('100000.00', 1, '0', LIMIT, FT)['available_after'], 'CREDIT_FINANCED_TOTAL')
    rejects('1x limit +0.01', 'LIMIT_EXCEEDED_BLOCK', lambda: candidate_plan('100000.01', 1, '0', LIMIT, FT), 'CREDIT_FINANCED_TOTAL')
    for _ in range(2):
        rejects('automatic generation blocked (replay)', 'AUTO_GENERATION_BLOCKED', lambda: candidate_plan(p, 2, '0', LIMIT, FT, 'automatic'))
    check('production eligibility denied', False, production_eligibility(p, 3)['eligible'], 'PRODUCTION_GATE')
    check('production reasons include calendar source', True, 'CALENDAR_SOURCE_REQUIRED' in production_eligibility()['reasons'], 'PRODUCTION_GATE')
    # Dates: NF anchor and nominal calendar decided; adjusted dues use the
    # versioned calendar (synthetic fixtures here; real Paracatu-MG below).
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
        check('later nominal dues ' + nf.isoformat(), expected[1:], got[1:], 'NOMINAL_CALENDAR_DECIDED')
    nf = D(2026, 11, 3)
    base = due_dates_candidate(nf, 3)
    for late in (D(2026, 11, 3), D(2026, 11, 20), D(2027, 1, 15)):
        check('late manual generation keeps NF due ' + late.isoformat(), base, due_dates_candidate(nf, 3, generated_at=late), 'NF_ANCHOR_DECIDED')
    check('replay twice same dates', base, due_dates_candidate(nf, 3, generated_at=D(2027, 1, 15)), 'NF_ANCHOR_DECIDED')
    for v, code in ((None, 'NF_ISSUE_DATE_REQUIRED'), ('2026-11-03', 'NF_ISSUE_DATE_REQUIRED'), (datetime.datetime(2026, 11, 3), 'NF_ISSUE_DATE_REQUIRED')):
        rejects(f'nf date {v!r}', code, lambda: due_dates_candidate(v, 2))
    rejects('generation before NF', 'GENERATION_BEFORE_NF', lambda: due_dates_candidate(nf, 2, generated_at=D(2026, 11, 2)))
    rejects('generated_at string', 'GENERATED_AT_INVALID', lambda: due_dates_candidate(nf, 2, generated_at='2026-11-20'))
    # Business-day adjustment with an EXPLICITLY SYNTHETIC versioned calendar.
    SYN = dict(version='synthetic-test-v1', locality='SYNTHETIC-NOT-REAL', source='offline fixture, not a real holiday calendar',
               coverage_start=D(2026, 1, 1), coverage_end=D(2028, 12, 31),
               holidays={D(2026, 3, 2), D(2026, 3, 3), D(2026, 3, 4), D(2027, 1, 1), D(2028, 2, 29), D(2028, 3, 1)})
    sch = due_schedule(D(2026, 1, 1), 3, SYN)  # nominal 31/01 sat, 28/02 sat, 31/03 tue
    check('weekend rolls first due', ['2026-02-02', '2026-03-05', '2026-03-31'], [x['adjusted'].isoformat() for x in sch], 'BUSINESS_DAY_SYNTHETIC')
    check('consecutive synthetic holidays after weekend', '2026-03-05', sch[1]['adjusted'].isoformat(), 'BUSINESS_DAY_SYNTHETIC')
    check('adjustment does not shift nominal anchor', ['2026-01-31', '2026-02-28', '2026-03-31'], [x['nominal'].isoformat() for x in sch], 'BUSINESS_DAY_SYNTHETIC')
    sch = due_schedule(D(2026, 12, 2), 3, SYN)  # nominal 01/01/2027 holiday (fri)
    check('year turn holiday', ['2027-01-04', '2027-02-01', '2027-03-01'], [x['adjusted'].isoformat() for x in sch], 'BUSINESS_DAY_SYNTHETIC')
    sch = due_schedule(D(2027, 12, 31), 3, SYN)  # nominal 30/01/2028 sun, 29/02 holiday, 30/03 thu
    check('leap day holiday + weekend', ['2028-01-31', '2028-03-02', '2028-03-30'], [x['adjusted'].isoformat() for x in sch], 'BUSINESS_DAY_SYNTHETIC')
    check('leap nominal kept', ['2028-01-30', '2028-02-29', '2028-03-30'], [x['nominal'].isoformat() for x in sch], 'BUSINESS_DAY_SYNTHETIC')
    s3a = price_schedule(p, 3)
    check('Price invariant under business-day adjustment', [r['payment'] for r in s3['rows']], [r['payment'] for r in s3a['rows']], 'BUSINESS_DAY_SYNTHETIC')
    check('no drift: Jan31 nominal -> Mar31 not Mar28', '2026-03-31', nominal_dates(D(2026, 1, 1), 3)[2].isoformat(), 'NOMINAL_CALENDAR_DECIDED')
    late = [due_schedule(D(2026, 1, 1), 3, SYN, generated_at=g) for g in (D(2026, 1, 1), D(2026, 2, 20), D(2026, 4, 1))]
    check('late generation/replay keeps adjusted dues', True, all(x == late[0] for x in late), 'NF_ANCHOR_DECIDED')
    rejects('no calendar -> CALENDAR_SOURCE_REQUIRED', 'CALENDAR_SOURCE_REQUIRED', lambda: due_schedule(D(2026, 1, 1), 3, None), 'CALENDAR_GATE')
    rejects('calendar missing locality', 'CALENDAR_METADATA_REQUIRED', lambda: due_schedule(D(2026, 1, 1), 3, dict(SYN, locality='')), 'CALENDAR_GATE')
    rejects('calendar without coverage', 'CALENDAR_COVERAGE_REQUIRED', lambda: due_schedule(D(2026, 1, 1), 3, dict(SYN, coverage_end=None)), 'CALENDAR_GATE')
    rejects('due beyond coverage is not "no holiday"', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(D(2028, 12, 1), 3, SYN), 'CALENDAR_GATE')
    rejects('holiday outside coverage', 'CALENDAR_HOLIDAY_OUTSIDE_COVERAGE', lambda: due_schedule(D(2026, 1, 1), 3, dict(SYN, holidays={D(2030, 1, 1)})), 'CALENDAR_GATE')
    rejects('holiday as string', 'CALENDAR_HOLIDAYS_INVALID', lambda: due_schedule(D(2026, 1, 1), 3, dict(SYN, holidays={'2026-03-02'})), 'CALENDAR_GATE')
    rejects('date overflow', 'DATE_OUT_OF_RANGE', lambda: nominal_dates(D(9999, 12, 20), 2), 'CALENDAR_GATE')
    rejects('month overflow', 'DATE_OUT_OF_RANGE', lambda: nominal_dates(D(9999, 11, 1), 3), 'CALENDAR_GATE')
    # Policy authority: new plans never pick superseded rules.
    H = pathlib.Path(__file__).parent
    pol = json.loads((H / 'arbio-fsf-policy.draft.json').read_text())
    old = json.loads((H / 'arbio-fsf-policy.full-term-20261028.superseded.json').read_text())
    for n in (1, 2, 3):
        r = resolve_new_plan_policy(pol, n)
        check(f'resolver {n}x rate from active candidate', RATE_BY_N[n], r['rate'], 'POLICY_AUTHORITY')
    check('resolver limit 100000', LIMIT, resolve_new_plan_policy(pol, 2)['credit_limit'], 'POLICY_AUTHORITY')
    check('resolver first due NF+30', 'nf_issue_date_plus_30_days', resolve_new_plan_policy(pol, 1)['first_due'], 'POLICY_AUTHORITY')
    check('resolver basis financed total', 'financed_total', resolve_new_plan_policy(pol, 3)['exposure_basis'], 'POLICY_AUTHORITY')
    check('draft undefined has no resolved calendar/basis items', [], [k for k in ('credit_exposure_basis', 'business_day_rolling', 'later_due_clamp_confirmation', 'pro_rata_day_basis') if k in pol['undefined']], 'POLICY_AUTHORITY')
    check('draft holiday source partial 2026 only', True, str(pol['undefined'].get('holiday_calendar_source')).startswith('PARTIAL'), 'POLICY_AUTHORITY')
    tampered = json.loads(json.dumps(pol)); tampered['active_candidate']['exposure_basis'] = 'principal'
    rejects('resolver rejects principal basis regression', 'ACTIVE_CANDIDATE_CONTRADICTION', lambda: resolve_new_plan_policy(tampered, 2), 'POLICY_AUTHORITY')
    tampered = json.loads(json.dumps(pol)); tampered['active_candidate']['pro_rata'] = 'actual_days'
    rejects('resolver rejects pro-rata regression', 'ACTIVE_CANDIDATE_CONTRADICTION', lambda: resolve_new_plan_policy(tampered, 2), 'POLICY_AUTHORITY')
    check('draft has no superseded root rules', [], [k for k in SUPERSEDED_ROOT_KEYS if k in pol], 'POLICY_AUTHORITY')
    check('draft runtime disabled', False, pol['runtime_enabled'], 'POLICY_AUTHORITY')
    check('draft billing trigger resolved manual', 'manual_authorized_only', pol['resolved_by_active_candidate']['billing_trigger'], 'POLICY_AUTHORITY')
    check('draft undefined no longer lists resolved items', [], [k for k in ('installment_count', 'billing_trigger', 'interest_incidence_schedule', 'installment_amortization') if k in pol['undefined']], 'POLICY_AUTHORITY')
    check('superseded file labeled', 'HISTORICAL_SUPERSEDED_FOR_NEW_PLANS', old['status'], 'POLICY_AUTHORITY')
    rejects('resolver rejects superseded file', 'SUPERSEDED_RULE_AT_ROOT', lambda: resolve_new_plan_policy(old, 2), 'POLICY_AUTHORITY')
    rejects('resolver rejects 2% long-term rate', 'RATE_NOT_FROM_ACTIVE_CANDIDATE', lambda: resolve_new_plan_policy(pol, 3, '2'), 'POLICY_AUTHORITY')
    rejects('resolver rejects 6 installments', 'INSTALLMENTS_OUT_OF_RANGE', lambda: resolve_new_plan_policy(pol, 6), 'POLICY_AUTHORITY')
    tampered = json.loads(json.dumps(pol)); tampered['policies'] = old['policies']
    rejects('resolver rejects reinjected bands', 'SUPERSEDED_RULE_AT_ROOT', lambda: resolve_new_plan_policy(tampered, 2), 'POLICY_AUTHORITY')
    tampered = json.loads(json.dumps(pol)); tampered['credit']['credit_limit'] = None
    rejects('resolver rejects null root credit', 'CREDIT_LIMIT_CONTRADICTION', lambda: resolve_new_plan_policy(tampered, 2), 'POLICY_AUTHORITY')
    tampered = json.loads(json.dumps(pol)); tampered['runtime_enabled'] = True
    rejects('resolver rejects runtime enabled', 'RUNTIME_MUST_STAY_DISABLED', lambda: resolve_new_plan_policy(tampered, 2), 'POLICY_AUTHORITY')
    # Real official dataset Paracatu-MG 2026 (separate from synthetic fixtures).
    RP = H / 'calendars' / 'paracatu-mg-2026.json'  # v1 immutable, still verified
    REAL = load_real_calendar(RP, pol)
    check('real calendar is not synthetic', ('REAL', 'Paracatu-MG'), (REAL['kind'], REAL['locality']), 'CALENDAR_REAL')
    check('real coverage 2026', ('2026-01-01', '2026-12-31'), (REAL['coverage_start'].isoformat(), REAL['coverage_end'].isoformat()), 'CALENDAR_REAL')
    check('real holiday count', 14, len(REAL['holidays']), 'CALENDAR_REAL')
    for nom, exp in (('2026-10-20', '2026-10-21'), ('2026-10-31', '2026-11-03'), ('2026-11-20', '2026-11-23'), ('2026-06-04', '2026-06-05'),
                     ('2026-12-08', '2026-12-08'), ('2026-10-30', '2026-10-30'), ('2026-12-25', '2026-12-28'), ('2026-04-03', '2026-04-06'),
                     ('2026-06-13', '2026-06-15'), ('2026-02-16', '2026-02-16'), ('2026-12-24', '2026-12-24')):
        check('real adjust ' + nom, exp, adjusted_due(D.fromisoformat(nom), REAL).isoformat(), 'CALENDAR_REAL')
    sch = due_schedule(D(2026, 8, 21), 3, REAL)  # nominal 20/10, 20/11, 20/12(sun)
    check('real plan nominal', ['2026-09-20', '2026-10-20', '2026-11-20'], [x['nominal'].isoformat() for x in sch], 'CALENDAR_REAL')
    check('real plan adjusted', ['2026-09-21', '2026-10-21', '2026-11-23'], [x['adjusted'].isoformat() for x in sch], 'CALENDAR_REAL')
    check('Price unchanged with real calendar', ['20724.28'] * 3, [q(r['payment']) for r in price_schedule(p, 3)['rows']], 'CALENDAR_REAL')
    # Whole plan rejected if any installment leaves coverage (no partial).
    for nf in (D(2026, 10, 15), D(2026, 11, 3), D(2026, 12, 1)):
        rejects('whole plan blocked beyond 2026 ' + nf.isoformat(), 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(nf, 3, REAL), 'CALENDAR_REAL')
    rejects('roll 31/12 thu ok but 2027 nominal blocked', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(D(2026, 12, 2), 1, REAL), 'CALENDAR_REAL')
    check('1x within coverage ok', ['2026-12-28'], [x['adjusted'].isoformat() for x in due_schedule(D(2026, 11, 25), 1, REAL)], 'CALENDAR_REAL')
    rejects('2x crossing into 2027 blocked whole', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(D(2026, 11, 25), 2, REAL), 'CALENDAR_REAL')
    # Exact cutoff examples (NF 2026-10-29 = today of the review).
    check('NF 2026-10-29 1x', ['2026-11-30'], [x['adjusted'].isoformat() for x in due_schedule(D(2026, 10, 29), 1, REAL)], 'CALENDAR_REAL')
    check('NF 2026-10-29 2x', ['2026-11-30', '2026-12-28'], [x['adjusted'].isoformat() for x in due_schedule(D(2026, 10, 29), 2, REAL)], 'CALENDAR_REAL')
    check('NF 2026-10-29 3x nominal reaches 2027', '2027-01-28', nominal_dates(D(2026, 10, 29), 3)[2].isoformat(), 'CALENDAR_REAL')
    rejects('NF 2026-10-29 3x blocked whole', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(D(2026, 10, 29), 3, REAL), 'CALENDAR_REAL')
    for n in (1, 2, 3):
        rejects(f'NF 2026-12-02 {n}x first nominal 2027-01-01 blocked', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(D(2026, 12, 2), n, REAL), 'CALENDAR_REAL')
    # Authority / integrity / no silent fallback.
    import tempfile, copy
    raw = json.loads(RP.read_text(encoding='utf-8'))
    def tmp(doc):
        f = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8'); json.dump(doc, f, ensure_ascii=False); f.close(); return f.name
    t = copy.deepcopy(pol); t['active_candidate'].pop('holiday_calendar_locality')
    rejects('no locality authority', 'CALENDAR_LOCALITY_AUTHORITY_REQUIRED', lambda: load_real_calendar(RP, t), 'CALENDAR_REAL')
    t = copy.deepcopy(pol); t['active_candidate']['holiday_calendar_locality'] = 'BR-NACIONAL'
    rejects('national-only authority rejected', 'CALENDAR_LOCALITY_AUTHORITY_REQUIRED', lambda: load_real_calendar(RP, t), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['locality'] = 'Unaí-MG'
    rejects('other municipality dataset rejected', 'CALENDAR_LOCALITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['data']['holidays'] = o['data']['holidays'][:-1]
    rejects('tampered holidays -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['data']['holidays'].append(dict(date='2026-12-08', classification='FERIADO'))
    rejects('injected 08/12 -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['coverage_end'] = '2027-12-31'
    rejects('coverage widened to 2027 -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['sources'][0]['url'] = 'https://example.com/x.pdf'
    rejects('source swapped -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['kind'] = 'SYNTHETIC'
    rejects('synthetic kind not accepted as real', 'CALENDAR_METADATA_REQUIRED', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    o = copy.deepcopy(raw); o['sources'] = []
    rejects('no sources', 'CALENDAR_METADATA_REQUIRED', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL')
    rejects('missing file', 'CALENDAR_SOURCE_REQUIRED', lambda: load_real_calendar(H / 'calendars' / 'absent.json', pol), 'CALENDAR_REAL')
    check('optional points disjoint from holidays', set(), {x['date'] for x in raw['data']['excluded_optional_points']} & {h['date'] for h in raw['data']['holidays']}, 'CALENDAR_REAL')
    check('08/12 not holiday', False, D(2026, 12, 8) in REAL['holidays'], 'CALENDAR_REAL')
    # v2 Paracatu-MG 2026-2027, selected explicitly by the policy.
    def gauss_easter(y):  # independent formulation (Gauss with corrections)
        a, b, c = y % 19, y % 4, y % 7
        k = y // 100; pp = (13 + 8 * k) // 25; qq = k // 4
        M = (15 - pp + k - qq) % 30; N = (4 + k - qq) % 7
        dd = (19 * a + M) % 30; ee = (2 * b + 4 * c + 6 * dd + N) % 7
        day = 22 + dd + ee
        if dd == 29 and ee == 6: return D(y, 4, 19)
        if dd == 28 and ee == 6 and (11 * M + 11) % 30 < 19: return D(y, 4, 18)
        return D(y, 3, day) if day <= 31 else D(y, 4, day - 31)
    for y, e in ((2024, '2024-03-31'), (2025, '2025-04-20'), (2026, '2026-04-05'), (2027, '2027-03-28'), (2019, '2019-04-21')):
        check('independent Easter ' + str(y), e, gauss_easter(y).isoformat(), 'CALENDAR_REAL_V2')
    RP2 = H / pol['active_candidate']['holiday_calendar_dataset']
    R2 = load_real_calendar(RP2, pol)
    raw2 = json.loads(RP2.read_text(encoding='utf-8'))
    check('policy selects v2 explicitly', ('paracatu-mg-2026-2027-v2', 'paracatu-mg-2026-2027.json'), (R2['version'], RP2.name), 'CALENDAR_REAL_V2')
    check('v2 coverage', ('2026-01-01', '2027-12-31'), (R2['coverage_start'].isoformat(), R2['coverage_end'].isoformat()), 'CALENDAR_REAL_V2')
    h26v1 = [h for h in raw['data']['holidays']]
    h26v2 = [{k: v for k, v in h.items() if k != 'origin'} for h in raw2['data']['holidays'] if h['date'] < '2027']
    check('v2 keeps 2026 entries identical to v1', h26v1, h26v2, 'CALENDAR_REAL_V2')
    y27 = sorted(h.isoformat() for h in R2['holidays'] if h.year == 2027)
    E27 = gauss_easter(2027)
    exp27 = sorted(['2027-01-01', (E27 - datetime.timedelta(days=2)).isoformat(), '2027-04-21', '2027-05-01', (E27 + datetime.timedelta(days=60)).isoformat(), '2027-06-13',
                    '2027-09-07', '2027-10-12', '2027-10-20', '2027-10-31', '2027-11-02', '2027-11-15', '2027-11-20', '2027-12-25'])
    check('2027 = 14 holidays from laws + independent Easter', exp27, y27, 'CALENDAR_REAL_V2')
    check('Sexta Santa 2027 / Corpus 2027', ('2027-03-26', '2027-05-27'), ((E27 - datetime.timedelta(days=2)).isoformat(), (E27 + datetime.timedelta(days=60)).isoformat()), 'CALENDAR_REAL_V2')
    check('2027 origin is computed from recurring law', {'RECURRING_LAW_COMPUTED', 'RECURRING_LAW_COMPUTED_MOVABLE'}, {h['origin'] for h in raw2['data']['holidays'] if h['date'] >= '2027'}, 'CALENDAR_REAL_V2')
    for nom, exp in (('2027-12-08', '2027-12-08'), ('2027-05-28', '2027-05-28'), ('2027-02-08', '2027-02-08'), ('2027-02-09', '2027-02-09'),
                     ('2027-08-11', '2027-08-11'), ('2027-03-25', '2027-03-25'), ('2027-03-26', '2027-03-29'), ('2027-05-27', '2027-05-28'),
                     ('2027-01-01', '2027-01-04'), ('2027-10-12', '2027-10-13'), ('2027-11-20', '2027-11-22'), ('2027-12-25', '2027-12-27')):
        check('v2 adjust ' + nom, exp, adjusted_due(D.fromisoformat(nom), R2).isoformat(), 'CALENDAR_REAL_V2')
    for nom, exp in (('2026-10-20', '2026-10-21'), ('2026-10-31', '2026-11-03'), ('2026-06-04', '2026-06-05'), ('2026-12-08', '2026-12-08')):
        check('v2 keeps 2026 adjust ' + nom, exp, adjusted_due(D.fromisoformat(nom), R2).isoformat(), 'CALENDAR_REAL_V2')
    adj = lambda nf, n: [x['adjusted'].isoformat() for x in due_schedule(nf, n, R2)]
    nomd = lambda nf, n: [x.isoformat() for x in nominal_dates(nf, n)]
    check('NF 2026-10-29 3x v2 nominal', ['2026-11-28', '2026-12-28', '2027-01-28'], nomd(D(2026, 10, 29), 3), 'CALENDAR_REAL_V2')
    check('NF 2026-10-29 3x v2 adjusted', ['2026-11-30', '2026-12-28', '2027-01-28'], adj(D(2026, 10, 29), 3), 'CALENDAR_REAL_V2')
    check('NF 2026-10-29 3x same Price installments', ['20724.28'] * 3, [q(r['payment']) for r in price_schedule(p, 3)['rows']], 'CALENDAR_REAL_V2')
    check('NF 2026-12-02 1x 01/01 -> 04/01/2027', ['2027-01-04'], adj(D(2026, 12, 2), 1), 'CALENDAR_REAL_V2')
    check('NF 2026-12-02 3x', ['2027-01-04', '2027-02-01', '2027-03-01'], adj(D(2026, 12, 2), 3), 'CALENDAR_REAL_V2')
    # Month-end limits: first nominal on 29/30/31 January 2027.
    for nf, nom, ad in ((D(2026, 12, 30), ['2027-01-29', '2027-02-28', '2027-03-29'], ['2027-01-29', '2027-03-01', '2027-03-29']),
                        (D(2026, 12, 31), ['2027-01-30', '2027-02-28', '2027-03-30'], ['2027-02-01', '2027-03-01', '2027-03-30']),
                        (D(2027, 1, 1), ['2027-01-31', '2027-02-28', '2027-03-31'], ['2027-02-01', '2027-03-01', '2027-03-31'])):
        check('month-end nominal ' + nom[0], nom, nomd(nf, 3), 'CALENDAR_REAL_V2')
        check('month-end adjusted ' + nom[0], ad, adj(nf, 3), 'CALENDAR_REAL_V2')
    check('last covered day 2027-12-31 fri', ['2027-12-31'], adj(D(2027, 12, 1), 1), 'CALENDAR_REAL_V2')
    for nf, n in ((D(2027, 11, 15), 3), (D(2027, 12, 2), 1), (D(2027, 10, 20), 3), (D(2027, 11, 20), 2)):
        rejects(f'2028 blocks whole plan NF {nf} {n}x', 'CALENDAR_COVERAGE_EXCEEDED', lambda: due_schedule(nf, n, R2), 'CALENDAR_REAL_V2')
    t = copy.deepcopy(pol); t['active_candidate']['holiday_calendar_dataset_version'] = 'paracatu-mg-2026-v1'
    rejects('policy version pin mismatch', 'CALENDAR_VERSION_MISMATCH', lambda: load_real_calendar(RP2, t), 'CALENDAR_REAL_V2')
    o = copy.deepcopy(raw2); o['data']['holidays'] = [h for h in o['data']['holidays'] if h['date'] != '2027-03-26']
    rejects('v2 tampered 2027 -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL_V2')
    o = copy.deepcopy(raw2); o['coverage_end'] = '2028-12-31'
    rejects('v2 widened to 2028 -> integrity', 'CALENDAR_INTEGRITY_MISMATCH', lambda: load_real_calendar(tmp(o), pol), 'CALENDAR_REAL_V2')
    check('CNJ forensic/recess not imported', False, any(D(2027, 2, 8) == h or D(2027, 8, 11) == h or D(2027, 3, 24) == h for h in R2['holidays']), 'CALENDAR_REAL_V2')
    e2 = production_eligibility(calendar_dataset=R2)
    check('v2 eligibility reason precise and still denied', (False, True, False), (e2['eligible'], 'CALENDAR_COVERAGE_LIMITED_TO_2026-01-01..2027-12-31' in e2['reasons'], 'CALENDAR_SOURCE_REQUIRED' in e2['reasons']), 'PRODUCTION_GATE')
    # Default payment method: BOLETO BANCARIO resolved only from captured catalog.
    cap = json.loads((H.parent / 'contracts-c2-20261022' / 'integral' / 'hosted-capture.json').read_text())
    pm_rel = [r for r in cap['rels'] if r.get('r') == 'payment_methods']
    check('captured payment_methods schema (id,name,active,created_at), no code column', ['id', 'name', 'active', 'created_at'], [c[0] for c in pm_rel[0]['cols']], 'PAYMENT_METHOD')
    check('captured payment_methods has no rows', True, all('rows' not in r and 'data' not in r for r in pm_rel), 'PAYMENT_METHOD')
    rejects('real resolution blocked: rows not captured', 'PAYMENT_METHOD_CATALOG_ROWS_NOT_CAPTURED', lambda: resolve_payment_method(pol, None), 'PAYMENT_METHOD')
    check('decision recorded, pending removed', ('BOLETO_BANCARIO', False), (pol['active_candidate']['default_payment_method']['decision'], 'default_payment_method' in pol['undefined']), 'PAYMENT_METHOD')
    SYNPM = 'deadbeef-0000-4000-8000-00000000b01e'  # SYNTHETIC fixture id, never real
    check('synthetic active boleto resolves', SYNPM, resolve_payment_method(pol, [dict(id=SYNPM, name='Boleto Bancário', active=True, synthetic=True), dict(id='x' * 36, name='PIX', active=True)]), 'PAYMENT_METHOD')
    check('accent/case/space insensitive', SYNPM, resolve_payment_method(pol, [dict(id=SYNPM, name='  BOLETO   bancario ', active=True)]), 'PAYMENT_METHOD')
    rejects('synthetic inactive boleto', 'PAYMENT_METHOD_BOLETO_INACTIVE', lambda: resolve_payment_method(pol, [dict(id=SYNPM, name='Boleto Bancário', active=False)]), 'PAYMENT_METHOD')
    rejects('boleto absent', 'PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG', lambda: resolve_payment_method(pol, [dict(id=SYNPM, name='PIX', active=True)]), 'PAYMENT_METHOD')
    rejects('no fuzzy match "Boleto"', 'PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG', lambda: resolve_payment_method(pol, [dict(id=SYNPM, name='Boleto', active=True)]), 'PAYMENT_METHOD')
    rejects('two active boletos ambiguous', 'PAYMENT_METHOD_BOLETO_AMBIGUOUS', lambda: resolve_payment_method(pol, [dict(id=SYNPM, name='Boleto Bancário', active=True), dict(id='e' * 36, name='boleto bancario', active=True)]), 'PAYMENT_METHOD')
    rejects('empty catalog', 'PAYMENT_METHOD_BOLETO_NOT_IN_CATALOG', lambda: resolve_payment_method(pol, []), 'PAYMENT_METHOD')
    t = copy.deepcopy(pol); t['active_candidate'].pop('default_payment_method')
    rejects('decision missing', 'PAYMENT_METHOD_DECISION_REQUIRED', lambda: resolve_payment_method(t, []), 'PAYMENT_METHOD')
    elig = production_eligibility(calendar_dataset=REAL)
    check('eligibility with dataset: no generic SOURCE_REQUIRED', False, 'CALENDAR_SOURCE_REQUIRED' in elig['reasons'], 'PRODUCTION_GATE')
    check('eligibility with dataset: coverage reason', True, 'CALENDAR_COVERAGE_LIMITED_TO_2026-01-01..2026-12-31' in elig['reasons'], 'PRODUCTION_GATE')
    check('eligibility with dataset still denied', (False, True), (elig['eligible'], 'C2_ACCOUNTING_PENDING' in elig['reasons']), 'PRODUCTION_GATE')
    summary = {}
    for c in checks:
        summary.setdefault(c['mode'], {}).setdefault(c['status'], 0)
        summary[c['mode']][c['status']] += 1
    blocked = ['Paracatu-MG v2 covers 2026-2027 (2027 computed from recurring laws in force on 2026-10-29, not a published annual calendar); any due in 2028+ blocks the whole plan (CALENDAR_COVERAGE_EXCEEDED)','PG end-to-end: captured generators implement no Price schedule and billing stays denied (PAYMENT_TERMS_NOT_DEFINED, C2_ACCOUNTING_PENDING, B2B_INTERNAL_DOWNSTREAM_UNVERIFIED); component tests only',
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
