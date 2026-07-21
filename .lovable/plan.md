
# FASE FISCAL 1 — Auditoria e Inventário NF-e / NFS-e AR Bio

> Auditoria estritamente somente-leitura. Nada será alterado (código, banco, RLS, RPC, Edge Functions, secrets, rotas, permissões). Nenhuma emissão será testada. Este plano descreve as leituras já realizadas, a estrutura do relatório final e a validação (typecheck/build/vitest) que precisa ser executada em build mode para publicar o relatório completo.

## A. Classificação geral e status de prontidão (preliminar)

- **Classificação geral:** APTO COM RESSALVAS (preliminar — depende de validações típicas em build mode).
- **Racional:** não existe emissão real, integração externa (Focus/SEFAZ/NFS-e Nacional) nem certificado A1 no repositório. O que existe é um registro fiscal interno (`fiscal_invoices` + `FiscalTab` + `/financeiro/notas-fiscais`) usado só para acompanhamento manual. Portanto não há risco crítico ativo de emissão indevida, exposição de token ou vazamento de certificado. As ressalvas são estruturais (schema fiscal mínimo, cadastro de produtos sem NCM/CFOP/CST, clientes sem código IBGE, ausência de tabela de configuração fiscal da empresa).

## B. Resumo executivo

O sistema **não emite NF-e nem NFS-e**. O módulo Notas Fiscais é um **registro manual** ligado ao Contas a Receber, cobrindo somente: número, série, chave, data de emissão, status (`PENDING|ISSUED|CANCELED|ERROR`) e anexos XML/DANFE via `financial-docs` (privado). Já está documentado em `docs/notas-fiscais-modulo.md`. Não há integração Focus NFe, SEFAZ, prefeitura, NFS-e Nacional, certificado A1, webhook fiscal, cron fiscal ou secret fiscal em nenhuma Edge Function.

Para chegar à Fase Fiscal 2 (integração real) é preciso: (i) tabela de identidade fiscal da AR Bio (CNPJ, IE, IM, CNAE, CRT, endereço, código IBGE, ambientes, séries); (ii) perfis fiscais em produtos (NCM/CFOP/CST/PIS/COFINS/IPI/CEST/origem) e serviços (item LC 116, código nacional, CNAE, alíquota ISS, exigibilidade); (iii) enriquecimento cadastral dos clientes (indicador de IE, código IBGE do município, endereço fiscal separado do endereço da fazenda); (iv) camada de emissão em Edge Function com idempotência, secrets isolados por ambiente e segregação homolog/prod; (v) storage privado versionado por documento fiscal; (vi) máquina de estados estendida.

## C. Escopo desta fase (o que foi feito / o que falta)

