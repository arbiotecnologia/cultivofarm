import { describe, it, expect } from "vitest";
import { resumoSaldoReceber } from "@/lib/financeiro/contasReceber";
import { agregarDocumentosReceber } from "@/lib/financeiro/comprovantesReceber";

describe("resumo de saldo da conta a receber (drawer)", () => {
  it("cenário 100 recebido 40, desconto 10, juros 20, multa 5 => saldo 75", () => {
    const r = resumoSaldoReceber([
      { original_amount: 100, received_amount: 40, discount_amount: 10, interest_amount: 20, penalty_amount: 5, status: "PARTIAL" },
    ]);
    expect(r.saldo).toBe(75);
    expect(r.recebido).toBe(40);
    expect(r.juros).toBe(20);
    expect(r.multa).toBe(5);
    expect(r.desconto).toBe(10);
  });

  it("soma parcelas e mostra acumulados discriminados", () => {
    const r = resumoSaldoReceber([
      { original_amount: 100, received_amount: 100, status: "PAID" },
      { original_amount: 50, received_amount: 0, interest_amount: 2, status: "OPEN" },
    ]);
    expect(r.original).toBe(150);
    expect(r.recebido).toBe(100);
    expect(r.juros).toBe(2);
    expect(r.saldo).toBe(52);
  });

  it("parcela cancelada não entra no resumo", () => {
    const r = resumoSaldoReceber([
      { original_amount: 100, received_amount: 0, status: "CANCELED" },
      { original_amount: 40, received_amount: 10, status: "OPEN" },
    ]);
    expect(r.original).toBe(40);
    expect(r.saldo).toBe(30);
  });

  it("conta quitada tem saldo zero", () => {
    const r = resumoSaldoReceber([{ original_amount: 100, received_amount: 100, status: "PAID" }]);
    expect(r.saldo).toBe(0);
  });
});

describe("agregação de documentos do drawer receivable", () => {
  const parcelas = [
    { id: "inst-1", receivable_id: "ar-1", installment_number: 1 },
    { id: "inst-2", receivable_id: "ar-1", installment_number: 2 },
    { id: "inst-outra", receivable_id: "ar-2", installment_number: 1 },
  ];
  const pagamentos = [
    { id: "pay-0", installment_id: "inst-2", payment_date: "2026-09-19", is_reversal: false, reversed_payment_id: null },
    { id: "pay-1", installment_id: "inst-1", payment_date: "2026-09-20", is_reversal: false, reversed_payment_id: null },
  ];

  it("agrega documento direto + comprovante de baixa da mesma conta", () => {
    const docs = agregarDocumentosReceber(
      "ar-1",
      [
        { id: "d-1", owner_type: "RECEIVABLE", owner_id: "ar-1", document_type: "INVOICE", file_name: "nf.pdf" },
        { id: "d-2", owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-1", document_type: "RECEIPT", file_name: "comp.pdf" },
      ],
      pagamentos,
      parcelas,
    );
    expect(docs).toHaveLength(2);
    expect(docs[0]).toMatchObject({ id: "d-1", origem: "conta", estornado: false });
    expect(docs[1]).toMatchObject({ id: "d-2", origem: "pagamento", parcelaNumero: 1, dataPagamento: "2026-09-20", estornado: false });
  });

  it("documento de outra conta não entra", () => {
    const docs = agregarDocumentosReceber(
      "ar-1",
      [
        { id: "d-x", owner_type: "RECEIVABLE", owner_id: "ar-2", document_type: "RECEIPT" },
        { id: "d-y", owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-outro", document_type: "RECEIPT" },
      ],
      [{ id: "pay-outro", installment_id: "inst-outra", is_reversal: false }],
      parcelas,
    );
    expect(docs).toHaveLength(0);
  });

  it("comprovante de pagamento estornado aparece identificado, sem contar como vigente", () => {
    const docs = agregarDocumentosReceber(
      "ar-1",
      [
        { id: "d-1", owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-1", document_type: "RECEIPT" },
        { id: "d-2", owner_type: "PAYMENT_RECEIVABLE", owner_id: "pay-2", document_type: "RECEIPT" },
      ],
      pagamentos,
      parcelas,
    );
    expect(docs).toHaveLength(2);
    const vigentes = docs.filter((d) => !d.estornado);
    expect(vigentes).toHaveLength(0);
    expect(docs.every((d) => d.estornado)).toBe(true);
  });

  it("deduplica por id", () => {
    const docs = agregarDocumentosReceber(
      "ar-1",
      [
        { id: "d-1", owner_type: "RECEIVABLE", owner_id: "ar-1", document_type: "RECEIPT" },
        { id: "d-1", owner_type: "RECEIVABLE", owner_id: "ar-1", document_type: "RECEIPT" },
      ],
      [],
      parcelas,
    );
    expect(docs).toHaveLength(1);
  });
});
