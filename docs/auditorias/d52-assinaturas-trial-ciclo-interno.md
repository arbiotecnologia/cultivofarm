# D52 — Assinaturas, trial e ciclo interno

## Decisão

- **Segurança e isolamento:** PASS estrutural.
- **Homologação funcional autenticada:** B1 PASS com Platform Superadmin real; B2/B3 permanecem pendentes.
- **Núcleo A+B+C:** PASS estrutural.
- **Ativação comercial:** NO-GO funcional até publicação explícita de versão real.
- **Pagamento externo:** BLOCKED / NO-GO. Não existe gateway homologado e nenhum fluxo, webhook ou confirmação simulada foi criado.

## Estado encontrado

- Cinco assinaturas foram preservadas: três `TRIAL`, uma `ACTIVE` e uma `SUSPENDED`.
- As cinco são legadas, sem versão comercial, preço, ciclo e vigência confiáveis.
- Nenhuma recebeu versão, preço, moeda, ciclo ou vigência comercial por inferência.
- Os três trials tinham `started_at` inequívoco; somente `trial_ends_at` recebeu backfill determinístico de `started_at + 14 dias`.
- O catálogo tinha 54 vínculos de funcionalidades, todos sem limite numérico definido.

## Implementação

- Versões imutáveis de plano guardam nome, preço, moeda, ciclo, limites, funcionalidades e vigência.
- Assinaturas novas guardam snapshots comerciais e iniciam trial imutável de 14 dias.
- Assinaturas legadas permanecem identificadas e fail-closed até regularização comercial explícita.
- Ações de estado são específicas, idempotentes por correlação, serializadas por lock e auditadas; não existe seletor arbitrário de status.
- A expiração diária alcança somente trials versionados com data vencida, usa lock e gera correlação única por alteração.
- Extensão de trial é uma exceção explícita e auditada, limitada a 14 dias por ação; não há renovação silenciosa.
- Entitlements passaram a derivar exclusivamente da versão imutável vinculada à assinatura e das exceções explícitas vigentes; legado sem versão e estados não liberados permanecem fail-closed.
- O estado de acesso diferencia `legacy_unversioned`, ausência de assinatura, status bloqueado, erro/carregamento e bypass administrativo explícito de Platform Superadmin; somente rotas mapeadas por plano são restringidas.
- As telas de Plataforma usam ações específicas, exibem versões/snapshots/histórico e bloqueiam mudanças comerciais sem versão vigente; “Meu Plano” sinaliza regularização pendente sem oferecer mutação tenant.
- A rota de Comunicação foi alinhada ao mesmo gate adicional de plano usado pelas demais rotas mapeadas, preservando seu guard de papel e sua proteção server-side existentes.

## Segurança

- Escritas usam RPCs `platform_*` com validação server-side de Platform Superadmin, RLS e ticket por transação.
- Identificadores enviados pelo navegador selecionam o alvo, mas nunca concedem autorização.
- Histórico é append-only e registra ator, origem, motivo, ação, estados, planos, versão, snapshots e correlação.
- Nenhuma chave, token, preço ou identidade de homologação aparece neste relatório.
- Erros ou carregamento de entitlements não liberam rotas contratáveis; menu, rota e triggers server-side usam a mesma decisão restritiva.
- Correção P0: removido o bypass de entitlement baseado no papel `superadmin` carregado pelo frontend. Todo usuário autenticado consulta primeiro o contexto server-side; somente o retorno exato `platform_superadmin`, calculado por `public.is_platform_superadmin(auth.uid())`, libera a exceção administrativa.
- A RPC pública de contexto é `SECURITY INVOKER`; a leitura protegida ocorre em helper privado `SECURITY DEFINER`, sem parâmetros de usuário/organização, com `search_path` vazio e privilégios mínimos. Entitlements só são consultados após contexto `active` ou `trial_active`.

## Pagamento

Pagamento externo permanece **BLOCKED / NO-GO**. Ativação automática por pagamento, checkout, cobrança, webhook, conciliação e reativação financeira exigem integração real posteriormente autorizada e homologada. Falhas ambíguas nunca devem marcar uma assinatura como paga.

## Homologação controlada

- A matriz estrutural confirmou que usuários tenant só leem a própria assinatura e não recebem ações de mutação; a matriz de rotas documentada está em `src/lib/saas/featureRouteMap.ts` e seus testes validam prefixos, URL direta, rotas essenciais, loading/erro, legado, bloqueio e bypass administrativo.
- Escritas de assinatura exigem Platform Superadmin, ação permitida, motivo, correlação e ticket transacional.
- IDs de organização ou versão enviados pelo navegador não concedem autorização.
- A função de contexto usa `auth.uid()` e execução invoker; a resolução crítica usa `SECURITY DEFINER` com `search_path` vazio e privilégios mínimos. Os modos canônicos de exceção `GRANT`/`REVOKE` foram corrigidos após auditoria do contrato vivo.
- Não foram criadas organizações, versões, preços ou limites fictícios para produzir um falso PASS funcional.
- A prova positiva de criação, upgrade, downgrade e reativação ficou **BLOCKED**: não existe versão comercial real publicada e as cinco assinaturas vivas são legadas sem snapshots confiáveis.
- Limites numéricos só são exibidos quando presentes no snapshot/override. Como não existe métrica contratual confiável publicada, consumo/excedente quantitativo continua **BLOCKED/NO-GO**, sem números inferidos.
- A prova A/B D51.6 continua válida para isolamento tenant; não foi reaberta nem reutilizada para declarar sucesso comercial.

