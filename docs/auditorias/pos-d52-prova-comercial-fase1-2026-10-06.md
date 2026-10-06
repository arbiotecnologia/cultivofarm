# Pós-D52 — Prova comercial positiva e fundação de pagamentos

## 1. Nome

Auditoria viva da prova comercial positiva — Fase 1 e Gate A — 2026-10-06.

## 2. Objetivo

Verificar, em modo somente leitura, se o Supabase canônico já contém uma versão comercial real publicada e uma assinatura real `ACTIVE` ou `TRIAL` vinculada a ela. A auditoria também confere o modelo, as proteções e o fluxo existente antes de qualquer alteração.

## 3. Diagnóstico atual

- Supabase canônico confirmado: `swzpzcwiasxmjutrmvkm`.
- Quatro planos existem e estão ativos.
- Existem 17 funcionalidades ativas e 54 vínculos plano–funcionalidade; os quatro planos possuem vínculos.
- Existem **zero versões comerciais** e, portanto, zero versões comercialmente publicadas.
- Existem cinco assinaturas: uma `ACTIVE`, três `TRIAL` e uma `SUSPENDED`; todas são legadas e têm `plan_version_id` nulo.
- Existem zero candidatas à prova positiva `ACTIVE`/`TRIAL` versionada.
- Existem zero exceções de funcionalidade vigentes e nove registros no histórico de assinaturas.
- A publicação do aplicativo confirmada pelo proprietário é deploy do produto. Ela não criou uma linha em `saas_plan_versions` e não equivale a publicação comercial.

## 4. Estrutura de dados

- `saas_plans` mantém o catálogo-base de planos.
- `saas_plan_features` mantém a composição mutável usada como fonte de uma publicação.
- `saas_plan_versions` guarda versões imutáveis com nome, descrição, preço, moeda, ciclo, limites, funcionalidades, vigência, autor, motivo e correlação.
- `saas_plan_version_features` congela a composição detalhada da versão.
- `organization_subscriptions` vincula organização, plano e versão, preservando snapshots de preço, moeda, ciclo, limites e funcionalidades.
- `organization_subscription_history` registra alterações de forma append-only.
- `organization_feature_overrides` registra exceções explícitas sem reescrever a versão contratada.

O modelo vivo não possui coluna de estado `DRAFT/PUBLISHED/ARCHIVED`. Toda linha de `saas_plan_versions` nasce publicada, com `published_at` obrigatório e padrão `now()`. Como não há linhas, também não há rascunho comercial real disponível para publicação.

## 5. Regras comerciais encontradas

A rotina viva `platform_publish_plan_version` exige:

- plano ativo existente;
- preço não nulo e não negativo;
- moeda com três letras maiúsculas;
- ciclo `monthly`, `quarterly`, `semiannual`, `annual` ou `custom`;
- limites em objeto JSON;
- início de vigência não nulo;
- motivo com ao menos cinco caracteres;
- correlação não nula e idempotente.

As funcionalidades são copiadas de `saas_plan_features` no momento da publicação. Não existe trial configurável na versão: o fluxo atual cria trial fixo de 14 dias ao iniciar uma assinatura versionada. Não foi inferido nem criado qualquer preço, moeda, ciclo, limite, vigência, trial ou funcionalidade.

## 6. Fluxo existente

- `platform_publish_plan_version` cria diretamente uma nova versão publicada e seu snapshot de funcionalidades.
- A função bloqueia sobreposição de vigência, serializa o plano com `FOR UPDATE`, usa correlação idempotente e emite ticket transacional antes dos inserts.
- `platform_transition_subscription` aceita apenas ações enumeradas, bloqueia assinatura legada, seleciona a assinatura corrente com lock e copia os snapshots da versão.
- `get_my_entitlement_context` separa contexto administrativo, legado, ausência de assinatura, assinatura ativa, trial vigente/expirado e estados bloqueados.
- `get_my_entitlements` deriva a organização de `auth.uid()` e só retorna funcionalidades de assinatura versionada elegível.

Não há fluxo de rascunho comercial. O hook de publicação existe, mas não é usado por nenhuma tela. O painel lista planos e versões publicadas, porém não oferece formulário, checklist de pendências ou confirmação forte de publicação.

## 7. Permissões e RLS

- Todas as tabelas SaaS auditadas estão com RLS habilitada.
- Leitura de assinaturas e histórico é limitada ao Platform Superadmin ou ao administrador da própria organização.
- Versões e funcionalidades versionadas são legíveis pelo Platform Superadmin e pelo administrador tenant somente quando vinculadas à própria assinatura.
- As RPCs de publicação e transição são `SECURITY INVOKER`, têm `search_path` vazio e validam `public.is_platform_superadmin(auth.uid())`.
- `get_my_entitlement_context` é `SECURITY INVOKER`; o helper privado deriva `auth.uid()`, usa `SECURITY DEFINER` com `search_path` vazio e não aceita organização como parâmetro.
- Funções de gatilho privilegiadas não são executáveis por `PUBLIC`, `anon` ou `authenticated`.

Risco a tratar na próxima fase: o estado vivo ainda reporta privilégios de tabela herdados por `PUBLIC` para `anon` em versões e exceções, e privilégios de escrita para `authenticated` em versões/exceções/assinaturas. A RLS, as policies e os gatilhos mantêm o acesso efetivo restrito, mas os grants são mais amplos que o menor privilégio desejado e devem ser normalizados com prova de não regressão.

## 8. Impactos

