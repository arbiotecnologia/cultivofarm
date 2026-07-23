## Objetivo

Ao digitar o CNPJ na aba "Empresa" da Central de Configuração Fiscal (`/configuracoes/fiscal/empresa`), buscar automaticamente os dados cadastrais na Receita Federal (RFB) e complementar com dados do órgão estadual (SINTEGRA/SEFAZ) quando disponíveis, preenchendo o máximo de campos do formulário. Apenas UI/apresentação — sem alterar migrations, RLS, flags fiscais ou lógica de emissão.

## Escopo

Somente a aba **Empresa** de `src/pages/configuracoes/FiscalEmpresa.tsx`. Nenhum outro fluxo fiscal muda. Sem persistência automática — o usuário revisa e clica em "Salvar configuração".

## Fontes de dados

1. **BrasilAPI CNPJ v1** (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`) — já usada no projeto (`src/lib/api/brasilapi.ts`). Pública, sem chave, cobre RFB: razão social, nome fantasia, CNAE fiscal, endereço, CEP, UF, município, telefone, natureza jurídica, porte, Simples/MEI, situação cadastral.
2. **BrasilAPI CNPJ v2** (fallback) — mesmo endpoint com v2, retorna alguns campos adicionais.
3. **BrasilAPI IBGE Municípios por UF** (`/api/ibge/municipios/v1/{UF}`) — usada para resolver `municipality_ibge_code` a partir do nome do município retornado pela RFB.
4. **Inscrição Estadual (SEFAZ)**: não existe API pública unificada gratuita. BrasilAPI não expõe IE. Estratégia: **não** buscar IE automaticamente nesta fase; deixar o campo `state_registration` para preenchimento manual, com dica na UI indicando que a consulta ao SINTEGRA depende do estado. (Alternativa futura: conector pago tipo CNPJá/InfoSimples via edge function — fora do escopo por exigir segredo e custo.)

CNPJ Alfanumérico (Fase 3.19): a RFB só terá endpoint para alfanuméricos a partir de 07/2026. O lookup só dispara para CNPJ 100% numérico válido; para alfanumérico, desabilita o botão e exibe aviso "consulta RFB indisponível para CNPJ alfanumérico".

## Mapeamento RFB → formulário

| Campo formulário | Origem BrasilAPI |
| --- | --- |
| `legal_name` | `razao_social` |
| `trade_name` | `nome_fantasia` |
| `primary_cnae` | `cnae_fiscal` (formatado 7 dígitos) |
| `postal_code` | `cep` |
| `street` | `descricao_tipo_de_logradouro` + `logradouro` |
| `number` | `numero` |
| `complement` (se existir no schema) | `complemento` |
| `neighborhood` | `bairro` |
| `city` | `municipio` |
| `state` | `uf` |
| `country_code` | `"BR"` fixo |
| `municipality_ibge_code` | resolvido via IBGE (match por nome + UF) |
| `phone` (se existir) | `ddd_telefone_1` formatado |

Campos que **nunca** são sobrescritos automaticamente: `cnpj` (é o input), `fiscal_email`, `tax_regime`, `crt`, `municipal_registration`, `state_registration`, e todos os campos NF-e/NFS-e/Integração. Regime tributário é sugerido apenas como *dica visual* baseado em `opcao_pelo_simples`/`opcao_pelo_mei`, sem preencher automaticamente (decisão fiscal).

## UX

- Botão **"Buscar dados na RFB"** ao lado do input CNPJ, na seção Empresa.
- Habilitado quando o CNPJ digitado passa em `validateCnpjAlpha` e é 100% numérico.
- Estado de loading no botão. Toasts para sucesso, "CNPJ não encontrado" (404), rate-limit (429) e falha de rede.
- Antes de aplicar, mostra `AlertDialog` de confirmação listando os campos que serão preenchidos/sobrescritos, permitindo cancelar. Campos já preenchidos manualmente aparecem marcados como "será substituído".
- Após confirmar, atualiza o estado local do formulário (não salva). Usuário revisa e usa "Salvar configuração" existente (concorrência otimista intacta).
- Se `municipality_ibge_code` não puder ser resolvido (município não encontrado ou ambíguo), exibe aviso inline para preenchimento manual.
- Dica textual em `state_registration`: "Consulta ao SINTEGRA não automatizada — preencha manualmente com base na inscrição estadual da empresa."

## Arquivos afetados

Criar:
- `src/lib/fiscal/cnpjLookup.ts` — orquestra BrasilAPI CNPJ + IBGE, retorna `Partial<CompanyFiscalFormValues>` mapeado, com tratamento de erros tipado.
- `src/components/fiscal/CnpjLookupButton.tsx` — botão + AlertDialog de confirmação.
- `src/test/fiscal/cnpjLookup.test.ts` — testes unitários do mapeamento (mock de fetch), incluindo: campos ausentes, município sem match IBGE, CNPJ alfanumérico bloqueado, campos protegidos não sobrescritos.

Modificar (apenas a aba Empresa):
- `src/pages/configuracoes/FiscalEmpresa.tsx` — inserir o botão junto ao campo CNPJ; handler que faz `setFormValues(prev => ({ ...prev, ...lookupResult }))` respeitando a lista de campos protegidos.

Não modificar: hooks, schemas Zod, migrations, RLS, feature flags, `useFiscalCompanySettings.ts`, contrato de tipos.

## Segurança e limites

- Chamadas feitas do browser (endpoint público, sem credencial). Sem edge function nesta fase.
- Debounce/lock por 2s entre chamadas para evitar disparo múltiplo.
- Nenhum dado retornado é logado; toasts genéricos.
- Não altera `production_enabled`, `configuration_version`, `configuration_status`.

## Validação

- `bunx tsgo --noEmit`
- `bunx vitest run src/test/fiscal`
- `bun run build`
- Verificação manual: digitar um CNPJ válido conhecido, confirmar preenchimento, confirmar que campos NF-e/NFS-e e `state_registration` continuam vazios.

## Fora do escopo (para fases futuras, com autorização)

- Consulta automática de Inscrição Estadual (SINTEGRA) — exige conector pago e segredo.
- Consulta de inscrição municipal.
- Auto-preenchimento de `tax_regime`/`crt` (decisão contábil, não automatizada).
- Persistência automática no banco.