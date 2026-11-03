import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const capture=JSON.parse(readFileSync('scripts/financial-installments-initial-20261024/receivable-recursive-live-20261029.json','utf8'));
function captured(name:string) {
 const matches=capture.functions.filter((f:{name:string;schema:string})=>f.name===name && f.schema==='public');
 expect(matches).toHaveLength(1);const f=matches[0];expect(createHash('md5').update(f.body).digest('hex')).toBe(f.md5);return f.body as string;
}
it('captured approval contract is void, not a mandatory success envelope',()=>expect(captured('approve_partner_order')).toContain('RETURNS void'));
it('captured B2B writer stores payment amount AND interest: unknown origin cannot be guessed',()=>{
 const body=captured('generate_b2b_receivable_secure_impl');
 expect(body).toContain('original_amount=v_sch.amount');expect(body).toContain('interest_amount=COALESCE(v_sch.interest_amount,0)');
});
it('characterization only: any financial link excludes the whole committed order; partial residual NOT implemented',()=>{
 const body=captured('fn_b2b_credit_exposure');
 expect(body).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.partner_order_financial_links pofl\s+WHERE pofl\.partner_order_id = po\.id\)/);
});