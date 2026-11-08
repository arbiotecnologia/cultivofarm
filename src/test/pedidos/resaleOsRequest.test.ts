import { describe, expect, it, vi } from "vitest";
import { createResaleOsRequest, decodeResaleOsAvailability, type ResaleOsFence } from "@/lib/comercial/resaleOsRequest";

const orderId = "10000000-0000-4000-8000-000000000001";
const itemId = "10000000-0000-4000-8000-000000000002";
const osId = "10000000-0000-4000-8000-000000000003";
const actor = "10000000-0000-4000-8000-000000000004";
const tenant = "10000000-0000-4000-8000-000000000005";
const intent = { orderId, itemId, observed: "2026-11-08T21:12:00Z" };
const fence: ResaleOsFence = { actor, tenant, epoch: 1, ready: true };
const ack = { ok: true, replay: false, contract: "B2B_RESALE_OS_V1", order_id: orderId, order_item_id: itemId, os_id: osId };
const availability = { contract: "B2B_RESALE_OS_AVAILABILITY_V1", order_id: orderId, actor_id: actor, organization_id: tenant, observed_updated_at: intent.observed, available: true, items: [{ order_item_id: itemId, os_id: null, create_available: true }] };

describe("leitor e writer candidatos de OS — sem rede", () => {
  it("aceita somente envelope do mesmo ator, tenant, pedido e CAS", () => {
    expect(decodeResaleOsAvailability(availability, { orderId, actor, tenant })).toEqual(availability);
    for (const bad of [{ ...availability, actor_id: osId }, { ...availability, organization_id: osId }, { ...availability, order_id: osId }, { ...availability, observed_updated_at: "2026-11-08" }]) {
      expect(() => decodeResaleOsAvailability(bad, { orderId, actor, tenant })).toThrow();
    }
  });
  it("gate fechado com item disponível ou OS duplicada/criável é inválido", () => {
    expect(() => decodeResaleOsAvailability({ ...availability, available: false }, { orderId, actor, tenant })).toThrow();
    expect(() => decodeResaleOsAvailability({ ...availability, items: [{ order_item_id: itemId, os_id: osId, create_available: true }] }, { orderId, actor, tenant })).toThrow();
  });
  it("writer envia CAS/chave, sem ator, tenant ou dados econômicos", async () => {
    const rpc = vi.fn(async () => ({ data: ack, error: null }));
    await expect(createResaleOsRequest(rpc, () => fence, () => "request-key-0001")(intent)).resolves.toEqual(ack);
    expect(rpc).toHaveBeenCalledWith("rpc_b2b_resale_os_create_v1", { p_order_id: orderId, p_order_item_id: itemId, p_expected_updated_at: intent.observed, p_request_key: "request-key-0001" });
  });
  it("resposta incerta retém a mesma chave e bloqueia CAS/intenção alterada", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "lost" } }).mockResolvedValue({ data: { ...ack, replay: true }, error: null });
    const run = createResaleOsRequest(rpc, () => fence, () => "request-key-0001");
    await expect(run(intent)).rejects.toThrow();
    await expect(run({ ...intent, observed: "2026-11-08T21:13:00Z" })).rejects.toThrow("não reconciliada");
    await expect(run(intent)).resolves.toMatchObject({ replay: true });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });
  it("ACK tardio após troca de ator/tenant/época não é adotado nem reutilizado", async () => {
    let current = fence;
    const rpc = vi.fn(async () => { current = { ...fence, actor: osId, epoch: 2 }; return { data: ack, error: null }; });
    const run = createResaleOsRequest(rpc, () => current, () => "request-key-0001");
    await expect(run(intent)).rejects.toThrow("Sessão alterada");
    await expect(run(intent)).rejects.toThrow("não reconciliada");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("lock síncrono impede duas chamadas; sucesso libera nova intenção", async () => {
    let resolve!: (value: { data: unknown; error: null }) => void;
    const rpc = vi.fn().mockImplementationOnce(() => new Promise<{ data: unknown; error: null }>((r) => { resolve = r; })).mockResolvedValue({ data: ack, error: null });
    const run = createResaleOsRequest(rpc, () => fence, () => "request-key-0001");
    const first = run(intent);
    await expect(run(intent)).rejects.toThrow("indisponível");
    resolve({ data: ack, error: null }); await first;
    await run(intent);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([{ ...ack, order_id: itemId }, { ...ack, ok: false }, { ...ack, os_id: null }, { ...ack, contract: "other" }])("ACK substituído/negativo não confirma", async (data) => {
    await expect(createResaleOsRequest(async () => ({ data, error: null }), () => fence)(intent)).rejects.toThrow();
  });
});
