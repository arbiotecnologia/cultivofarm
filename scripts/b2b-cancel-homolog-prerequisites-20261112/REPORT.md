# Homologação de cancelamento — dependência concreta, instalação bloqueada

**Continuação 01:49:** identidade de trigger corrigida por OID/MD5, checks segmentados (máximo inferior a 28 KB), guard real recebido e E fechado com barreira de linha/ticket único testado. Não falta outra captura geral: há decisão concreta sobre a emissão canônica de permissões para fixture/sessão; composição operacional ainda NÃO aplicável. Ver `minimal/continuation/DECISION-0149.md` e `FOLLOWUP-0149.md`.

**Continuação 01:41:** A instalada/POST PASS relatados; captura offline validada, três hashes exatos confirmados, B/C/D aditivos privados segmentados e estado `aguardando_fiscal` corrigido na capacidade candidata. Ver `minimal/continuation/REPORT.md`; E/fixture hospedada bloqueados pelo corpo focal `homolog_validation_block_receivable_insert()` MD5 `1b7e286b1391c986604df2b171025c62`, não fornecido. As seções anteriores abaixo são históricas.

**Continuação 01:33:** etapa aditiva privada fechada com PRE/INSTALL/POST/rollback e roundtrip 18/18 em `minimal/`; seis corpos homolog recuperados por hash exato, três definições específicas faltantes. Ver `minimal/REPORT.md` para estado atual; a seção abaixo preserva a entrega anterior de inventário, não descreve a fundação nova como inexistente.

**Alvo exclusivo:** CultivoFarm-Homolog `vrlcdwmlytukrjezrrnf`. Candidato informado: `8cf02e2b`.
Nenhum SQL remoto, publicação, alteração do cliente/rotas do original, exportação/importação de dados ou chamada externa.

## Resultado técnico

Comparação dos onze hashes reportados com o PRE do candidato: **cinco ausências, quatro divergências e duas coincidências apenas de corpo**. Coincidem `c2p1_internal_actor` e `rpc_fiscal_event_sefaz_reconcile_v1`; isso não comprova owner, ACL, configuração, RLS ou dependências.

O candidato não instala a fundação: exige previsões, eventos imutáveis, ciclo de vida, B4/alocação, ponte fiscal e reconciliação previamente instalados. O instalador histórico de forecasts também substitui aprovações comerciais em versões específicas; não é uma migração independente só de tabela. Os pacotes históricos têm guardas do original e **não devem ser aplicados no homolog**. Os hashes não foram repinados para fingir compatibilidade.

O inventário reportado (forecasts ausente, zero cron ativo, arbiotecnologia/rh com perfis de empresa) foi tratado como relato, não como captura atual. Não inclui estrutura/constraints das relações fiscais, baseline B4, ACL, triggers nem versões comerciais.

## Saída executável agora: somente leitura

Conferir manualmente URL/ref no painel do homolog antes de qualquer execução; SQL de catálogo não autentica a identidade do projeto.

1. `01-pre-functions.sql.readonly`: onze funções, presença e MD5/owner/ACL/config comparados ao relato.
2. `02-pre-runtime.sql.readonly`: versão PostgreSQL, extensões e ACL de schemas; contador de cron ativo sem exportar comandos. Último SELECT só quando cron.job existe.
3. `03-inventory-functions.sql.readonly`: nomes explícitos, todas as sobrecargas e fechamento pg_depend; corpo **não exportado**, apenas assinatura/argumentos/retorno/MD5/owner/ACL efetiva/config/volatilidade/linguagem.
4. `04-inventory-relations.sql.readonly`: relações específicas, ausência explícita, colunas/defaults/constraints/FKs/índices/triggers/policies/RLS/ACL/views; zero linhas de negócio.
5. `05-inventory-types-guards.sql.readonly`: enums/domínios, event triggers e herança dos três papéis técnicos, sem atributos de login ou senhas.

`source-manifest.json` lista o fechamento de nomes e os estágios canônicos com caminhos/hashes atuais e históricos; são **referências, não uma ordem de aplicação no homolog**. Dependências PL/pgSQL/dinâmicas não ficam integralmente registradas em pg_depend; precisam conferência do catálogo retornado contra as fontes canônicas.

