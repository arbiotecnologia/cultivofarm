# Fase Fiscal 3.19 — Adequação Legal 2026 + CNPJ Alfanumérico

Relatório curto da entrega. Escopo estritamente aditivo e auditável.

## Escopo entregue (sem deploy)

1. **CNPJ alfanumérico (IN RFB 2.229/2024, vigente 07/2026)**
   - Novo módulo `src/lib/fiscal/cnpjAlpha.ts` com:
     - `unmaskCnpjAlpha` (preserva letras, força uppercase, remove somente
       pontuação/espaços).
     - `formatCnpjAlpha` / `formatCNPJ` — máscara `XX.XXX.XXX/XXXX-XX`
       aceitando A–Z nas 12 primeiras posições.
     - `validateCnpjAlpha` — DV oficial `(ASCII − 48)` mod-11.
   - Compatibilidade preservada: CNPJs 100% numéricos continuam válidos e
     recebem a mesma máscara.
   - `src/lib/validators/cpfCnpj.ts` e `src/lib/fiscal/companyFiscalValidation.ts`
     passam a delegar para o novo validador. `normalizeCnpj` agora usa
     `unmaskCnpjAlpha`, então letras NÃO são mais silenciosamente removidas.

2. **RTC 2026 — IBS/CBS**
   - Contrato TS puro em `src/lib/fiscal/rtcConfiguration.ts`:
     - `rtcCompanySchema` (config no nível da empresa).
     - `ibsCbsItemSchema` (config por produto/serviço).
     - `rtcHasSensitiveKey` — rejeita chaves sensíveis (`token`, `secret`,
       `certificate`, `private_key`, …) em qualquer profundidade.
   - Novas opções em `fiscalOptions.ts`:
     - `RTC_CST_IBS_CBS_OPTIONS`, `RTC_FIN_NFSE_OPTIONS`, `RTC_C_IND_OP_OPTIONS`.
     - Catálogos ampliados de `IPI_CST_OPTIONS` e `PIS_COFINS_CST_OPTIONS`
       para a Tabela I do RIPI e Tabelas 4.3.3/4.3.4.

3. **Migração aditiva (não aplicada)**
   - `supabase/migrations/20260727000000_fiscal_fase3_19_rtc_2026.sql`:
     - `ADD COLUMN IF NOT EXISTS rtc_configuration jsonb DEFAULT '{}'::jsonb`
       em `company_fiscal_settings`.
     - `ADD COLUMN IF NOT EXISTS ibs_cbs_configuration jsonb DEFAULT '{}'::jsonb`
       em `product_fiscal_profiles` e `service_fiscal_profiles`.
     - Alarga `document_number` para `varchar(18)` **somente** se o limite
       atual for menor — nunca reduz, nunca reescreve dados.
   - Sem RLS/GRANT/trigger novos. Sem backfill obrigatório.

## Fora do escopo (para próximas fases)

- UI de edição RTC/IBS/CBS nas telas de Empresa/Produtos/Serviços.
- Emissão real com IBS/CBS (aguarda NT NF-e 2025.002 vFinal e NFS-e
  NT 007/2026 vFinal serem homologadas pelo contador).
- Alíquotas efetivas: os campos `aliquota_*_reference` são apenas
  informativos; nunca são usados como valor efetivo em cálculo.

## Segurança e privacidade

- `rtcHasSensitiveKey` bloqueia `token`, `password`, `secret`, `apikey`,
  `certificate`, `private_key`, `authorization`, `bearer` etc. em qualquer
  profundidade antes da persistência.
- Máscara CNPJ nunca expõe DV completo em telas com PII redigido.
- Nenhuma dependência nova. Nenhuma extensão nova. Nenhum RPC novo.

## Validações executadas nesta entrega

- `bun run typecheck` — OK.
- `bun run build` — OK.
- `bun test src/test/fiscal/cnpjAlpha.test.ts` — cobertura de CNPJ numérico
  legado, CNPJ alfanumérico com letras, DV inválido, máscara parcial,
  detecção de chaves sensíveis no schema RTC.

## Referências

- IN RFB nº 2.229/2024 — CNPJ alfanumérico.
- LC 214/2025 e LC 227/2026 — Reforma Tributária (IBS/CBS/IS).
- NT NF-e 2025.002 v1.60 e NT 2026.004 v1.01.
- NFS-e Nacional NT 007/2026, NT 009/2026, Anexos VI v4 / VII v2.
