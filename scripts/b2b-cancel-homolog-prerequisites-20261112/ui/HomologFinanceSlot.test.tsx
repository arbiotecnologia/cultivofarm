import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomologFinanceSlot } from "./HomologFinanceSlot";
import { HOMOLOG_REF, type ReconciliationTitle } from "./reconciliationContract";
afterEach(cleanup);
const invoiceId="11111111-2222-4333-8444-555555555555";
const title: ReconciliationTitle={invoiceId,titleId:"title",orderId:"order",organizationId:"seller",invoiceStatus:"CANCELED",titleStatus:"PARTIAL",reconciliationStatus:"REQUIRES_REVIEW",installments:[{id:"installment",dueDate:"2026-11-12",amount:10,received:1,status:"PARTIAL"}]};
const props={targetRef:HOMOLOG_REF,organizationId:"seller",scopeKey:"actor:seller:1",orderId:"order",serverCapability:{available:true,order_id:"order",organization_id:"seller"}};
describe("ponto Financeiro homolog por capacidade exata",()=>{
 it.each([null,{available:false,order_id:"order",organization_id:"seller"},{available:true,order_id:"foreign",organization_id:"seller"},{available:true,order_id:"order",organization_id:"foreign"}])("sem capacidade exata não consulta",capability=>{
  const readTitle=vi.fn();render(<HomologFinanceSlot {...props} serverCapability={capability} readTitle={readTitle}/>);
  expect(readTitle).not.toHaveBeenCalled();expect(screen.queryByRole("button")).toBeNull();
 });
 it("recusa título de outro pedido mesmo na empresa",async()=>{
  const readTitle=vi.fn().mockResolvedValue({...title,orderId:"foreign"});render(<HomologFinanceSlot {...props} readTitle={readTitle}/>);
  fireEvent.change(screen.getByLabelText("Nota fiscal"),{target:{value:invoiceId}});fireEvent.click(screen.getByRole("button"));
  await screen.findByRole("status");expect(screen.queryByText("title")).toBeNull();expect(readTitle).toHaveBeenCalledTimes(1);
 });
 it("capacidade revogada retira o ponto e descarta a resposta",async()=>{
  let resolve:(v:ReconciliationTitle)=>void=()=>{};const readTitle=vi.fn(()=>new Promise<ReconciliationTitle>(r=>{resolve=r;}));
  const v=render(<HomologFinanceSlot {...props} readTitle={readTitle}/>);
  fireEvent.change(screen.getByLabelText("Nota fiscal"),{target:{value:invoiceId}});fireEvent.click(screen.getByRole("button"));
  v.rerender(<HomologFinanceSlot {...props} serverCapability={null} readTitle={readTitle}/>);resolve(title);
  await waitFor(()=>expect(screen.queryByText("title")).toBeNull());expect(readTitle).toHaveBeenCalledTimes(1);
 });
});