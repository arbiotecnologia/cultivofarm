import { expect, it } from 'vitest';
import { requirePaymentChoice, type PaymentChoice } from '@/lib/comercial/paymentContract';
import { nextBusinessDay, paymentSchedule, type HolidayCalendar } from '@/lib/comercial/paymentSchedule';
const choice: PaymentChoice={payment_method:'pix',payment_condition_version:1,payment_deadline_days:7};
const calendar:HolidayCalendar={locality:'Paracatu-MG',version:'synthetic-test-only',coverage_start:'2026-01-01',coverage_end:'2026-12-31',holidays:['2026-11-02']};
it.each(['constructor','toString','__proto__','unknown','PIX',''])('nega meio desconhecido/herdado %s no consumidor de cronograma',method=>{
 const input={...choice,payment_method:method} as PaymentChoice;
 expect(()=>requirePaymentChoice(input)).toThrow('payment_choice_required');
 expect(()=>paymentSchedule(input,10000,0,1,'2026-11-03',calendar)).toThrow('payment_choice_required');
});
it.each([0,-1,1.5,NaN])('cronograma nega versão %s',version=>expect(()=>paymentSchedule({...choice,payment_condition_version:version},10000,0,1,'2026-11-03',calendar)).toThrow('payment_choice_required'));
it.each([
 {coverage_start:'2026-02-30'}, {coverage_end:'invalid'},
 {coverage_start:'2027-01-01'}, {holidays:['2026-02-30']},
 {holidays:['2027-01-01']}, {holidays:null}, {version:' '},
])('nega calendário malformado %#',patch=>expect(()=>nextBusinessDay('2026-11-03',{...calendar,...patch} as HolidayCalendar)).toThrow('CALENDAR_INVALID'));
it('limite de cobertura no deslocamento não tem fallback',()=>expect(()=>nextBusinessDay('2026-11-01',{...calendar,coverage_end:'2026-11-02'})).toThrow('CALENDAR_COVERAGE_REQUIRED'));
it('emissão autorizada D+7, uma parcela, sem quitação e sem juros tácitos',()=>{
 const rows=paymentSchedule(choice,10000,0,1,'2026-11-03',calendar);
 expect(rows).toHaveLength(1);expect(rows[0].due_date).toBe('2026-11-10');expect(rows[0].received_amount).toBe(0);expect(rows[0].original_amount).toBe(10000);
});