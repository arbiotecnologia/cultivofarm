import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FinanceReconciliationCandidate } from "./FinanceReconciliationCandidate";
import { HOMOLOG_REF, validTitle, type ReconciliationTitle } from "./reconciliationContract";
afterEach(cleanup);
const invoiceId="11111111-2222-4333-8444-555555555555";
const value:ReconciliationTitle={invoiceId,titleId:"exact-title",orderId:"exact-order",organizationId:"seller",invoiceStatus:"CANCELED",titleStatus:"PARTIAL",reconciliationStatus:"REQUIRES_REVIEW",installments:[{id:"exact-installment",dueDate:"2026-11-12",amount:10,received:1,status:"PARTIAL"}]};
const props={targetRef:HOMOLOG_REF,scopeKey:"actor:seller:1",organizationId:"seller"};
describe("Financeiro candidato isolado",()=>{
 it("não consulta fora da cópia homolog",()=>{
  const readTitle=vi.fn();render(<FinanceReconciliationCandidate {...props} targetRef="swzpzcwiasxmjutrmvkm" readTitle={readTitle}/>);
  expect(screen.queryByRole("button")).toBeNull();expect(readTitle).not.toHaveBeenCalled();
 });
 it("localiza título exato com pagamento sem mutação",async()=>{
  const readTitle=vi.fn().mockResolvedValue(value);render(<FinanceReconciliationCandidate {...props} readTitle={readTitle}/>);
  fireEvent.change(screen.getByLabelText("Nota fiscal"),{target:{value:invoiceId}});fireEvent.click(screen.getByRole("button"));fireEvent.click(screen.getByRole("button"));
  await screen.findByText("exact-title");expect(readTitle).toHaveBeenCalledTimes(1);expect(readTitle).toHaveBeenCalledWith(invoiceId);
  expect(screen.getByText(/Há pagamento/)).toBeInTheDocument();expect(screen.getAllByRole("button")).toHaveLength(1);
 });
 it.each([{...value,organizationId:"foreign"},{...value,invoiceId:"foreign"}])("recusa resposta de outro escopo",async result=>{
  const readTitle=vi.fn().mockResolvedValue(result);render(<FinanceReconciliationCandidate {...props} readTitle={readTitle}/>);
  fireEvent.change(screen.getByLabelText("Nota fiscal"),{target:{value:invoiceId}});fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("status");expect(screen.queryByText("exact-title")).toBeNull();
 });
 it("revogação de escopo descarta resposta tardia",async()=>{
  let resolve:(v:ReconciliationTitle)=>void=()=>{};const readTitle=vi.fn(()=>new Promise<ReconciliationTitle>(r=>{resolve=r;}));
  const view=render(<FinanceReconciliationCandidate {...props} readTitle={readTitle}/>);
  fireEvent.change(screen.getByLabelText("Nota fiscal"),{target:{value:invoiceId}});fireEvent.click(screen.getByRole("button"));
  view.rerender(<FinanceReconciliationCandidate {...props} scopeKey="actor:seller:2" readTitle={readTitle}/>);resolve(value);
  await waitFor(()=>expect(screen.queryByText("exact-title")).toBeNull());
 });
 it("rejeita parcelas duplicadas e valores não finitos",()=>{
  expect(validTitle({...value,installments:[value.installments[0],value.installments[0]]},invoiceId,"seller")).toBe(false);
  expect(validTitle({...value,installments:[{...value.installments[0],received:NaN}]},invoiceId,"seller")).toBe(false);
 });
});