# Isolamento de planos comerciais por empresa — INSTALADO EM PRODUÇÃO PELO AUDITOR

Candidato preparado em 08/11/2026 e instalado pelo auditor às 21:45 UTC. **NÃO REAPLICAR.**

## Atualização canônica POSPLANOS — 08/11 21:45 UTC

O auditor instalou somente `02-install.sql.review` SHA256 `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40`, pela migration `commercial_plans_tenant_isolation_reviewed_20261108`, em `swzpzcwiasxmjutrmvkm`. Relatou ref comprovado, PRE_OK, POST antes do COMMIT e POST separado READ ONLY POST_OK. Preservados seis planos (cinco ARBio e um `8eae2bc1…`), quatro assignments, nove orders, dez receivables e cinco fiscal invoices.

FSF real na prévia conectada à produção passou de seis planos para zero após reload. Controle positivo ARBio aguarda login e não deve ser presumido. Nenhum frontend/B4/logística/ponte/gate foi publicado, instalado ou habilitado por essa atualização.

Todos os demais candidatos passam a usar baseline POSPLANOS. O instalador combinado antigo que inclui planos não pode ser reaplicado. Detalhes e hashes em `scripts/b2b-downstream-audit-20261107/production-postplans-baseline-20261108.md`.

Advisors relatados: RLS sem policy 60→59; WARN DEFINER inalterados; auth_rls_initplan 47→48; unused 327→328. O novo alerta da policy `cpp_tenant_read` será medido posteriormente; não ampliar grants nem enfraquecer RLS.

O conteúdo abaixo registra a investigação e a preparação histórica. As instruções de instalação já foram cumpridas pelo auditor e não autorizam nova execução.

## Achado real e limite da investigação

O proprietário reproduziu, com usuário FSF autenticado na prévia ligada à produção, a leitura irrestrita dos seis planos, incluindo `TESTE-FLUXO-20261108-V2`. Cinco têm evidência de origem ARBio; `AUDIT-CF-FIX-20260912` tem evidência distinta, detalhada abaixo. Portanto, não se deve descrever os seis como ARBio. Na mesma sessão, a aba Atribuições retornou “Nenhuma” (comportamento esperado), enquanto Planos expôs os seis (falha de isolamento). Nenhuma escrita FSF foi executada em produção. A captura local `fsf-leitura-planos-arbio.png` foi registrada pelo proprietário.

Consultas exclusivamente de metadados no ref canônico confirmaram que `rpc_admin_list_commercial_plans` é `SECURITY DEFINER`, aplica somente papel e filtros de busca/status, e não restringe empresa. A listagem operacional, a configuração B3 e o resolvedor de condições também não comparavam a organização do plano com a do ator/vínculo.

Nenhuma operação hospedada de escrita foi realizada neste trabalho.

## Decisão de propriedade

- Planos comerciais pertencem à empresa vendedora; administração exige papel administrativo/comercial **e** perfil ativo na mesma empresa.
- `created_by` de qualquer versão da família, resolvido por `profiles.user_id = commercial_payment_plans.created_by` — nunca por `profiles.id` —, define a proveniência quando todas as evidências concordam.
- Família sem evidência ou com tenants divergentes permanece com `organization_id NULL` e é negada pelos leitores/writers. Não se infere empresa por nome, FSF/ARBio ou conteúdo comercial. Em particular, o plano code `01`, embora tenha “FSF AGRO” no nome, pertence à vendedora ARBio pela organização do criador.
- Atribuições e matrizes precisam concordar com o tenant do plano e com o parceiro/cliente de destino.
- Comprador só lê plano ativo, da versão mais recente e com atribuição publicada/vigente para seu próprio vínculo, escopo, tenant e data.
- `payment_methods` e `financial_categories` continuam catálogos de referência globais. Seu uso no B3 fica limitado às versões publicadas e atribuídas ao parceiro pelo tenant vendedor; não há `organization_id` artificial nesses catálogos.
- `is_default` passa a ser único por empresa, não globalmente.

