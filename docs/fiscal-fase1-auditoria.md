# Fase Fiscal 1 — Auditoria e Inventário NF-e / NFS-e da AR Bio

Data: 2026-07-21
Escopo: **somente leitura**. Nenhum arquivo funcional, migration, RLS, RPC, Edge Function, secret, rota ou permissão foi alterado nesta fase.

---

## A. Classificação geral

**APTO COM RESSALVAS.** Não existe emissão fiscal real, integração externa (Focus NFe / SEFAZ / Emissor Nacional de NFS-e) nem certificado A1 no repositório. O módulo atual é registro/acompanhamento manual — portanto não há risco crítico ativo. As ressalvas são estruturais (identidade fiscal da empresa ausente, produtos sem NCM/CFOP/CST, serviços sem LC 116, cadastro de cliente sem indicador de IE nem código IBGE).

## B. Status de prontidão

- APTO PARA FASE FISCAL 2 — **NÃO**.
- APTO COM RESSALVAS — **SIM** (pré-requisitos listados em AX).
- INAPTO — **NÃO**.

## C. Resumo executivo

O sistema **não emite NF-e nem NFS-e**. O módulo Notas Fiscais (`/financeiro/notas-fiscais`, `src/pages/financeiro/NotasFiscais.tsx`) é um **registro fiscal manual** ligado ao Contas a Receber, cobrindo apenas número, série, chave de acesso, data de emissão, status (`PENDING|ISSUED|CANCELED|ERROR`) e anexos XML/DANFE no bucket privado `financial-docs`. Escopo já documentado em `docs/notas-fiscais-modulo.md`. Não há Edge Function fiscal, webhook fiscal, cron fiscal, secret fiscal, certificado, tabela de identidade fiscal da empresa nem perfis fiscais em produtos/serviços.

Para chegar à Fase Fiscal 2 (fundação de emissão real) é necessário: (i) tabela de identidade fiscal da AR Bio (CNPJ, IE, IM, CNAE, CRT, endereço, código IBGE, ambientes, séries, provedor); (ii) perfis fiscais em produtos (NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI/CEST/origem/GTIN) e serviços (item LC 116, código nacional, CNAE, alíquota ISS, exigibilidade, município de incidência); (iii) enriquecimento cadastral dos clientes (indicador de IE, código IBGE do município, endereço fiscal separado do endereço da fazenda); (iv) camada de emissão em Edge Function com idempotência, secrets isolados por ambiente e segregação homolog/prod; (v) storage privado versionado por documento fiscal; (vi) máquina de estados estendida compatível com o provedor escolhido.

## D. Arquivos analisados

`src/pages/financeiro/NotasFiscais.tsx`, `src/components/financeiro/FiscalTab.tsx`, `src/components/financeiro/DocumentosPanel.tsx`, `src/components/financeiro/ContaDrawer.tsx`, `src/components/financeiro/HistoricoTab.tsx`, `src/components/financeiro/NovaContaDialog.tsx`, `src/pages/financeiro/relatorios/RelatorioNFePendente.tsx`, `src/components/executivo/financeiro/ExecutivoFinanceiroCards.tsx`, `src/components/executivo/financeiro/ExecutivoFinanceiroGargalos.tsx`, `src/components/executivo/ExecutivoAtalhos.tsx`, `src/hooks/useExecutivoFinanceiroResumo.ts`, `src/lib/schemas/cliente.ts`, `src/integrations/supabase/types.ts`, `src/config/navigation.ts`, `src/lib/permissions.ts`, `src/App.tsx`, `docs/notas-fiscais-modulo.md`, `.env`, `supabase/config.toml`, e migrations `20260520205922_*`, `20260520210810_*`, `20260520212213_*`, `20260613145428_*`, `20260613145831_*`, `20260613151709_*`, `20260626174040_*` (as sete migrations que criam/estendem `fiscal_invoices` ou funções ligadas).

## E. Rotas fiscais

