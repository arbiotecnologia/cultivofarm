/**
 * Fase Fiscal 3.20.1 — SUÍTE APOSENTADA (Fase 3.21).
 *
 * Motivo: esta suíte assumia que o vínculo microrganismo→produto era a
 * ÚNICA fonte fiscal do microrganismo. A Fase 3.21 introduziu
 * `microorganism_fiscal_profiles` — perfil fiscal próprio — e o vínculo
 * comercial a produto passou a ser estritamente OPCIONAL, jamais
 * requisito para faturamento fiscal.
 *
 * Cobertura equivalente (novo contrato) está em:
 *   - src/test/fiscal/fase3_20.unified_list.ui.test.tsx (UI unificada)
 *   - src/test/fiscal/fase3_21.resolver_micro.test.ts (resolver puro)
 *   - src/test/fiscal/fase3_21.migration.static.test.ts (migration)
 *
 * Mantemos o arquivo como marcador histórico auditável. Os testes ficam
 * `skip` para preservar rastreabilidade sem gerar falhas.
 */
import { describe, it } from "vitest";

describe.skip("Fase 3.20.1 — resolver produto vinculado (aposentado pela Fase 3.21)", () => {
  it("substituído por fase3_21.resolver_micro.test.ts", () => { /* noop */ });
});
