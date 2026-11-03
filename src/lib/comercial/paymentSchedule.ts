import { isCivilDate } from './civilDate';
import { priceSchedule } from './price';
import { requirePaymentChoice, type PaymentChoice } from './paymentContract';

export interface HolidayCalendar {
  locality: 'Paracatu-MG'; version: string; coverage_start: string; coverage_end: string;
  holidays: readonly string[];
}
function addDays(value: string, days: number) {
  const d = new Date(`${value}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function nextBusinessDay(value: string, calendar: HolidayCalendar) {
  if (!isCivilDate(value) || !calendar || calendar.locality !== 'Paracatu-MG' || typeof calendar.version !== 'string' || !calendar.version.trim()
    || !isCivilDate(calendar.coverage_start) || !isCivilDate(calendar.coverage_end) || calendar.coverage_start > calendar.coverage_end
    || !Array.isArray(calendar.holidays) || calendar.holidays.some(day => !isCivilDate(day) || day < calendar.coverage_start || day > calendar.coverage_end)) throw new Error('CALENDAR_INVALID');
  let day = value;
  for (;;) {
    if (day < calendar.coverage_start || day > calendar.coverage_end) throw new Error('CALENDAR_COVERAGE_REQUIRED');
    const weekDay = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekDay !== 0 && weekDay !== 6 && !calendar.holidays.includes(day)) return day;
    day = addDays(day, 1);
  }
}
/** Preview only, never issues a title, claims settlement or dispatches a fiscal event.
 * Accepted condition supplies rate explicitly; delivery/manual creation never anchor it. */
export function paymentSchedule(choice: PaymentChoice, principal: number, rate: number, count: number, authorizedIssueDate: string, calendar: HolidayCalendar) {
  choice = requirePaymentChoice(choice);
  if (!isCivilDate(authorizedIssueDate) || !Number.isSafeInteger(choice.payment_deadline_days) || choice.payment_deadline_days < 0) throw new Error('FISCAL_DATE_REQUIRED');
  const cash = ['dinheiro', 'pix', 'cartao_debito'].includes(choice.payment_method);
  if (cash && (count !== 1 || rate !== 0)) throw new Error('CASH_SINGLE_INSTALLMENT');
  if (choice.payment_method === 'boleto' && (count > 3 || choice.payment_deadline_days !== 30)) throw new Error('BOLETO_SCHEDULE_INVALID');
  const first = addDays(authorizedIssueDate, choice.payment_deadline_days);
  const [year, month, day] = first.split('-').map(Number);
  return priceSchedule(principal, rate, count).map((row, i) => {
    const target = new Date(Date.UTC(year, month - 1 + i, 1));
    const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, last));
    const nominal_due_date = target.toISOString().slice(0, 10);
    return { ...row, nominal_due_date, due_date: nextBusinessDay(nominal_due_date, calendar), received_amount: 0 };
  });
}