| Rota | Componente | Guard | Permissões | Status |
|---|---|---|---|---|
| `/financeiro/notas-fiscais` | `NotasFiscais` (`src/pages/financeiro/NotasFiscais.tsx`) | `RoleGuard` (`src/App.tsx:501`) | `administrador/gestor/financeiro = rw` (`src/lib/permissions.ts:173`) | funcional (registro manual) |
| `/financeiro/relatorios/nfe-pendente` | `RelatorioNFePendente` | `RoleGuard` | staff financeiro | funcional (BI) |

Não existem rotas `/fiscal`, `/nfe`, `/nfse`, `/documentos-fiscais`, `/emitir`, `/certificados`. Sem duplicidade.

## F. Páginas e componentes fiscais

- `NotasFiscais.tsx` — listagem + Sheet lateral para editar campos fiscais e anexar XML/DANFE.
- `FiscalTab.tsx` — aba "Fiscal" no drawer do AR; grava via RPC `rpc_upsert_fiscal_invoice_manual`.
- `DocumentosPanel.tsx` — upload/download com signed URL de 5 min; exclusão lógica (`deleted_at/deleted_by/delete_reason`).
- `HistoricoTab.tsx` — mapeia ações `FISCAL_STATUS_UPDATED`, `FISCAL_INVOICE_CREATED`, `FISCAL_INVOICE_UPDATED`.
- `NovaContaDialog.tsx` — flag "NF-e obrigatória" ao criar AR.

## G. Hooks, serviços e adapters

Nenhum hook dedicado. Leituras via `supabase.from("fiscal_invoices")` direto nos componentes; escrita canônica via RPC `rpc_upsert_fiscal_invoice_manual`. Não há client HTTP para provedor externo.

## H. Tabelas, views e RPCs

Tabela `public.fiscal_invoices` (contrato em `src/integrations/supabase/types.ts:5385-5498`):
- Colunas: `id, receivable_id, delivery_id, invoice_type, invoice_number, series, access_key, issue_date, status, total_amount, xml_document_id, danfe_document_id, notes, created_by, created_at, updated_at`.
- FKs: `receivable_id → accounts_receivable`, `delivery_id → entregas`, `xml_document_id/danfe_document_id → financial_documents`.

Espelhos em `public.accounts_receivable`: `fiscal_invoice_required, fiscal_invoice_status, fiscal_invoice_number, fiscal_access_key, fiscal_issue_date`.

RPCs identificadas: `rpc_upsert_fiscal_invoice_manual`, `fn_generate_receivable_from_entrega` (`supabase/migrations/20260520205922_*.sql`), trigger `fn_audit_fiscal_status`.

**Nenhum campo tenant/company.**

## I. Edge Functions

**Nenhuma função fiscal.** As 18 Edge Functions cobrem AI (`ai-*`), alertas (`aplicar-sla-alertas`, `enviar-alertas-*`, `gerar-alertas-operacionais`), cron (`check-monitoramentos-vencidos`, `sync-clima`, `sync-calendar-event`), PDFs (`enviar-pdf-*`, `generate-financial-*`), push e admin de usuários. Nenhuma comunica com Focus/SEFAZ/prefeitura/Emissor Nacional.

## J. Migrations relacionadas

7 migrations tocam `fiscal_invoices` ou suas RPCs; 29 arquivos citam a família `fiscal_invoice_*` (colunas em `accounts_receivable`, `financial_audit_log`, views executivas).

## K. Secrets e variáveis