O que foi feito nesta rodada de leitura:
- Inventário textual do repositório com termos fiscais (`fiscal|NF-e|NFS-e|Focus|SEFAZ|DANFE|certificado|XML|homologação|produção`).
- Leitura dos arquivos-chave: `src/pages/financeiro/NotasFiscais.tsx`, `src/components/financeiro/FiscalTab.tsx`, `src/components/financeiro/DocumentosPanel.tsx`, `docs/notas-fiscais-modulo.md`, `src/lib/schemas/cliente.ts`, migration base `20260520205922_*` (fluxo `fn_generate_receivable_from_entrega`), fatia de `src/integrations/supabase/types.ts` (contrato `fiscal_invoices`, colunas fiscais de `accounts_receivable`).
- Confirmação de que `.env` só contém `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (anon) — nenhum segredo fiscal versionado.
- Nenhuma referência a `focus`, `sefaz`, `certificado_a1`, `plugnotas`, `enotas` ou `emissor nacional` em código Deno das Edge Functions.
- Nenhum secret com nome fiscal identificado em `supabase/functions/**/index.ts` via `Deno.env.get`.

O que ainda precisa ser executado (requer build mode ou execução autorizada em modo leitura ampliada) para completar a checagem 100%:
- Rodar as validações obrigatórias da seção 28 do prompt e anexá-las às seções AH–AK do relatório.
- Consultar `supabase/functions/config.toml` para verificar se algum endpoint fiscal está exposto sem `verify_jwt`.
- Listar via `psql` (read-only) os buckets do Storage, os secrets do projeto e os cron jobs para preencher com precisão as seções AB–AF.

## D. Estrutura do relatório final (a ser publicado após validações)

Seções A–AX conforme prompt. Conteúdo preliminar consolidado (a ser confirmado pelas validações):

- **D. Arquivos analisados:** `src/pages/financeiro/NotasFiscais.tsx`, `src/components/financeiro/FiscalTab.tsx`, `src/components/financeiro/DocumentosPanel.tsx`, `src/components/financeiro/ContaDrawer.tsx`, `src/components/financeiro/HistoricoTab.tsx`, `src/components/financeiro/NovaContaDialog.tsx`, `src/pages/financeiro/relatorios/RelatorioNFePendente.tsx`, `src/components/executivo/financeiro/ExecutivoFinanceiroCards.tsx`, `src/components/executivo/financeiro/ExecutivoFinanceiroGargalos.tsx`, `src/components/executivo/ExecutivoAtalhos.tsx`, `src/hooks/useExecutivoFinanceiroResumo.ts`, `src/lib/schemas/cliente.ts`, `src/integrations/supabase/types.ts`, `src/config/navigation.ts`, `src/lib/permissions.ts`, `src/App.tsx`, `docs/notas-fiscais-modulo.md`, migrations `20260520205922_*`, `20260520210810_*`, `20260520212213_*`, `20260613145428_*`, `20260613145831_*`, `20260613151709_*`, `20260626174040_*` (as sete migrations que tocam `fiscal_invoices` ou seus derivados).
- **E. Rotas fiscais:** apenas uma canônica — `/financeiro/notas-fiscais` (`FinNotasFiscais`, `RoleGuard`, permissão em `src/lib/permissions.ts:173` — `administrador/gestor/financeiro = rw`). Não há rota `/fiscal`, `/nfe`, `/nfse`, `/documentos-fiscais`. Existe relatório derivado `RelatorioNFePendente` sob `/financeiro/relatorios/*`.
- **F. Páginas e componentes fiscais:** `NotasFiscais.tsx` (listagem + Sheet de edição); `FiscalTab.tsx` (dentro do drawer do AR); `DocumentosPanel.tsx` (anexos XML/DANFE); `RelatorioNFePendente.tsx` (BI). Cards executivos apontam para a mesma rota.
- **G. Hooks/serviços/adapters fiscais:** nenhum hook dedicado; leituras via `supabase.from("fiscal_invoices")` direto nos componentes; escrita canônica via RPC `rpc_upsert_fiscal_invoice_manual`.
- **H. Tabelas/views/RPCs:** tabela `public.fiscal_invoices` com colunas `id, receivable_id, delivery_id, invoice_type, invoice_number, series, access_key, issue_date, status, total_amount, xml_document_id, danfe_document_id, notes, created_by, created_at, updated_at`. Espelhos em `accounts_receivable` (`fiscal_invoice_required, fiscal_invoice_status, fiscal_invoice_number, fiscal_access_key, fiscal_issue_date`). RPCs identificadas: `rpc_upsert_fiscal_invoice_manual`, `fn_generate_receivable_from_entrega`, `fn_audit_fiscal_status` (trigger). Nenhum campo tenant/company.
- **I. Edge Functions:** **nenhuma função fiscal**. As 18 funções existentes cobrem AI, alertas, cron, PDFs e push. Nenhuma comunica com Focus/SEFAZ/prefeitura.
- **J. Migrations relacionadas:** 7 migrations tocam `fiscal_invoices`/RPCs; 29 arquivos citam a família `fiscal_invoice_*` (colunas em `accounts_receivable`, audit log, views executivas).
- **K. Secrets e variáveis:** apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no repositório (anon, publicável). Nenhum secret fiscal referenciado por código. Listagem definitiva dos secrets do projeto exige `secrets--fetch_secrets` (fora do escopo leitura desta fase; recomendar consulta na Fase 2).
- **L. Integração Focus existente:** inexistente.
- **M. Certificado digital:** inexistente; nenhum arquivo `.pfx`/`.p12` no repositório; nenhum campo/tabela para armazená-lo.
- **N. Dados cadastrais AR Bio:** não há tabela `company/empresa/tenant`. Não há CNPJ, IE, IM, CNAE, CRT, endereço fiscal, código IBGE, séries, ambientes cadastrados no schema. **Lacuna estrutural crítica para Fase 2 (não é risco crítico agora porque nada emite).**
- **O. NFS-e Nacional (Paracatu):** nenhuma integração; nenhuma referência a Emissor Nacional, DPS, DANFSe, LC 116, item de serviço. Migração municipal → Emissor Nacional a considerar antes da Fase 2.
- **P. Prontidão NFS-e:** 0% — sem cadastro de serviços fiscais, sem alíquota ISS, sem código nacional, sem item LC 116, sem município de incidência configurado.
- **Q. Prontidão NF-e:** 0% para emissão — produtos sem NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI/CEST/origem/GTIN visíveis no cadastro fiscal.
- **R. Matriz fiscal dos produtos:** todos os produtos hoje classificam como "sem classificação fiscal — depende da contabilidade". Necessário levantamento junto ao contador da AR Bio.
- **S. Matriz fiscal dos serviços:** nenhum serviço cadastrado com atributos fiscais. Consultoria, visita técnica, análises laboratoriais e On-Farm precisam ser inventariados com item LC 116.
- **T. Qualidade dos dados dos clientes:** `clienteSchema` cobre razão social, CPF/CNPJ, IE, IM, endereço, cobrança e financeiro; **faltam** `indicador_ie`, `código IBGE do município`, separação clara entre endereço da fazenda e endereço fiscal. Nenhuma validação de CNPJ contra Receita Federal.
- **U. Origens operacionais dos documentos:** entregas → AR (via `fn_generate_receivable_from_entrega`) → `fiscal_invoices`; e AR manual → `fiscal_invoices` (via `FiscalTab`). Pedido B2B → AR → NF hoje segue o mesmo caminho (AR intermediário). Não há emissão a partir do pedido diretamente.
- **V. Integração pedidos/entregas:** `fiscal_invoices.delivery_id` já existe. Unicidade parcial de `receivable_id` na entrega bloqueia duplicidade financeira; **não há unicidade fiscal por AR**.
- **W. Integração financeira:** cancelamento fiscal atualmente **não** reverte AR/parcelas; alteração de status fiscal é meramente informativa. Documentado como fora de escopo.
- **X. Documentos fiscais externos:** `DocumentosPanel` + bucket `financial-docs` (privado, signed URL, exclusão lógica). Sem distinção formal entre documento emitido pelo sistema × documento externo importado — hoje tudo é anexo.
- **Y. Modelo de dados atual:** faltam `company_fiscal_settings`, `product_fiscal_profile`, `service_fiscal_profile`, `fiscal_invoice_items`, `fiscal_events`, `fiscal_webhook_log`, `fiscal_idempotency_keys`, `fiscal_environment` — nenhuma será criada nesta fase.
- **Z. Máquina de estados:** apenas 4 status planos (`PENDING|ISSUED|CANCELED|ERROR`) + `NOT_REQUIRED` no AR. Incompatível com Focus (`autorizado`, `processando_autorizacao`, `cancelado`, `denegado`, `erro_autorizacao`, etc.). Necessária extensão na Fase 2.
- **AA. Idempotência:** inexistente na camada fiscal (não há emissão). O botão "Salvar" na UI grava direto — aceitável no contexto atual (registro manual). Emissão real exigirá chave idempotente + `provider_reference`.
- **AB. Webhooks:** nenhum webhook fiscal registrado.
- **AC. Storage XML/PDF:** bucket `financial-docs` privado; signed URL 5 min; exclusão lógica (`deleted_at`, `deleted_by`, `delete_reason`). Sem versionamento por evento fiscal (cancelamento não gera novo XML).
- **AD. Permissões:** `/financeiro/notas-fiscais` restrito a `administrador/gestor/financeiro` (rw). Cliente vê apenas as próprias NFs pela RLS de `accounts_receivable`. `parceiro_b2b*` sem acesso ao módulo fiscal.
- **AE. Segurança/LGPD:** nenhum token, senha, chave privada ou CPF/CNPJ é logado no console. Anexos privados com signed URL curta. Sem retenção configurada.
- **AF. Ambientes:** sem separação fiscal (nada é emitido). `.env` único; secrets fiscais inexistentes. Nada a proteger, mas Fase 2 exigirá secrets `FOCUS_TOKEN_HOMOLOG`/`FOCUS_TOKEN_PROD` (ou equivalente) e flag `FISCAL_ENV`.
- **AG. Testes existentes:** nenhum teste específico de emissão. Cobertura fiscal se limita a integração de rota/permissão e à auditoria de status via `HistoricoTab`. Sem contrato de API Focus, sem mock de webhook, sem teste E2E fiscal.
- **AH–AK. Typecheck / Build / Vitest / Lint:** a executar em build mode com os comandos exatos do prompt (`bun run typecheck`, `bun run build`, `bunx vitest run`, `bun run lint` só para registro). Resultado será anexado literalmente ao relatório final.

## E. Achados classificados

- **AL. CRÍTICOS:** nenhum. Não há emissão real, credencial exposta, certificado versionado, webhook público, XML fiscal em bucket público, bypass de permissão ou emissão duplicável.
- **AM. ALTOS:**
  1. Ausência total de identidade fiscal da AR Bio no banco (CNPJ/IE/IM/CRT/endereço fiscal/CNAE/séries/ambiente).
  2. Cadastro de produtos sem NCM/CFOP/CST/CSOSN/PIS/COFINS/IPI/CEST/origem/GTIN — bloqueia Fase 2.
  3. Cadastro de serviços sem item LC 116, código nacional, ISS e exigibilidade.
  4. Sem unicidade lógica de NF por `receivable_id`/`delivery_id` — hoje é registro manual, mas será risco de duplicidade quando houver emissão.
  5. Cancelamento fiscal não reverte AR/parcelas.
- **AN. MÉDIOS:** máquina de estados enxuta demais; cliente sem `indicador_ie`/código IBGE; falta separação endereço fiscal × fazenda; ausência de alertas fiscais dedicados (só existe card genérico "Fiscal pendente"); testes fiscais quase inexistentes; nomenclatura da UI ("Controle e emissão" no `PageHeader`) sugere emissão que não existe.
- **AO. BAIXOS / INFORMATIVOS:** legado municipal de Paracatu ausente (não há dívida técnica); documentação atualizada em `docs/notas-fiscais-modulo.md`; funcionalidade planejada de emissão SEFAZ registrada como fora de escopo.

## F. Dependências

- **AP. Dependem da contabilidade da AR Bio:** CRT, regime tributário, CNAEs, série e numeração de NF-e/NFS-e, alíquotas efetivas, benefícios fiscais, NCM/CFOP/CST por produto, item LC 116/código nacional por serviço, retenções, exigibilidade de ISS, município de incidência dos serviços prestados.
- **AQ. Dependem de decisão da AR Bio:** provedor (Focus NFe × PlugNotas × integração direta Emissor Nacional); ambiente inicial (homologação restrita → produção); modelo do certificado (upload interno criptografado × custódia do provedor); política de emissão (automática pós-entrega × manual pelo financeiro); tratamento de pedidos B2B vs. produtor direto; papéis autorizados a emitir/cancelar.

## G. Reuso e obsolescência

- **AR. Reutilizáveis na Fase 2:** `fiscal_invoices` (base), `financial_documents` + bucket `financial-docs`, `FiscalTab`, `DocumentosPanel`, `HistoricoTab`, `rpc_upsert_fiscal_invoice_manual`, permissões atuais, cards executivos, relatório `RelatorioNFePendente`.
- **AS. Obsoletos:** nenhum código fiscal legado a remover; a UI de status manual continuará útil para documentos externos.

## H. Lacunas e arquitetura recomendada (proposta, não implementar)

- **AT. Lacunas para Fase 2:** identidade fiscal da empresa; perfis fiscais de produtos e serviços; enriquecimento do cliente; máquina de estados; idempotência; separação hom/prod; storage de eventos fiscais; auditoria de emissão; webhooks; alertas dedicados; testes contratuais.
- **AU. Arquitetura recomendada:**
  - Backend fiscal 100% em Edge Functions (`fiscal-prepare`, `fiscal-issue`, `fiscal-status`, `fiscal-cancel`, `fiscal-webhook`, `fiscal-download`), nunca no frontend.
  - Segredos por ambiente (`FISCAL_ENV`, `FOCUS_TOKEN_HOMOLOG`, `FOCUS_TOKEN_PROD`, `FISCAL_WEBHOOK_SECRET`).
  - Tabela `company_fiscal_settings` (CNPJ, IE, IM, CRT, endereço, código IBGE, séries, ambiente ativo, provedor).
  - Perfis fiscais em `product_fiscal_profile` e `service_fiscal_profile` (revisados pela contabilidade).
  - `fiscal_invoices` estendida com `provider`, `provider_reference` UNIQUE, `environment`, `idempotency_key`, `status` como enum ampliado, `parent_invoice_id` (substituição), `canceled_at`, `cancel_reason`.
  - `fiscal_invoice_items`, `fiscal_events`, `fiscal_webhook_log`, `fiscal_idempotency_keys`.
  - Storage `fiscal-docs` privado, com path `env/ano/mes/emitente/chave.xml|pdf`.
  - Guard em `Deno.env.get("FISCAL_ENV") === "PRODUCTION"` para emissão real; badge visual persistente em ambientes não-produção.
- **AV. Plano de fases seguintes (proposta):**
  1. Fase Fiscal 2 — Fundação: tabelas de identidade fiscal + perfis fiscais + secrets vazios em homologação, sem emissão.
  2. Fase Fiscal 3 — Enriquecimento de produtos, serviços e clientes.
  3. Fase Fiscal 4 — Edge Functions `prepare` + `status` + `webhook` (só homologação).
  4. Fase Fiscal 5 — Emissão real em homologação (NF-e produto) com idempotência.
  5. Fase Fiscal 6 — NFS-e Nacional (serviços) em homologação.
  6. Fase Fiscal 7 — Cancelamento/substituição/eventos + reconciliação financeira.
  7. Fase Fiscal 8 — Promoção a produção com dupla autorização e trilha de auditoria.
- **AW. Riscos residuais atuais:** apenas expectativa do usuário — a tela chama-se "Notas Fiscais" e diz "Controle e emissão", o que pode induzir usuário a acreditar que emite; recomendado revisar o texto do `PageHeader` em fase futura (não nesta).

## I. Recomendação objetiva (AX)

Prosseguir para a **Fase Fiscal 2** somente após:
1. executar as validações da seção 28 e anexá-las ao relatório;
2. confirmar via `secrets--fetch_secrets` que nenhum secret fiscal legado existe;
3. obter da contabilidade da AR Bio a matriz mínima (CNPJ, IE, IM, CNAE, CRT, série, ambiente inicial, provedor).

Nesta Fase Fiscal 1: **nada será alterado**. Ao aprovar este plano, o build mode apenas executará `bun run typecheck`, `bun run build` e `bunx vitest run` (somente leitura) e publicará o relatório completo em `docs/fiscal-fase1-auditoria.md` — nenhum outro arquivo será tocado, nenhuma migration criada, nenhuma emissão testada. A Fase Fiscal 2 permanecerá bloqueada aguardando autorização humana explícita.