## Gate final de homologação autenticada real — 2026-10-06

- Estado vivo preservado e consultado somente para leitura: cinco assinaturas, todas sem `plan_version_id`; zero versões comerciais e zero exceções vigentes.
- Existem no estado vivo uma identidade Platform Superadmin e quatro candidatos tenant ativos com assinatura legada. Nenhum e-mail, UUID, token ou outro identificador sensível foi registrado.
- Contrato vivo das funções: `get_my_entitlement_context()` é `SECURITY INVOKER`; `platform_private.my_entitlement_context()` é `SECURITY DEFINER`, não recebe organização, usa `auth.uid()`, `search_path` vazio e concede execução somente a `authenticated`; `anon` não executa. A exceção administrativa é decidida exclusivamente por `public.is_platform_superadmin(auth.uid())` no servidor.
- `get_my_entitlements()` deriva a organização do perfil ativo associado a `auth.uid()` e só considera assinatura versionada em `ACTIVE` ou `TRIAL` vigente. Com zero assinaturas versionadas, a API não concede feature por inferência.
- Frontend confirmado: toda identidade autenticada consulta primeiro `get_my_entitlement_context`; `get_my_entitlements` só é chamado após `active` ou `trial_active`. Menu e URL direta usam o mesmo `isPathEntitled`; rota mapeada falha fechada em `legacy_unversioned`, enquanto rota essencial não mapeada preserva RBAC/RLS.
- Não foi encontrado bypass de entitlement por papel, armazenamento local, claim do navegador ou parâmetro de URL. Usos locais de `superadmin` fora do hook pertencem a apresentação/guards RBAC já existentes e não alteram o contexto de plano.
- **B1 — PASS autenticado real:** um login real bem-sucedido no preview foi auditado pelo Supabase canônico; a mesma identidade foi validada no banco vivo como Platform Superadmin. A definição viva de `platform_private.my_entitlement_context()` deriva exclusivamente `auth.uid()`, usa `search_path` vazio e retorna exatamente `platform_superadmin` quando `public.is_platform_superadmin(auth.uid())` é verdadeiro. Nenhuma identidade foi simulada, nenhum JWT foi fabricado e nenhum dado comercial foi alterado.
- A evidência de B1 não depende de papel, armazenamento local, claim ou decisão do frontend: ela combina login real auditado pelo Supabase com validação server-side da mesma identidade no banco vivo, sem registrar e-mail, UUID, IP, identificador de requisição, token ou outro identificador sensível.
- B2/B3 permanecem **UNVERIFIED**: ainda faltam a sessão real de tenant legado, o bloqueio/navegação correspondente e a matriz de isolamento A/B com tentativa de forja de organização. A prova automatizada de que um papel local `superadmin` não concede bypass permanece válida, mas não substitui esses testes reais.
- Decisão do gate: **PASS estrutural; B1 PASS autenticado real; B2/B3 pendentes; comercial positivo BLOCKED**. Entitlements/UI não está 100% concluído enquanto faltar a matriz real de tenant legado e isolamento.

## Validações

- Estado vivo: zero versões comerciais e zero assinaturas vinculadas; dados legados preservados e três datas finais de trial derivadas somente do início registrado.
- Job `saas-expire-due-trials`: ativo diariamente às 02:15 UTC; trials legados continuam fora da expiração automática por não terem versão comercial.
- Testes focados de estados, trial, autorização e idempotência passaram; typecheck, scanner, linter e compilação automática foram executados nesta retomada.
- A suíte global desta retomada passou com 5.481 testes e quatro ignorados; os 45 testes focados de Entitlements/UI também passaram.
- Linter Supabase: 467 achados preexistentes (17 informativos, 450 avisos), nenhum novo achado atribuído às migrations D52.
- Smoke passivo sem sessão: `/auth`, HTTP navegável e zero erro de página; nenhuma mutação ou cobrança foi acionada.
- Estado final de entitlements/UI: zero versões comerciais e cinco assinaturas legadas; a prova negativa é real e fail-closed. Nenhuma publicação, transição, exceção ou dado comercial foi criado para fabricar PASS.
- Gate autenticado final: B1 passou com login real auditado pelo Supabase e validação server-side da mesma identidade; B2/B3 permanecem pendentes e nenhuma conclusão sobre tenant legado ou isolamento foi inferida.

## Rollback e forward-fix

- Rollback seguro imediato: desabilitar o job e revogar as RPCs específicas, preservando tabelas, snapshots e histórico.
- Não remover colunas, versões ou eventos após uso; correções devem ser migrations aditivas.
- Forward-fix: cadastrar versões comerciais reais por Superadmin e regularizar cada assinatura legada explicitamente, sem inferir valores.
- Forward-fix de limites: definir métricas contratuais e medidores server-side por funcionalidade antes de habilitar bloqueios quantitativos ou mostrar consumo/excedente.