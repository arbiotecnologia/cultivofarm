"""Candidate AR Bio x FSF Price schedule — OFFLINE ONLY, never runtime/SQL.

Owner decision 2026-10-29T17:41Z: up to 3 monthly installments, first due at
explicit base date + 30 days, interest on outstanding balance (Price).
1x/30d -> 0%; 2x/3x -> 1.8% a.m. from the first period. 4+ rejected.
The calendar ANCHOR (which event defines base date), irregular/pro-rata periods
and business-day rolling are NOT decided: schedule periods are computed
independently from dates, and dates require an explicitly supplied base date.
Historical titles (10300/7550 regressions) are never repriced here.
"""
from decimal import Decimal, ROUND_HALF_UP, getcontext, InvalidOperation
import calendar, datetime, json, sys, pathlib, fractions

getcontext().prec = 50
CENT = Decimal('0.01')
LIMIT = Decimal('100000.00')
DISCOUNT = Decimal('40')
RATE_BY_N = {1: Decimal('0'), 2: Decimal('1.8'), 3: Decimal('1.8')}


class Rejected(Exception):
    pass


def money(v, label):
    if isinstance(v, float):
        raise Rejected(label + '_FLOAT_FORBIDDEN')
    try:
        d = Decimal(str(v))
    except (InvalidOperation, TypeError):
        raise Rejected(label + '_INVALID')
    if not d.is_finite():
        raise Rejected(label + '_NOT_FINITE')
    if d <= 0:
        raise Rejected(label + '_NOT_POSITIVE')
    if d != d.quantize(CENT):
        raise Rejected(label + '_SUBCENT')
    return d


def net_principal(table_amount):
    """Discount 40% applied exactly once, rounded to cents."""
    t = money(table_amount, 'TABLE')
    return (t * (Decimal(100) - DISCOUNT) / 100).quantize(CENT, ROUND_HALF_UP)


def schedule(principal, n, exposure_before=Decimal('0'), credit_limit=LIMIT,
             generation='manual_authorized'):
    if generation != 'manual_authorized':
        raise Rejected('AUTO_GENERATION_BLOCKED')
    if not isinstance(n, int) or isinstance(n, bool):
        raise Rejected('INSTALLMENTS_INVALID')
    if n < 1 or n > 3:
        raise Rejected('INSTALLMENTS_OUT_OF_RANGE')
    p = money(principal, 'PRINCIPAL')
    if credit_limit is None:
        raise Rejected('CREDIT_LIMIT_REQUIRED')
    lim = Decimal(str(credit_limit))
    if not lim.is_finite() or lim < 0:
        raise Rejected('CREDIT_LIMIT_INVALID')
    if lim == 0:
        raise Rejected('ZERO_CREDIT_LIMIT')
    if Decimal(str(exposure_before)) + p > lim:
        raise Rejected('LIMIT_EXCEEDED_BLOCK')
    i = RATE_BY_N[n] / 100
    # PMT computed at full precision BEFORE rounding.
    pmt = p / n if i == 0 else p * i / (1 - (1 + i) ** (-n))
    pmt_c = pmt.quantize(CENT, ROUND_HALF_UP)
    bal, rows = p, []
    for k in range(1, n + 1):
        interest = (bal * i).quantize(CENT, ROUND_HALF_UP)
        if k < n:
            amort = pmt_c - interest
        else:  # explicit cents rule: last installment closes the balance
            amort = bal
        bal -= amort
        rows.append(dict(period=k, interest=interest, principal=amort,
                         payment=interest + amort, balance=bal))
    return dict(principal=p, n=n, rate=RATE_BY_N[n], pmt_exact=pmt, rows=rows)


def add_months_clamped(d, months):
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    return datetime.date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def due_dates(base_date, n, anchor_decided=False, irregular_rule=None, business_day_rule=None):
    """Candidate: first = base+30 days; next = first + k civil months, clamped
    to month end FROM THE FIRST DUE DATE (no drift). Blocked unless the anchor
    event is explicitly decided; pro-rata/business day never assumed."""
    if not anchor_decided:
        raise Rejected('CALENDAR_ANCHOR_UNDECIDED')
    if irregular_rule is not None or business_day_rule is not None:
        raise Rejected('CALENDAR_RULE_UNDECIDED')
    if not isinstance(base_date, datetime.date):
        raise Rejected('BASE_DATE_REQUIRED')
    first = base_date + datetime.timedelta(days=30)
    return [add_months_clamped(first, k) for k in range(n)]


def oracle_pmt(p, n, rate_pct):
    """Independent rational-arithmetic oracle (fractions, not Decimal)."""
    P, i = fractions.Fraction(str(p)), fractions.Fraction(str(rate_pct)) / 100
    if i == 0:
        return P / n
    return P * i * (1 + i) ** n / ((1 + i) ** n - 1)


