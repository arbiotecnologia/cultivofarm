# MULTIPORTAL-1 — Gestão/Técnico

## Escopo e diagnóstico

Recorte autorizado após STORAGE-2; checkpoint e bloqueios anteriores preservados. Sem publicação, Auth, papéis, vínculos, objetos Storage ou envios. Banco canônico: `swzpzcwiasxmjutrmvkm`.

Antes: RPC agrupava administrador/gestor em `is_admin` e devolvia B2B/Técnico; seletor tinha dois cards fixos. Gestor+técnico não tinha retorno explícito à Gestão; troca manual podia reenviar à preferência anterior. Inventário vivo encontrou um perfil ativo gestor+consultor_tecnico, contrariando inventário anterior; não foi criado para a prova.

## Mapeamento antes da implementação

| Caminho | Contrato e resultado |
|---|---|
| Login/AuthRoute/MobileLogin | Login mobile passa pelo seletor; administrativo único mantém home; gestor/admin com papel técnico real passa pela seleção. |
| RoleGuard/AppPortalGuard/ACCESS_MAP | Não alterados. Contexto visual não concede papel, feature, vínculo ou autorização. |
| MobileLayout/sidebar/UserMenu/MobilePerfil | Destinos existentes; troca visível com múltiplos contextos reais. Gestão usa `admin` e `/dashboard/geral`; Técnico usa `/app`. |
| SemPermissao/safeHome/AcessoPendente | Retorno seguro continua baseado nos papéis reais; botão de troca usa fluxo manual e confirmação de alterações. Sem novas rotas. |
| activePortalContext/sessionStorage | Contexto exclusivamente visual; limpo na mudança de escopo; preferência não é fonte de acesso. |
| portalBroadcast/useAuth | Eventos existentes de troca/logout/roles preservados; invalidação continua existente, sem novas concessões. |
| query keys/useAvailableContexts | UID/perfil/empresa/papéis/readiness na chave; cancela/remove caches de escopo anterior e cerca resposta por scope/epoch/abort/unmount. |
| RPCs/constraints preferência/log | Vocabulário `admin` aceito; readiness e empresa canônica antes dos efeitos; contexto validado contra resolver próprio. |

## Correção e compatibilidade

- Seletor apresenta somente contextos retornados pelo servidor. Gestão para administrador/gestor real; Técnico para papel técnico real; parceiro B2B somente com papel e vínculo canônico comprovados.
- Flags legadas `has_b2b_access`/`has_technical_access` administrativas preservadas; não equivalem a autorização nem a parceria própria. Nenhuma retirada de ACL operacional ou alteração dos guards.
- `/selecionar-portal?intent=switch` ignora salto de preferência apenas nessa intenção. Login normal e refresh normal preservam preferência. Cancelamento de alterações não salvas ocorre antes de limpar contexto/cache.
- Perfil correspondente ao Auth, ativo, sem senha provisória, empresa e papéis obrigatórios no frontend; readiness/h15 continuam autoritativos no servidor. Metadata não autoriza acesso.
- Lock local evita duplo clique na seleção e libera após erro; não é idempotência distribuída. Resultado atrasado A→B→A não altera contexto nem navega.

## Migration e ACL

Aplicada uma vez por ferramenta oficial: `20261008150531_75654814-4fed-4229-8c1e-458c611871d0.sql`, ledger confirmado no canônico; arquivo gerenciado disponível. Não reaplicar.

Três RPCs: `get_my_available_portal_contexts`, `set_my_context_preference(text,boolean)`, `register_my_login_redirect_secure(text)`. `search_path=''`, EXECUTE PUBLIC/anon revogado; authenticated/service_role mantidos, com validação server-side. Constraints de contexto/preferência/log aceitam `admin`; nenhuma tabela nova, RLS/guards de domínio ampliados ou conta modificada.

Linter da ferramenta reportou 418 avisos de baseline; não representa certificação global de segurança.

## Evidência SQL — não é JWT/API/browser

Script `scripts/rbac-audit/multiportal-1-proof.sql` executado com claims SQL de identidades existentes, sem criar Auth/perfil/papel/vínculo. `BEGIN`/`ROLLBACK` abrangem preferências e logs temporários.

- Multipapel: contextos exatamente Gestão/Técnico; seleção e leitura de preferência técnica, seleção Gestão, registro e limpeza de preferência validados.
- B2B como parceria própria recusado para multipapel sem vínculo; flag administrativa legada preservada.
- Outra identidade administrativa mantém Gestão e flag legada; preferência consultada para UID próprio. Esta checagem não certifica a composição de todas as policies de logs/preferências sob role authenticated, pois a sessão SQL administrativa não é sessão de API.
- Inativo/sem empresa: contextos vazios e quatro mutações de preferência/log negadas; sem UID: contexto vazio e preferência negada, total cinco negações.
- Retorno final e releitura independente: preferências **0**, MD5 `d41d8cd98f00b204e9800998ecf8427e`; logs **2**, MD5 `10bbe019e1d048c4d9281dfad68543f4`. Mesmos hashes/contagens iniciais, sem persistência da prova.

## Verificações

- **179/179**, 15 arquivos: contexto com QueryClient real e Auth/RPC mockados, selector/manual/cancelamento/erro/duplo clique, Auth, guards, mobile, cabeçalho e regressão de downloads/galeria Storage.
- **23/23**, três arquivos distintos: Meu Plano e retorno seguro. Não somar com rodadas anteriores sobrepostas.
- Lint focal dos arquivos alterados, inclusive `App.tsx`: sem erros/avisos; scanners secretos/fiscal e `git diff --check`: PASS.
- Harness automático executou typecheck/build: último registro **build OK 15:09:47 UTC**. Typecheck/build manual não executados por regra do ambiente. Erro intermediário do tipo `admin` em safeHome foi corrigido e revalidado.
- Warnings React Router future flags e log sanitizado de falha esperada preservados; não são falhas dos testes.

## Limites e rollback

**PASS focal:** seleção/contexto/cache nos testes, contrato RPC com claims SQL e preservação após rollback. **NO-GO integral:** browser real gestor+técnico, JWT/API, troca entre identidades/abas reais, revogação remota, concorrência e matriz integral não comprovados. Ambiente `external_unmanaged`; não solicitar credenciais em texto nem simular autenticação browser.

Rollback frontend: reverter somente diff MULTIPORTAL-1, preservando STORAGE-2 e demais contenções. Rollback SQL exige migration oficial de forward-fix autorizada: não restaurar ramo inseguro/global nem reduzir constraints enquanto existir contexto admin em preferências/logs; primeiro avaliar os registros sem apagar histórico. Nenhum rollback remoto executado além da transação de prova. Sem publicação e sem início de outra fase.