**Dependência necessária para gerar INSTALL/POST/rollback:** resultados desses cinco segmentos. Para as quatro funções divergentes e qualquer dependência divergente, revisão pontual dos corpos no próprio alvo será necessária; não exportar corpo que contenha credenciais/URLs privadas/literais sensíveis. Inventário por hash não demonstra a semântica do corpo divergente. Com esse catálogo é possível definir deltas legítimos sem remover guardas, copiar dados ou conceder privilégios amplos.

## Fixture revisada e UI integrável, ainda inativas

- `fixture_source.py`: receita de entrada por simulate → journal → create canônicos, campos sem preço, recibo/chave conservados, replay comprometido sem nova criação e tentativa incerta bloqueada. Argumentos conferidos nas fontes canônicas locais; contrato hospedado ainda depende do inventário. Sem login/Auth/cliente próprio, aprovações inseridas, classificação fiscal inventada ou títulos finais inseridos. O integrador deve persistir o recibo antes de cada dispatch e revalidar a sessão/escopo. Não é fixture fiscal completa e não fornece dados novos de empresa/cliente/produto.
- NF e pagamento só passam pelo adaptador `DISPOSABLE_LOCAL`; modo hospedado nega antes da chamada. Não conceder callbacks service-only ao usuário para simular sessão: o PRE local do callback/preparo/reconcile tem EXECUTE fechado a authenticated. A conexão segura de uma simulação autenticada no homolog **ainda requer contrato server-side específico**, não um grant.
- `ui/FinanceReconciliationCandidate.tsx`: ponto Financeiro para localizar título por NF e mostrar pedido/título/status/parcelas/vencimentos/pagamento; confere NF/empresa, descarta resposta tardia, sem baixa/estorno/cancelamento financeiro. Fonte integra apenas na cópia existente, com leitor canônico scoped injetado pelo pai; não cria RPC ou cliente. Não montar ContaDrawer completo como atalho: ele monta ações de baixa/cancelamento/anexos fora deste recorte.
- Cancelamento comercial continua na UI inativa já existente `scripts/b2b-cancellation-policy-20261112/ui/OrderFinanceCandidate.tsx`, montada no extra do detalhe e atrás da capacidade de servidor.

## Verificação e limites

- Fontes/limites de fixture: **8/8** testes locais aprovados, `evidence/source-tests.txt`.
- Financeiro isolado + regressão cancelamento: **16/16**, dois arquivos, `evidence/vitest-focused.txt`.
- Cinco consultas executadas sem erro num PostgreSQL descartável com catálogo mínimo sintético e objetos ausentes: `evidence/catalog-query-syntax.json`. Prova sintaxe/ausência explícita, **não** compatibilidade de homolog nem roundtrip de instalação.
- Seleção inicial de Vitest incluiu indevidamente a suíte global por concatenação de includes; interrompida e configuração corrigida. Não certificamos essa rodada; resultado válido é o focado acima.
- Compilação automática mais recente observada: **build OK**; sem typecheck separado ou sessão real.

Comandos locais:

```text
python3 scripts/b2b-cancel-homolog-prerequisites-20261112/build.py
python3 scripts/b2b-cancel-homolog-prerequisites-20261112/test_sources.py
bun run test --config scripts/b2b-cancel-homolog-prerequisites-20261112/vitest.config.ts
```

Roundtrip de pré-requisitos homolog **não executado**: não existe captura de esquema exata do alvo e os temporários `/tmp/r12`/`/tmp/c2neg` desta sessão não existem. Não restauramos dumps históricos com dados, conforme pedido. Resultados anteriores do candidato não certificam esta nova base. Typecheck/build da aplicação não são executados manualmente; runtime original não foi modificado.

**Não existe INSTALL hospedado aplicável neste pacote.** Entrega concreta é inventário somente leitura + manifesto canônico + fonte fixture/Financeiro inativas; hashes em `SHA256SUMS`. Instalação, habilitação específica e prova real de sessão dependem do catálogo acima e de contrato de simulação sem transporte externo.