Na consulta read-only agregada desta preparação: seis planos, nenhum sem `created_by`, quatro atribuições e nenhum plano padrão; quatro famílias-raiz, todas com um único tenant candidato, zero ambíguas e zero sem evidência. Cinco planos apontam para a ARBio `007bb519-cba0-4704-be2c-cb93ad010048`.

A exceção `AUDIT-CF-FIX-20260912` (`d89ce2b4-9f68-4b0e-b78e-5009b6119a4f`) aponta somente para `8eae2bc1-ad00-4402-9f57-564258e493ca`, pela organização atual do perfil criador. O mesmo ator criou, submeteu e publicou sua atribuição e aparece nos eventos `commercial_plan_created` e `price_rule_insert`; o parceiro atribuído tem owner `NULL` e não há versão B3 ou outra evidência de tenant divergente. O criador está atualmente inativo e sem papéis, o que não autoriza reatribuir o histórico à ARBio nem concede administração a esse criador. Se surgir evidência divergente, a regra fail-closed mantém a família sem tenant e negada. Consulta e fatos sanitizados estão em `capture/provenance-20261108T1626Z.sql.readonly` e `.json`.

Esses números não são autorização de instalação: o PRE deve confirmar o estado atual. A organização atual do perfil não prova uma eventual organização histórica ausente dos registros, e nenhum `organization_id` histórico foi inventado.

## Escopo do candidato

O gerador produz 25 funções-alvo a partir de capturas completas e pinadas de `pg_get_functiondef`:

- sete RPCs administrativas: listar, criar, versionar, metadados, ativar/desativar, padrão e reordenar;
- leitura selecionável para compradores e listagem B3 de configuração;
- publicação, retirada e atribuição B3 de condições/meios;
- resolvedor B3 e opções de meio por condição publicada;
- atribuições comerciais P1 e suas leituras de itens/regras/histórico;
- validação/simulação de matriz;
- simulação e criação legadas, conversão de simulação e resposta de cotação.

Também inclui:

- coluna `organization_id`, gatilhos de imutabilidade e unicidade de padrão por tenant;
- RLS de leitura de planos e políticas aditivas para leituras de atribuições/itens/regras;
- cercas de tenant nas publicações/atribuições P1 e B3;
- PRE/POST transacionais com pins de funções, ACL de `service_role`, gatilhos e índice;
- rollback **deny-only**, sem restaurar funções ou índice global vulneráveis e sem apagar dados/versões/histórico.

Os writers legados de matrizes continuam usando suas guards P1 reais; o candidato acrescenta a concordância plano↔destino, sem abrir `EXECUTE` adicional.

## Evidência local

`test-local-pg.py` cria PostgreSQL descartável, carrega as funções canônicas necessárias e usa Auth/claims sintéticas explicitamente declaradas.

Resultado final anterior: **58/58 PASS, exit 0**. Após o complemento de proveniência, a regressão ampliada passou **63/63, exit 0**, em `evidence/local-pg.json` e `evidence/provenance-1626-run.txt`.

Antes da instalação local, a bateria reproduziu:

1. FSF lendo planos ARBio pela RPC administrativa;
2. FSF lendo ARBio pela listagem operacional;
3. configuração B3 FSF expondo plano ARBio;
4. FSF alterando metadados ARBio em dados exclusivamente sintéticos;
5. a atribuição histórica da exceção, com owner `NULL`, permanecendo invisível enquanto a listagem de Planos vazava — os dois comportamentos não foram confundidos.

Depois do candidato local, cobriu leitura própria ARBio/FSF, RLS direta, compradores, todos os writers administrativos, versões, padrões independentes, criação com tenant do servidor, imutabilidade do tenant, atribuições/matrizes cruzadas, publicação/atribuição B3, meios, revogação B3, revogação de vínculo/perfil, POST e rollback preservando dados.