- `.env` do repositório contém apenas `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (anon, publicável — OK expor).
- Secrets do projeto Lovable Cloud (via `secrets--fetch_secrets`): apenas `LOVABLE_API_KEY` (managed). **Nenhum secret fiscal legado** (`FOCUS_*`, `SEFAZ_*`, `NFSE_*`, `CERT_*` etc.).
- Nenhum `Deno.env.get` fiscal em `supabase/functions/**/index.ts`.

## L. Integração Focus NFe existente

**Inexistente.** Sem cadastro, sem token, sem endpoint, sem webhook, sem normalização de erros, sem download de XML/PDF.

## M. Certificado digital

**Inexistente.** Nenhum arquivo `.pfx`/`.p12` no repositório; nenhuma coluna/tabela para armazená-lo; nenhuma rotina de upload/renovação. Como não há emissão, não há risco de exposição.

## N. Dados cadastrais da AR Bio

**Não existe tabela `company`/`empresa`/`tenant`.** Nenhum registro persistente de: razão social, CNPJ, IE, IM, CNAE, CRT, endereço fiscal, código IBGE, e-mail fiscal, responsável fiscal, séries de NF-e, séries de NFS-e, ambiente ativo, provedor. Referências a `nome_empresa` no schema (`src/integrations/supabase/types.ts:2918`) pertencem a `clientes`, não à emissora. **Lacuna estrutural bloqueadora da Fase 2 — não é risco atual porque nada emite.**

## O. Situação da NFS-e Nacional de Paracatu

Nenhuma integração. Nenhuma referência a Emissor Nacional, DPS, DANFSe, LC 116, código de tributação nacional/municipal, item de serviço. Sem código legado do sistema municipal antigo — logo, sem dívida técnica a limpar. Migração para o Padrão Nacional é premissa **antes** da Fase Fiscal 6.

## P. Prontidão para NFS-e

**0%.** Sem cadastro de serviços fiscais, sem alíquota ISS, sem código nacional, sem item LC 116, sem município de incidência, sem exigibilidade, sem tomador com dados fiscais completos.

## Q. Prontidão para NF-e

**0% para emissão.** Produtos não possuem NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI/CEST/origem/GTIN visíveis no schema; empresa emissora sem IE/CRT/série/ambiente/UF autorizadora; ausência de natureza da operação/finalidade/indicador de IE do destinatário.

## R. Matriz fiscal dos produtos e bioinsumos

Todos os produtos hoje classificam como **"sem classificação fiscal — depende da contabilidade"**. Nenhum atributo fiscal persistido nas tabelas de produto identificadas. Necessário levantamento junto ao contador da AR Bio antes da Fase 3 (Enriquecimento).

## S. Matriz fiscal dos serviços

Nenhum serviço cadastrado com atributos fiscais. Consultoria técnica, visita técnica, acompanhamento agronômico, análises laboratoriais, produção On-Farm, treinamento e monitoramento precisam ser inventariados junto à contabilidade (item LC 116, código nacional, ISS, retenções, exigibilidade).

## T. Qualidade dos dados dos clientes

`clienteSchema` (`src/lib/schemas/cliente.ts`) cobre: `tipo_pessoa`, `razao_social`, `cpf_cnpj`, `inscricao_estadual`, `inscricao_municipal`, endereço completo, endereço de cobrança, contato financeiro, limite de crédito, condição de pagamento e dados bancários. **Faltam** para uso fiscal: `indicador_ie` (contribuinte / isento / não contribuinte), `código IBGE do município`, separação formal entre endereço fiscal e endereço da fazenda, validação de CNPJ contra Receita Federal, e-mail fiscal específico.

## U. Origens operacionais dos documentos

1. Entrega confirmada → `fn_generate_receivable_from_entrega` (`20260520205922_*.sql`) → AR + `fiscal_invoices` (`PENDING`/`NOT_REQUIRED`).
2. AR existente → aba "Fiscal" (`FiscalTab`) → `rpc_upsert_fiscal_invoice_manual` → `fiscal_invoices`.
3. Pedido B2B → AR → NF (mesmo caminho 1/2 através do AR intermediário).

Não há emissão a partir de pedido diretamente; não há emissão a partir de solicitação/simulação; não há vínculo com OS de laboratório.

## V. Integração com pedidos e entregas

`fiscal_invoices.delivery_id` já existe. Unicidade parcial em `entregas.receivable_id` (`uq_entregas_receivable_id`) impede duplicidade financeira; **não há unicidade fiscal** por AR nem por entrega — hoje é aceitável (registro manual), mas será risco de duplicidade quando houver emissão real.

## W. Integração com o Financeiro

Cancelamento fiscal atualmente **não** reverte AR nem parcelas; alteração de status fiscal é informativa. Documento externo importado e NF registrada convivem no mesmo modelo. Não há alteração de valor financeiro após "emissão" (o status ISSUED é apenas rótulo).

## X. Documentos fiscais externos

Manejo via `DocumentosPanel` + bucket privado `financial-docs` com signed URL curta (5 min) e exclusão lógica. **Sem distinção formal** entre "documento emitido pelo sistema" × "documento importado" × "documento anexado" — todos vivem como `financial_documents.document_type ∈ {INVOICE, XML, DANFE, RECEIPT, BOLETO, CONTRACT, OTHER}`. Necessário separar na Fase 2.

## Y. Modelo de dados atual

Presente: `fiscal_invoices`, `financial_documents`, `accounts_receivable` (espelhos fiscais), `financial_audit_log`.

Ausente (não será criado nesta fase): `company_fiscal_settings`, `product_fiscal_profile`, `service_fiscal_profile`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_webhook_log`, `fiscal_idempotency_keys`, `fiscal_environment`.

