import { expect, it } from 'vitest';
import { productFiscalFormSchema, productFiscalPreparation } from '@/lib/fiscal/productFiscalValidation';
import { ALLOWED_ENVIRONMENTS, buildUpdatePayload, hasSensitiveKey } from '@/lib/fiscal/companyFiscalValidation';
import { FISCAL_PRODUCTION_EMISSION_ALLOWED } from '@/config/fiscalBinding';

// Synthetic formatting only: these codes/issuer never assert lawful real taxation.
const fakeProduct = { ncm: '00000000', cest: '0000000', cfop_in_state: '0000', cfop_interstate: '0000', fiscal_description: 'FICTÍCIO AUDITORIA SEM USO COMERCIAL', commercial_unit: 'L', taxable_unit: 'L' };
it('AUD-FISC-001 produto fiscal sintético preenchido só comprova formato, não emissão', () => {
  expect(productFiscalFormSchema.safeParse(fakeProduct).success).toBe(true);
  expect(productFiscalPreparation({ minimally_classified: true, accounting_validated: true }, true)).toEqual({ stage: 'operation_pending', readyForNfe: false });
});
it('AUD-FISC-002 fiscal incompleto permanece rascunho e indevido por tamanho é negado', () => {
  expect(productFiscalPreparation({ minimally_classified: false }, true).readyForNfe).toBe(false);
  expect(productFiscalFormSchema.safeParse({ ncm: '123' }).success).toBe(false);
});
it('AUD-FISC-003 emitente não recebe estado de produção ou atestado contábil pelo editor', () => {
  expect(ALLOWED_ENVIRONMENTS).not.toContain('PRODUCTION');
  expect(buildUpdatePayload({ configuration_status: 'VALIDATED' })).not.toHaveProperty('configuration_status');
  expect(FISCAL_PRODUCTION_EMISSION_ALLOWED).toBe(false);
});
it('AUD-FISC-004 credencial embutida em configuração é indevida', () => {
  expect(hasSensitiveKey({ nfe_configuration: { token: 'SYNTHETIC_NOT_A_CREDENTIAL' } })).toBe(true);
});