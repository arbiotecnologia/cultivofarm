/**
 * Padrão único do sistema para prazo mínimo de previsão/entrega de pedidos B2B.
 *
 * Regra: mínimo de 8 dias corridos a partir de hoje.
 * - Produção de fungos leva até 7 dias.
 * - Bactérias em ~48h (já contempladas pelo teto de 8 dias).
 *
 * Toda tela que grave `requested_delivery_date` (parceiro) ou
 * `estimated_delivery_date` (comercial Cultivo Farm) DEVE consumir estes utilitários
 * ao invés de duplicar a constante.
 */

export const MIN_DELIVERY_DAYS = 8;

export function minDeliveryDateISO(from: Date = new Date()): string {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + MIN_DELIVERY_DAYS);
  return d.toISOString().slice(0, 10);
}

export function isDeliveryDateValid(iso: string | null | undefined): boolean {
  if (!iso) return true; // vazio é permitido; obrigatoriedade é decidida pela tela
  return iso >= minDeliveryDateISO();
}

export const MIN_DELIVERY_HINT =
  "Prazo mínimo de 8 dias. A data efetiva é confirmada pelo comercial Cultivo Farm após análise do pedido.";

export const MIN_DELIVERY_ERROR =
  "Data inválida: escolha uma data com no mínimo 8 dias a partir de hoje.";