## Z. Status e máquina de estados

Apenas 4 status planos em `fiscal_invoices.status`: `PENDING | ISSUED | CANCELED | ERROR` (+ `NOT_REQUIRED` no AR). Incompatível com estados típicos de provedor fiscal (`processando_autorizacao`, `autorizado`, `denegado`, `erro_autorizacao`, `cancelado`, `substituído`). Extensão necessária na Fase 2 (proposta em AU).

## AA. Idempotência

**Inexistente na camada fiscal** (não há emissão). O botão "Salvar" grava direto na tabela. Aceitável no contexto atual; emissão real exigirá chave idempotente + `provider_reference UNIQUE` + bloqueio transacional + retry-safe.

## AB. Webhooks

**Nenhum webhook fiscal registrado.** Nenhum endpoint público em `supabase/functions/` recebe callback de provedor fiscal.

## AC. Storage de XML e PDF

Bucket `financial-docs` privado, path `${ownerType}/${ownerId}/${timestamp}-${nome}`, signed URL de 5 min, exclusão lógica com auditoria. Isolamento por tenant/empresa **não aplicável** (single-tenant AR Bio). Sem versionamento por evento fiscal — cancelamento não gera novo arquivo.

## AD. Permissões

- `/financeiro/notas-fiscais` — `administrador/gestor/financeiro = rw` (`src/lib/permissions.ts:173`); demais papéis sem acesso.
- Cliente produtor lê somente as próprias NFs via RLS de `accounts_receivable` (relação `customer_id`).
- `parceiro_b2b*` **sem** acesso ao módulo fiscal.
- Anexos: upload/listar exige `is_staff`; delete exige `administrador/gestor` (`DocumentosPanel.tsx:104-105`).

## AE. Segurança e LGPD

Nenhum token, senha, chave privada, CPF/CNPJ, XML completo ou payload sensível é logado no console frontend nem escrito em `financial_audit_log` de forma exposta. Signed URL de 5 min mitiga vazamento de anexos. Sem política de retenção configurada — recomendável definir na Fase 2.

## AF. Separação de ambientes

Sem separação fiscal (nada é emitido). `.env` único. Nenhum secret fiscal. Fase 2 exigirá secrets `FISCAL_ENV`, `FOCUS_TOKEN_HOMOLOG`/`FOCUS_TOKEN_PROD` (ou equivalente), separação de séries por ambiente, badge visual persistente em não-produção e guard `Deno.env.get("FISCAL_ENV") === "PRODUCTION"` para emissão real.

## AG. Testes existentes

