
## Objetivo

Melhorar o preenchimento de todo o módulo **Fiscal** trocando campos de texto livre por **listas de escolha (Select)** quando o valor pertence a um domínio oficial da legislação, e adicionar **placeholders, helpers e tooltips** para os campos que costumam gerar dúvida. Alteração puramente de **UI/apresentação** — sem tocar em banco, RPCs, RLS, feature flags ou regras de validação já existentes.

Trabalho dividido em duas fases numeradas — implementar Fase A e aguardar aprovação antes da Fase B, conforme regra do projeto.

---

## Fase A — Selects guiados e helpers (somente UI)

### Arquivo novo — dicionário de opções

`src/lib/fiscal/fiscalOptions.ts` (~120 linhas). Exporta arrays `{ value, label, hint? }[]` com rótulos oficiais em pt-BR e código prefixado (ex.: `1 — Simples Nacional`):

- `CRT_OPTIONS` — 1 a 4
- `TAX_REGIME_OPTIONS` — Simples Nacional, Lucro Presumido, Lucro Real, MEI, Imune/Isento
- `UF_OPTIONS` — 27 UFs
- `COUNTRY_OPTIONS` — mínimo `1058 — Brasil` (default SEFAZ)
- `PRESENCE_OPTIONS` — NT2011.004 (0,1,2,3,4,5,9)
- `FREIGHT_MODALITY_OPTIONS` — 0,1,2,3,4,9
- `RPS_TYPE_OPTIONS` — 1 RPS, 2 Mista, 3 Cupom
- `NFSE_SPECIAL_REGIME_OPTIONS` — 1 a 6
- `ORIGIN_CODE_OPTIONS` — 0 a 8
- `ICMS_CST_OPTIONS` — 00, 10, 20, 30, 40, 41, 50, 51, 60, 70, 90
- `ICMS_CSOSN_OPTIONS` — 101, 102, 103, 201, 202, 203, 300, 400, 500, 900
- `IPI_CST_OPTIONS` — 00, 49, 50, 99
- `PIS_CST_OPTIONS` / `COFINS_CST_OPTIONS` — 01, 02, 04, 05, 06, 07, 08, 09, 49, 99
- `STATE_REG_STATUS_OPTIONS` — Contribuinte / Isento / Não contribuinte

### `src/pages/configuracoes/FiscalEmpresa.tsx`

Estender `SelectNative` local para aceitar `options: Array<string | {value,label}>` (retrocompatível). Trocar por Select:

- **Empresa → Identificação**: CRT, Regime tributário; helpers em CNAE (7 dígitos) e IE ("ISENTO")
- **Empresa → Endereço**: UF, Código do país; helper no IBGE
- **NF-e**: Indicador de presença, Modalidade de frete; placeholders/tooltips em CFOP interno/interestadual e Natureza padrão
- **NFS-e**: Tipo RPS, Regime especial; tooltip em Item LC 116; sufixo `%` + helper em Alíquota ISS; helper em CNAE

### `src/pages/configuracoes/FiscalClientes.tsx`

Ampliar `STRING_FIELD_META` para aceitar `select?: OptionList`:
- UF fiscal → `UF_OPTIONS`
- País → `COUNTRY_OPTIONS`
- Situação da IE → `STATE_REG_STATUS_OPTIONS`
- Helper no IBGE; máscaras existentes de e-mail/telefone/CEP preservadas

### `src/pages/configuracoes/FiscalProdutos.tsx`

No dialog de edição:
- origin_code, icms_cst, icms_csosn, ipi_cst, pis_cst, cofins_cst → Selects
- ncm (8 dígitos), cest (7 dígitos), cfop_in_state/interstate → mantém input + placeholder + tooltip
- gtin/taxable_gtin → helper "GTIN-13/14 ou `SEM GTIN`"
- Helper cruzado ICMS CST × CSOSN (Regime Normal vs Simples Nacional)

### `src/pages/configuracoes/FiscalServicos.tsx`

- cnae, incidence_municipality_ibge_code, lc116_item → mantém input + helpers/tooltips
- requirement_status → Select simples se o schema permitir (verifico ao implementar sem alterar Zod); senão só placeholder

### Compatibilidade com dados legados

Para todo Select cujo valor persistido não pertença à lista canônica, exibir opção `— manter valor atual (<x>) —` no topo. Nenhuma coerção automática; nenhuma migração de banco.

### Verificações após Fase A

- `bun run typecheck`
- `bun run build`
- `bunx vitest run` — esperar suíte verde (804). Ajustar seletores de teste em `src/test/fiscal/*.ui.test.tsx` se algum consultar por input agora renderizado como select, sem alterar semântica.

---

## Fase B — Autocomplete por API (planejada, executada só após aprovação da Fase A)

Objetivo: reduzir digitação manual em campos de alto atrito, com fontes públicas gratuitas e sem persistir dados de terceiros.

### B.1 — Autocomplete de CNPJ (Empresa e Clientes)
- Já existe `src/lib/api/brasilapi.ts` com `fetchCNPJ`. Adicionar botão **"Buscar CNPJ"** ao lado do campo em `FiscalEmpresa.tsx` (Identificação) e no formulário de edição de `FiscalClientes.tsx`.
- Ao encontrar, pré-preencher razão social, nome fantasia, CNAE, UF, município, CEP, endereço, telefone. Usuário confirma cada campo antes de salvar (sem overwrite silencioso).
- Fonte: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` (pública, sem chave).

### B.2 — Autocomplete de CEP (Empresa, Clientes)
- Novo helper `src/lib/api/viacep.ts` com `fetchCEP`.
- Ao completar 8 dígitos no campo CEP, buscar automaticamente e preencher logradouro, bairro, cidade, UF, IBGE. Confirmação por toast desfazível.
- Fonte: `https://viacep.com.br/ws/{cep}/json/` (pública, sem chave). Fallback silencioso se offline.

### B.3 — Autocomplete de município IBGE (Empresa, Clientes, Serviços)
- Combobox digitável que lista municípios da UF selecionada, retornando o código IBGE de 7 dígitos.
- Fonte: `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios` (pública, sem chave). Cache em memória por UF durante a sessão.

### B.4 — Sugestão de CNAE (Empresa e Serviços)
- Combobox com busca por descrição/código. Ao selecionar, preenche o código de 7 dígitos.
- Fonte: `https://servicodados.ibge.gov.br/api/v2/cnae/classes` (pública). Cache em memória.

### Não incluído na Fase B
- Consulta de NCM/CEST (não há API pública oficial estável — mantém tooltip).
- Validação online contra tabela SEFAZ de CFOP.
- Persistência de qualquer resposta das APIs em banco (todas as respostas ficam apenas em memória do formulário).

### Notas de execução para Fase B
- Todas as chamadas são feitas no cliente (fetch direto), sem Edge Function e sem segredos — todas as APIs listadas são públicas e sem chave.
- Cada campo autopreenchido deixa o usuário editar/sobrescrever livremente.
- Nenhuma alteração de RLS, RPC, migrations, ou regras de validação Zod existentes.
- Verificações idênticas às da Fase A (typecheck, build, vitest).

---

## Fora do escopo (ambas as fases)

- Wizard `RascunhoWizard.tsx` e abas Certificado/Homologação/Revisão — sem campos texto-livre de domínio conhecido.
- Validação cruzada avançada (CST×CSOSN×regime, CFOP×UF origem/destino).