A fixture tem `profiles.id` diferente de `profiles.user_id`, criador inativo para a exceção e owner de atribuição `NULL`; portanto, um join por `profiles.id` ou a atribuição da exceção à ARBio falha concretamente. A exceção ficou na organização distinta do próprio criador, visível ao admin dessa organização e invisível para ARBio. A família ambígua sintética permaneceu sem tenant e invisível. O rollback fechou RPCs e leituras, manteve planos/atribuições/versões e não reabriu o índice global.

Falhas de construção do harness e suas correções ficam em `evidence/attempts/`. Não são contadas como PASS funcional.

## Artefatos e ordem manual

1. Validar exatamente `swzpzcwiasxmjutrmvkm`; divergência = abortar.
2. Revisar `manifest.json`, capturas e diff das âncoras.
3. Auditor executa `01-pre.sql.readonly`; exigir `PRE_OK`.
4. Somente após revisão independente e autorização específica, executar `02-install.sql.review`.
5. Executar `03-post.sql.readonly`; exigir `POST_OK`.
6. Repetir o teste real de leitura: ARBio vê somente os próprios; FSF não vê ARBio. Não executar escrita FSF em produção para provar negação.
7. Homologar comprador autorizado e comprador revogado em sessões reais, sem alterar dados existentes.
8. Em incidente, `04-rollback-deny.sql.review` fecha os acessos; não é retorno ao comportamento vulnerável.

Candidato SHA256 superseded: `92053bcba29f7896f9a16cb311b8eff5fc28ed73af5e0a9fcae7afd5dc494af6`.

## Revisão independente f32c4f3 — 08/11 17:20 UTC

ANTES reproduziu colisão global de código e quatro escritas após revogação durante lock: padrão alvo/papel, padrão anterior/perfil, reordenação/tenant e criação aguardando unicidade/papel. Metadata/papel, ativação/perfil e versão/tenant já eram contidos por guards posteriores. Evidências em `evidence/review-f32c4f3/before.json`.

O gerador agora remove `commercial_payment_plans_code_key`, cria unicidade parcial `(organization_id,code)` para tenants determinados e revalida ator/papel/perfil/tenant após os locks relevantes e antes de efeitos/auditoria. Reordenação bloqueia IDs em ordem determinada. DEPOIS passou **79/79**, com códigos iguais permitidos entre empresas, duplicidade interna negada, zero efeitos após revogação e auditoria preservada. PRE/POST/rollback pinam constraint e índices; rollback mantém a contenção.

Novo candidato SHA256: `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40`.

A composição no MESMO PostgreSQL descartável com B3 e logística `db36815b…` passou **34/34**, incluindo comprador/vendedor positivos, FSF negativa, código compartilhado, dez gatilhos/ACL/fence e rollback conjunto. Evidência: `scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/checks.json`. Foi uma iteração com checkpoint novo identificado, não uma restauração integral adicional do zero.

## Não comprovado / ainda bloqueado

### Fechamento 40186 — nova execução local

O pacote exato `cc1f6cc837e29377b6b6fa4deaa334257cdab5484025a519dfd5833b8a12cd40` passou novamente **79/79, exit 0**; compatibilidade focada frontend **62/62, seis arquivos, exit 0**. Gerador executado em espelho temporário confirmou manifesto e quatro SQL byte-idênticos; 28 fontes pinadas e 25 assinaturas/retornos conferidos. Nova evidência e catálogo ACL/policies antes/depois/rollback em `evidence/review-40186/`, sem sobrescrever histórico. O auditor relatou PRE_OK read-only no projeto canônico e coleta de advisors; impacto dos advisors ainda pendente, sem autorização de instalação.

- Nenhuma instalação, JWT, PostgREST, RLS ou Storage hospedado foi exercitado por este pacote.
- Testes sintéticos não certificam a sessão FSF nem substituem o reteste real de leitura após instalação.
- Escritas negativas foram provadas apenas no PostgreSQL descartável; não se deve escrever como FSF em produção.
- Concorrência real multisessão e E2E de pedido não foram executados aqui.
- Liberação B3/E2E, envios, fiscal, cobranças e publicação permanecem bloqueados.