Nenhum teste específico de emissão. Cobertura fiscal se limita a permissão de rota e audit log via `HistoricoTab`. Sem teste de contrato de API Focus, sem mock de webhook, sem teste E2E fiscal, sem teste RLS específico de `fiscal_invoices`.

## AH. Resultado do typecheck

```
$ bun run typecheck
$ tsc --noEmit
exit code 0
```

## AI. Resultado do build

```
$ bun run build
✓ built in 20.86s
PWA v1.2.0 — precache 20 entries (5385.84 KiB)
exit code 0
```

Warning informativo: chunk `index-*.js` > 500 kB (dívida técnica de code-splitting pré-existente, sem impacto fiscal).

## AJ. Resultado dos testes

```
$ bunx vitest run
Test Files  41 passed (41)
     Tests  349 passed (349)
  Duration  17.23s
exit code 0
```

## AK. Resultado do lint

Não executado nesta fase (o prompt permite pular quando há dívida histórica). Deve ser registrado na Fase 2 antes de habilitar qualquer emissão.

## AL. Achados críticos

**Nenhum.** Não há emissão real, credencial exposta, certificado versionado, webhook público sem validação, XML fiscal em bucket público, bypass de permissão, mistura de ambientes ou emissão duplicável em produção.

## AM. Achados altos

1. Ausência total de identidade fiscal da AR Bio no banco (CNPJ/IE/IM/CRT/endereço fiscal/CNAE/séries/ambiente).
2. Produtos sem NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI/CEST/origem/GTIN.
3. Serviços sem item LC 116, código nacional, ISS e exigibilidade.
4. Sem unicidade lógica de NF por `receivable_id`/`delivery_id`.
5. Cancelamento fiscal não reverte AR/parcelas.

## AN. Achados médios

- Máquina de estados enxuta demais (4 status).
- Cliente sem `indicador_ie` e código IBGE.
- Sem separação endereço fiscal × endereço da fazenda.
- Sem alertas fiscais dedicados (apenas card genérico "Fiscal pendente").
- Cobertura de testes fiscais quase inexistente.
- Texto do `PageHeader` de `NotasFiscais` diz "Controle e emissão", o que induz o usuário a esperar emissão.

## AO. Achados baixos e informativos

- Sem legado municipal Paracatu a limpar.
- Documentação fiel em `docs/notas-fiscais-modulo.md`.
- Emissão SEFAZ registrada como "fora de escopo" no doc.

## AP. Dependem da contabilidade da AR Bio

CRT, regime tributário, CNAEs, série e numeração NF-e/NFS-e, alíquotas efetivas, benefícios fiscais, NCM/CFOP/CST por produto, item LC 116/código nacional por serviço, retenções federais/municipais, exigibilidade de ISS, município de incidência dos serviços prestados.

## AQ. Dependem de decisão da AR Bio

Provedor (Focus NFe × PlugNotas × integração direta Emissor Nacional); ambiente inicial (homologação restrita → produção); custódia do certificado (upload interno criptografado × custódia do provedor); política de emissão (automática pós-entrega × manual pelo financeiro); tratamento de pedidos B2B vs. produtor direto; papéis autorizados a emitir/cancelar; SLA de reconciliação financeira × fiscal.

## AR. Componentes reutilizáveis

`fiscal_invoices` (base), `financial_documents` + bucket `financial-docs`, `FiscalTab`, `DocumentosPanel`, `HistoricoTab`, `rpc_upsert_fiscal_invoice_manual`, permissões atuais, cards executivos (`ExecutivoFinanceiroCards`, `ExecutivoFinanceiroGargalos`), relatório `RelatorioNFePendente`.

## AS. Componentes legados ou obsoletos

Nenhum código fiscal legado a remover. A UI de status manual permanecerá útil para documentos externos (importados manualmente) mesmo após a Fase 2.

## AT. Lacunas para a Fase Fiscal 2

