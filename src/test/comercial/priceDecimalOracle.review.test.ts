import { expect,it } from 'vitest';
import oracle from '../../../docs/correcoes-b2b-arbio-20261031-evidencias/revisao-0230/price-decimal-oracle.json';
import { priceSchedule } from '@/lib/comercial/price';
it.each(oracle.vectors)('Decimal externo sintético: $principal / $monthly_percent / $count',vector=>{
 const rows=priceSchedule(Number(vector.principal),Number(vector.monthly_percent),vector.count);
 expect(rows.map(r=>({amount_cents:Math.round(r.original_amount*100),interest_cents:Math.round(r.financed_interest_amount*100),principal_cents:Math.round(r.principal_amount*100),balance_cents:Math.round(r.balance*100)}))).toEqual(vector.rows);
 expect(rows.at(-1)?.balance).toBe(0);
 expect(rows.reduce((sum,r)=>sum+Math.round(r.principal_amount*100),0)).toBe(Math.round(Number(vector.principal)*100));
});