import { fireEvent, screen } from "@testing-library/react";

/**
 * Costura de teste B2B_PAYMENT_METHOD_V1 para as telas de pedido: o vendedor oferece UM meio (Pix, 5 dias após a NF)
 * em qualquer condição. Simulação/criação com meio delegam ao handler legado do próprio teste (mesmos valores e
 * respostas atrasadas) e só acrescentam o envelope do meio. Não é prova de servidor.
 */
export const TEST_PIX_CONFIG = "7a7a7a7a-0000-4000-8000-00000000000a";
export const TEST_PIX = { config_id: TEST_PIX_CONFIG, version: 1 };

type Handler = (name: string, args?: Record<string, unknown>) => unknown;
type Reply = { data: unknown; error: unknown };

function withAbort<T extends Promise<unknown>>(p: T) { return Object.assign(p, { abortSignal: () => p }); }

function augmentSim(data: unknown) {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown> & { schedule?: Array<{ installment_number: number; due_date: string; amount: number; principal_amount?: number; interest_amount?: number }>; amounts?: { final_amount?: number } };
  const est = (d.schedule ?? []).map((s) => ({ installment_number: s.installment_number, estimated_due_date: s.due_date, amount: s.amount,
    principal_amount: s.principal_amount ?? s.amount, interest_amount: s.interest_amount ?? 0 }));
  return { ...d, payment_method_contract: "B2B_PAYMENT_METHOD_V1",
    payment_method: { ...TEST_PIX, method_kind: "pix", payment_method_name: "Pix", due_days: 5, installment_count: 1 },
    due_basis: "nf_issue", schedule_estimated: true, estimated_schedule: est, estimated_total: d.amounts?.final_amount ?? null };
}

/** `via` (ex.: o próprio mock rpc) registra também a chamada delegada com o nome legado. */
export function withPaymentMethod(inner: Handler, via?: Handler): Handler {
  const call = via ?? inner;
  return (name, args) => {
    if (name === "b2b_list_payment_method_options_secure")
      return withAbort(Promise.resolve({ data: { contract: "B2B_PAYMENT_METHOD_V1", partner_id: args?.p_partner_id, payment_plan_id: args?.p_payment_plan_id,
        due_basis: "nf_issue", options: [{ ...TEST_PIX, method_kind: "pix", available: true, payment_method_name: "Pix", due_days: 5, installment_count: 1 }] }, error: null }));
    if (name === "simulate_b2b_payment_plan_with_method_secure") {
      const { p_method_config_id: _c, p_method_config_version: _v, ...rest } = args ?? {};
      return Promise.resolve(call("simulate_b2b_payment_plan_secure", { ...rest, p_first_due_date: null }) as Promise<Reply>)
        .then((r) => (r && !r.error ? { ...r, data: augmentSim(r.data) } : r));
    }
    if (name === "create_partner_order_with_method_secure") {
      const { p_method_config_id: cid, p_method_config_version: ver, ...rest } = args ?? {};
      return Promise.resolve(call("create_partner_order_secure", { ...rest, p_first_due_date: null, p_installment_count: null }) as Promise<Reply>)
        .then((r) => (r && !r.error && r.data && typeof r.data === "object"
          ? { ...r, data: { ...(r.data as object), payment_method: { config_id: cid, version: ver, method_kind: "pix", schedule_estimated: true } } } : r));
    }
    return inner(name, args);
  };
}

/** Escolha explícita do meio pelo comprador (nunca automática). */
export async function pickTestPix() {
  fireEvent.click(await screen.findByRole("radio", { name: /Pix/ }));
}