Identidade fiscal da empresa; perfis fiscais de produtos e serviços; enriquecimento cadastral de clientes; máquina de estados; idempotência; separação hom/prod; storage de eventos fiscais; auditoria de emissão; webhooks; alertas dedicados; testes contratuais.

## AU. Arquitetura recomendada

- Emissão **100% em Edge Functions**: `fiscal-prepare`, `fiscal-issue`, `fiscal-status`, `fiscal-cancel`, `fiscal-webhook`, `fiscal-download`. Frontend nunca fala com provedor fiscal.
- Segredos por ambiente: `FISCAL_ENV`, `FISCAL_PROVIDER`, `FOCUS_TOKEN_HOMOLOG`, `FOCUS_TOKEN_PROD`, `FISCAL_WEBHOOK_SECRET`.
- Nova tabela `company_fiscal_settings` (CNPJ, IE, IM, CRT, endereço, código IBGE, séries, ambiente ativo, provedor, dados do responsável).
- `product_fiscal_profile` e `service_fiscal_profile` (revisados pela contabilidade).
- `fiscal_invoices` estendida com `provider`, `provider_reference UNIQUE`, `environment`, `idempotency_key`, `status` enum ampliado, `parent_invoice_id`, `canceled_at`, `cancel_reason`.
- Novas tabelas: `fiscal_invoice_items`, `fiscal_events`, `fiscal_webhook_log`, `fiscal_idempotency_keys`.
- Bucket privado `fiscal-docs` com path `${env}/${yyyy}/${mm}/${cnpj_emitente}/${chave}.xml|pdf`.
- Guard `FISCAL_ENV === "PRODUCTION"` para permitir emissão real; badge visual persistente em ambientes não-produção; dupla autorização para promoção.

## AV. Plano proposto para as próximas fases

1. **Fase Fiscal 2 — Fundação**: `company_fiscal_settings`, perfis fiscais, secrets de homologação vazios, sem emissão.
2. **Fase Fiscal 3 — Enriquecimento**: preencher perfis de produtos, serviços e clientes com validação contábil.
3. **Fase Fiscal 4 — Edge Functions**: `prepare` + `status` + `webhook` em homologação.
4. **Fase Fiscal 5 — Emissão real em homologação (NF-e produto)** com idempotência e reconciliação.
5. **Fase Fiscal 6 — NFS-e Nacional (serviços)** em homologação.
6. **Fase Fiscal 7 — Cancelamento/substituição/eventos** + reconciliação financeira automática.
7. **Fase Fiscal 8 — Promoção a produção** com dupla autorização, trilha completa e alertas.

## AW. Riscos residuais

- Texto de UI "Controle e emissão" em `NotasFiscais.tsx:49` induz expectativa de emissão real (impacto BAIXO — recomendado revisar em fase futura, sem alterar nesta).
- Documentos externos e "notas emitidas" compartilham modelo — precisa segregação lógica na Fase 2.
- Nenhum outro risco ativo enquanto a integração externa permanecer inexistente.

## AX. Recomendação objetiva

Prosseguir para a **Fase Fiscal 2** somente após:
1. Levantamento contábil da AR Bio (CNPJ, IE, IM, CNAE, CRT, série inicial, provedor, ambiente inicial).
2. Decisão da AR Bio sobre provedor e modelo de custódia do certificado.
3. Aprovação humana explícita para iniciar a Fase Fiscal 2.

**A Fase Fiscal 2 não será iniciada automaticamente.** Aguardar avaliação humana deste relatório.

---

### Referências consultadas (a confirmar versões na Fase 2)

- NFS-e Padrão Nacional — produção restrita e produção (adn.nfse.gov.br) — versão vigente em 2026-07.
- Portal Nacional da NF-e — MOC e notas técnicas 2026.
- Focus NFe — documentação pública de API (a validar antes da Fase 4).
- Supabase Edge Functions e Secrets — documentação oficial.

*Versões e datas específicas devem ser registradas na Fase Fiscal 2 no momento de escolha do provedor.*