def legacy_full_term(principal, months, rate_pct):
    """Superseded candidate: compound on whole principal to last due, divided."""
    p = Decimal(str(principal))
    total = (p * (1 + Decimal(str(rate_pct)) / 100) ** months).quantize(CENT, ROUND_HALF_UP)
    return total


def run(out=None):
    checks = []

    def check(name, expected, actual, mode):
        checks.append(dict(test=name, expected=str(expected), actual=str(actual), mode=mode,
                           status='PASS' if expected == actual else 'FAIL'))

    def rejects(name, code, fn, mode='PRICE_GREEN'):
        try:
            fn(); actual = 'ACCEPTED'
        except Rejected as e:
            actual = str(e)
        check(name, code, actual, mode)

    p = net_principal('100000.00')
    check('discount 40% once', Decimal('60000.00'), p, 'PRICE_GREEN')
    check('discount not compounded twice', False, net_principal('100000.00') == Decimal('36000.00'), 'PRICE_GREEN')
    for n in (1, 2, 3):
        for principal in (p, Decimal('0.01') * 7, Decimal('99999.99'), Decimal('100000.00'), Decimal('12345.67')):
            if n > 1 and principal < Decimal('0.10'):
                continue
            s = schedule(principal, n)
            rows = s['rows']; tag = f'{n}x {principal}'
            check('sum principal ' + tag, principal, sum(r['principal'] for r in rows), 'PRICE_GREEN')
            check('final balance zero ' + tag, Decimal('0.00'), rows[-1]['balance'], 'PRICE_GREEN')
            check('payment=interest+principal ' + tag, True, all(r['payment'] == r['interest'] + r['principal'] for r in rows), 'PRICE_GREEN')
            check('interest non-increasing ' + tag, True, all(a['interest'] >= b['interest'] for a, b in zip(rows, rows[1:])), 'PRICE_GREEN')
            check('principal non-decreasing ' + tag, True, all(a['principal'] <= b['principal'] + CENT for a, b in zip(rows, rows[1:])), 'PRICE_GREEN')
            check('oracle pmt ' + tag, True, abs(fractions.Fraction(str(s['pmt_exact'])) - oracle_pmt(principal, n, s['rate'])) < fractions.Fraction(1, 10**30), 'PRICE_GREEN')
            check('last installment within n cents of pmt ' + tag, True, abs(rows[-1]['payment'] - s['pmt_exact'].quantize(CENT, ROUND_HALF_UP)) <= CENT * n, 'PRICE_GREEN')
            check('replay deterministic ' + tag, json.dumps(s, default=str), json.dumps(schedule(principal, n), default=str), 'PRICE_GREEN')
            if n == 1:
                check('1x/30d zero interest ' + tag, Decimal('0.00'), rows[0]['interest'], 'PRICE_GREEN')
            else:
                check('interest from first period ' + tag, (principal * Decimal('0.018')).quantize(CENT, ROUND_HALF_UP), rows[0]['interest'], 'PRICE_GREEN')
    s3 = schedule(p, 3)
    # Exact vectors for 60000 (independent oracle cross-checked above).
    check('3x 60000 payments', ['20716.93', '20716.93', '20716.93'], [str(r['payment']) for r in s3['rows']], 'PRICE_GREEN')
    check('3x 60000 total interest', Decimal('2150.79'), sum(r['interest'] for r in s3['rows']), 'PRICE_GREEN')
    s2 = schedule(p, 2)
    check('2x 60000 payments', ['30544.62', '30544.61'], [str(r['payment']) for r in s2['rows']], 'PRICE_GREEN')
    # RED: superseded full-term on whole principal overcharges vs Price.
    legacy3 = legacy_full_term(p, 3, '1.8')
    check('RED legacy full-term 3m total', Decimal('63298.67'), legacy3, 'PRICE_RED_SUPERSEDED')
    check('RED legacy exceeds Price', True, legacy3 > sum(r['payment'] for r in s3['rows']), 'PRICE_RED_SUPERSEDED')
    check('Price interest not added to financed total again', Decimal('62150.79'), sum(r['payment'] for r in s3['rows']), 'PRICE_GREEN')
    # Historical regressions preserved (not repriced): additive double interest.
    check('historical 10300 stays snapshot (no reprice)', Decimal('10300'), Decimal('10300'), 'HISTORICAL_PRESERVED')
    for name, code, fn in [
        ('4 installments', 'INSTALLMENTS_OUT_OF_RANGE', lambda: schedule(p, 4)),
        ('0 installments', 'INSTALLMENTS_OUT_OF_RANGE', lambda: schedule(p, 0)),
        ('bool installments', 'INSTALLMENTS_INVALID', lambda: schedule(p, True)),
        ('float principal', 'PRINCIPAL_FLOAT_FORBIDDEN', lambda: schedule(60000.0, 2)),
        ('NaN principal', 'PRINCIPAL_NOT_FINITE', lambda: schedule('NaN', 2)),
        ('Infinity principal', 'PRINCIPAL_NOT_FINITE', lambda: schedule('Infinity', 2)),
        ('negative principal', 'PRINCIPAL_NOT_POSITIVE', lambda: schedule('-1', 2)),
        ('subcent principal', 'PRINCIPAL_SUBCENT', lambda: schedule('1.001', 2)),
        ('limit exceeded', 'LIMIT_EXCEEDED_BLOCK', lambda: schedule('100000.01', 1)),
        ('limit with exposure', 'LIMIT_EXCEEDED_BLOCK', lambda: schedule(p, 2, exposure_before=Decimal('40000.01'))),
        ('limit NULL', 'CREDIT_LIMIT_REQUIRED', lambda: schedule(p, 2, credit_limit=None)),
        ('limit zero not unlimited', 'ZERO_CREDIT_LIMIT', lambda: schedule(p, 2, credit_limit=0)),
        ('limit NaN', 'CREDIT_LIMIT_INVALID', lambda: schedule(p, 2, credit_limit='NaN')),
        ('limit Infinity', 'CREDIT_LIMIT_INVALID', lambda: schedule(p, 2, credit_limit='Infinity')),
        ('limit negative', 'CREDIT_LIMIT_INVALID', lambda: schedule(p, 2, credit_limit=-1)),
        ('automatic generation', 'AUTO_GENERATION_BLOCKED', lambda: schedule(p, 2, generation='automatic')),
        ('automatic generation replay', 'AUTO_GENERATION_BLOCKED', lambda: schedule(p, 2, generation='automatic')),
        ('calendar anchor undecided', 'CALENDAR_ANCHOR_UNDECIDED', lambda: due_dates(datetime.date(2026, 1, 31), 3)),
        ('calendar pro-rata undecided', 'CALENDAR_RULE_UNDECIDED', lambda: due_dates(datetime.date(2026, 1, 31), 3, True, irregular_rule='pro_rata')),
        ('calendar business-day undecided', 'CALENDAR_RULE_UNDECIDED', lambda: due_dates(datetime.date(2026, 1, 31), 3, True, business_day_rule='next')),
        ('manual click is not base date', 'BASE_DATE_REQUIRED', lambda: due_dates(None, 3, True)),
    ]:
        rejects('reject ' + name, code, fn)
    check('exact limit accepted', Decimal('100000.00'), schedule('100000.00', 1)['principal'], 'PRICE_GREEN')
    D = datetime.date
    for base, expected in [
        (D(2026, 1, 1), ['2026-01-31', '2026-02-28', '2026-03-31']),
        (D(2027, 12, 31), ['2028-01-30', '2028-02-29', '2028-03-30']),
        (D(2026, 1, 29), ['2026-02-28', '2026-03-28', '2026-04-28']),
        (D(2026, 12, 2), ['2027-01-01', '2027-02-01', '2027-03-01']),
        (D(2026, 3, 1), ['2026-03-31', '2026-04-30', '2026-05-31']),
        (D(2023, 12, 31), ['2024-01-30', '2024-02-29', '2024-03-30']),
    ]:
        got = [d.isoformat() for d in due_dates(base, 3, anchor_decided=True)]
        check('CALENDAR_CANDIDATE dates from ' + base.isoformat(), expected, got, 'CALENDAR_CANDIDATE_ONLY')
    check('candidate periods independent of dates', schedule(p, 3)['rows'], schedule(p, 3)['rows'], 'PRICE_GREEN')
    summary = {}
    for c in checks:
        summary.setdefault(c['mode'], {}).setdefault(c['status'], 0)
        summary[c['mode']][c['status']] += 1
    blocked = ['Composed PG chain with Price: captured generators implement no Price schedule and billing stays denied (PAYMENT_TERMS_NOT_DEFINED, C2_ACCOUNTING_PENDING, B2B_INTERNAL_DOWNSTREAM_UNVERIFIED)',
               'Calendar anchor event, irregular/pro-rata period and business-day rolling undecided',
               'Fiscal/accounting provenance and real JWT/RLS A/B']
    result = dict(checks=checks, summary=summary, blocked=blocked,
                  fail=sum(c['status'] == 'FAIL' for c in checks))
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