- Usuários legados continuam bloqueados nas rotas mapeadas por plano, conforme o fechamento D52.
- Novos trials e mudanças de plano continuam indisponíveis porque não existe versão vigente.
- Nenhuma assinatura, plano, funcionalidade, limite ou histórico foi alterado nesta auditoria.
- D51.6 não foi reaberta nem modificada.

## 9. Performance

- Há índices para plano e vigência da versão, composição por funcionalidade, assinatura por organização/status/versão, trial vencido e correlação do histórico.
- A assinatura corrente possui índice único parcial por organização para estados não terminais.
- O job de expiração de trials permanece ativo diariamente às 02:15 UTC e alcança somente trials versionados vencidos; os legados permanecem fora dele.

## 10. Auditoria

- Versões e suas funcionalidades possuem gatilhos que bloqueiam `UPDATE` e `DELETE`.
- Assinaturas possuem guarda por ticket transacional e histórico automático.
- Histórico de assinatura possui proteção append-only.
- Motivo e correlação são persistidos na publicação; a correlação possui índice único.
- O linter vivo retornou 467 achados preexistentes em quatro categorias. Nenhuma escrita foi feita para remediá-los nesta fase somente leitura. Há dois alertas globais de função `SECURITY DEFINER` executável sem login; a consulta sanitizada indicou funções públicas de validação de comprovante/rastreio, fora do núcleo SaaS auditado.

## 11. UI/UX

O painel de Plataforma já mostra:

- catálogo de planos;
- versões comerciais publicadas;
- bloqueio quando nenhuma versão vigente existe;
- assinaturas, situação e regularização pendente;
- histórico e exceções.

Ainda falta a interface segura de publicação: campos comerciais, checklist de pendências, confirmação forte, estados de envio e prevenção explícita de duplo clique. O modelo atual também não suporta os rótulos `DRAFT/PUBLISHED/ARCHIVED`; introduzi-los exige evolução versionada, não apenas apresentação.

## 12. Integrações

- Nenhum gateway, checkout, webhook ou credencial de pagamento foi criado ou acionado.
- A fundação de pagamentos permanece fora desta fase e com cobrança real `OFF/NO-GO`.
- Os planos SaaS auditados são distintos dos planos de pagamento comerciais B2B; os dois domínios não devem ser misturados.

## 13. Riscos

1. Publicar agora exigiria inventar ou receber dados comerciais ainda ausentes.
2. A rotina atual publica diretamente; não existe rascunho persistido para revisão prévia.
3. A interface não expõe o fluxo de publicação existente, embora o hook já exista.
4. Grants amplos dependem das camadas de RLS/gatilhos; devem ser reduzidos na Fase 2 sem quebrar as RPCs `SECURITY INVOKER`.
5. Há sobreposição histórica de policies e gatilhos em algumas tabelas. Ela não abriu acesso na matriz D52, mas aumenta custo de manutenção e requer consolidação cuidadosa.
6. A prova positiva não pode ser executada sem uma versão real e uma assinatura real vinculada.

## 14. Critérios de aceite do Gate A

- [x] Estado vivo auditado sem escrita.
- [x] Contagens sanitizadas registradas.
- [x] Publicação do aplicativo distinguida da publicação comercial.
- [x] Campos e validações comerciais identificados.
- [x] RPCs, RLS, grants, gatilhos, índices e funções privilegiadas revisados.
- [x] Ausência de versão publicada e assinatura versionada confirmada.
- [x] Nenhum dado comercial inventado ou publicado.

## 15. Testes e evidências

Evidências vivas somente leitura:

- planos: 4 ativos;
- versões: 0;
- assinaturas: 5 legadas, 0 versionadas;
- distribuição: 1 `ACTIVE`, 3 `TRIAL`, 1 `SUSPENDED`;
- candidatas positivas: 0;
- funcionalidades: 17 ativas; vínculos: 54;
- exceções vigentes: 0;
- histórico de assinaturas: 9 linhas;
- RLS: habilitada nas tabelas auditadas;
- job de expiração: ativo.

Nenhum e-mail, UUID, IP, identificador de requisição, token, cookie ou segredo foi registrado.

## 16. Fases executadas e próximas

- **Fase 1:** concluída.
- **Gate A:** concluído com bloqueio comercial.
- **Fase 2:** pendente. Deve evoluir o fluxo seguro de publicação, mostrar os campos faltantes e normalizar privilégios, sem criar dados fictícios.
- **Fase 3:** bloqueada até existir versão comercial real completa e assinatura real versionada.
- **Fase 4:** não iniciada; fundação de pagamentos permanece planejada e cobrança real desligada.
- **Próxima fase do produto:** não iniciada, pois o PASS comercial ainda não existe.

## 17. Prompt e decisão final

- **Prova comercial positiva:** **BLOCKED/NO-GO** — zero versões comerciais e zero assinaturas versionadas.
- **Fundação de pagamentos:** **PLANNED**, não iniciada.
- **Cobrança real:** **OFF/NO-GO**.
- **Avanço da próxima fase:** **NO-GO** até a prova comercial positiva real.

Próxima ação mínima: iniciar a Fase 2 para disponibilizar no painel de Platform Superadmin um fluxo revisável e seguro de publicação comercial, sem preencher valores por inferência. A publicação somente poderá ocorrer depois que o proprietário fornecer e confirmar os dados comerciais reais.

### Arquivos alterados nesta fase

- `docs/auditorias/pos-d52-prova-comercial-fase1-2026-10-06.md` — novo relatório sanitizado.
- `roadmap.md` — Fase 1 e Gate A marcados como concluídos; fases seguintes permanecem pendentes.

Nenhum código, migration, configuração, plano, assinatura ou dado vivo foi alterado.