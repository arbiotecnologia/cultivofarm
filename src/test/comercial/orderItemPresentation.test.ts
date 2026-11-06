import { expect, it } from "vitest";
import { orderItemQuantityLabel } from "@/lib/comercial/orderItemPresentation";
// Snapshots exatos de PB-001036 (leitura read-only): 2×TESTE-KG-25 25 kg a R$ 9 e 1×1 L a R$ 0,90.
it("embalagem mostra quantidade, código e peso do snapshot", () => {
  expect(orderItemQuantityLabel({ quantidade: 2, packaging_codigo_snapshot: "TESTE-KG-25", packaging_peso_liquido_kg_snapshot: 25, packaging_unidade_conteudo_snapshot: "kg" }))
    .toBe("2 embalagens TESTE-KG-25 (25 kg)");
});
it("líquido mostra volume do item", () => {
  expect(orderItemQuantityLabel({ quantidade: 1, unidade_medida: "unidade", volume_ml: 1000 })).toBe("1 × 1 L");
  expect(orderItemQuantityLabel({ quantidade: 3, volume_ml: 500 })).toBe("3 × 500 mL");
});
it("sem embalagem/volume mantém só a quantidade", () => {
  expect(orderItemQuantityLabel({ quantidade: 4 })).toBe("4");
});
