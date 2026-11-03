import { expect, it } from 'vitest';
import projection from './fixtures/money-origin-projection.json';
import { calcularSaldoRecebivel } from '@/lib/financeiro/baixaRecebimento';
import { saldoParcela } from '@/lib/financeiro/contasReceber';
import type { ParcelaReceber } from '@/lib/financeiro/baixaRecebimento';
const projected = projection.audit_fixture_projection[0] as ParcelaReceber;
// Exact PG projection fixture, same test on b1677a6 and candidate. Never number heuristics.
it('AUD-FIN001 explicit generator projection10300 includes financing300',()=>expect(calcularSaldoRecebivel(projected)).toBe(10300));
it('AUD-FIN002 same origin projection gives KPI10300',()=>expect(saldoParcela(projected)).toBe(10300));
it('legacy principal10000+interest300 remains10300',()=>expect(calcularSaldoRecebivel({original_amount:10000,interest_amount:300})).toBe(10300));
it('legacy late interest10300+100 remains10400',()=>expect(calcularSaldoRecebivel({original_amount:10300,interest_amount:100})).toBe(10400));