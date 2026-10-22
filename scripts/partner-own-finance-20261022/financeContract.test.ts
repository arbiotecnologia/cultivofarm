import {describe,expect,it} from "vitest";
import {parseOwnFinance} from "./financeContract";
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const base=()=>({contract:"C2_OWN_OBLIGATIONS_V1",partner_id:A,limit:50,documents_enabled:false,rows:[{id:A,order_id:A,numero:"OWN",created_at:"2026-10-22T00:00:00Z",total:100,status:"PARTIAL",installments:[{id:A,numero:1,vencimento:"2026-11-01",valor:100,recebido:25,status:"PARTIAL"}]}]});
describe("own finance strict boundary",()=>{
 it("retains exact title/payment values without invented balance",()=>expect(parseOwnFinance(base(),A)).toEqual(base()));
 it("denies sibling partner",()=>expect(()=>parseOwnFinance(base(),B)).toThrow());
 it.each([NaN,Infinity,-1])("rejects invalid amount %s",total=>{const d=base();d.rows[0].total=total;expect(()=>parseOwnFinance(d,A)).toThrow();});
 it("denies widened docs",()=>expect(()=>parseOwnFinance({...base(),documents_enabled:true},A)).toThrow());
 it("denies unreviewed field",()=>expect(()=>parseOwnFinance({...base(),revenue:300},A)).toThrow());
 it("bounds50 titles",()=>{const d=base();d.rows=Array.from({length:51},()=>d.rows[0]);expect(()=>parseOwnFinance(d,A)).toThrow();});
});