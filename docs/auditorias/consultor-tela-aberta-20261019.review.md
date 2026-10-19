# Consultor técnico em tela aberta — candidata OFF

## Escopo e evidência externa

Base publicada informada e preservada no rollback: `8e61cb62764046b968836c4075c9bee3c79f777e`; preview observado pelo proprietário: `index-D2vTkjoH.js`.

O proprietário informou login real do consultor A em `/app/atendimentos`, papel exclusivo `consultor_tecnico`, organização A: inativação em `2026-10-19T00:56:12.105523Z`; às `00:56:46.968Z` ainda apareciam três atendimentos fictícios, menus e Novo sem reload. Restaurou o perfil em `00:56:57.928488Z`. Isso demonstra retenção visual, não prova autorização de novas requisições HTTP. O agente não alterou perfis/dados e não repetiu a revogação hosted.

## Implementação limitada

- `CONSULTANT_CONTEXT_MONITOR_ENABLED=false`. Foundation/B2B, produtor, financeiro e administrador continuam ativos; Blob false e escopo global v6 fechado.
- Monitor único de `AuthProvider`; `internalContextProbe` apenas amplia o papel tipado, mantendo default financeiro. Usa cliente canônico, h15 inicial, perfil próprio ativo/não provisório, papel único exato, `has_role` e h15 final. Nenhuma RPC/schema/Edge/rota nova.
- `AppPortalGuard` pausa antes de loading/negação derivados de leitores authzReady e envolve toda a árvore Campo, incluindo topbar, menus, botões, layout e páginas. O guard técnico original ainda decide acesso; boundary não concede permissão.
- `ProtectedRoutes` envolve o shell interno desktop para o mesmo recorte. Testado em `/visitas-tecnicas`. `/portal` permanece portal de produtor, não constitui novo acesso para consultor.
- Confirmação idêntica renova lease sem remount/refresh; erro, timeout, offline, foco/retry e mudança observada invalidam cache e descartam drafts/modais. Restore retoma sem recuperar drafts. Com gate OFF o recorte consultor não é instalado; roles mistos e organização NULL/inválida não são abrangidos por esta ativação.

## Provas locais, não homologação

- Consultor: **56/56** testes com AuthProvider, guards, MobileLayout/AppLayout e QueryClient reais; sessão e transportes fake, página de atendimentos explicitamente stub.
- Regressões direcionadas monitor/guards/gates: **258/258**, incluindo 56 consultor e 3 flags reais. Anexos/comprovante/scopes/URLs/lease/Blob: **106/106**.
- Staging: **6/6**, candidato/rollback byte-exatos, drift de fonte/artefato recusado antes de saída, destino externo vazio, acentos/LF/CRLF, ativação/deativação proibidas.
- Suíte completa candidata antes do teste adicional de três flags: **8101 passed, 6 failed, 6 skipped**, 555 arquivos (4 failed/550 passed/1 skipped). Base original arquivada: **8045 passed, 6 failed, 6 skipped**, 554 arquivos (4 failed/549 passed/1 skipped). As seis falhas e nomes coincidem; nenhuma falha nova observada nesta comparação. O delta de 56 corresponde ao novo teste de integração.
- Build automático: `build OK` em `2026-10-19T01:11:42Z`. Typecheck independente não foi executado manualmente nem há recibo separado disponível; não declarar PASS específico sem evidência do harness. Lint indisponível.
- Tentativa Playwright pública em `/app/atendimentos`: nenhuma pageerror, mas screenshot branca após três segundos; **não valida login nem fluxo autenticado**. Sem ativar gate ou manipular usuário para produzir prova artificial.

### Falhas históricas completas (também presentes na base)

1. `notification-p1-scope.test.tsx`: portal selector resets state, fences old requests and scopes storage — assertion estática espera `${STORAGE_KEY}:${scope}`.
2. `canonicalTypesGuard.test.ts`: nenhum arquivo de aplicação importa types.ts legado — encontrou ClienteDocumentosTab, EstornoDialog, AprovacaoCard, WizardAnexosStep e Categorias.
3. `cultivofarm-runtime.static.test.ts`: permite somente cliente canônico/nenhum contrato gerenciado em produção — ClienteDocumentosTab resolve contrato legado.
4. `etapasVisita.test.ts`: primeiro bloqueio antes de consultar servidor — `506 < -1` falha.
5. `etapasVisita.test.ts`: trava de clique único/salvamento — trecho `if (finalizandoRef.current || saveMut…` ausente.
6. `etapasVisita.test.ts`: seletores dependentes desabilitados sem pai — trecho `disabled={!clienteId}` ausente.

Não corrigidas fora deste recorte; riscos históricos não são considerados nulos.

## Entrega e rollback

`scripts/authz-cache/consultant-open-session/`: `manifest.json`, `SHA256SUMS`, `preflight-readonly.sql.review`, `candidate/`, `rollback/`, `stage.py`, `test_stage.py`.

Manifest fixa hashes SHA256 das fontes, baseline, artefatos e arquivos protegidos (monitor, probes B2B/produtor, Blob, painel/anexos/comprovante, cliente). Preflight herda cinco MD5 de funções, ACL/owner/search_path e checksums de policies profiles/user_roles do preflight admin aprovado pelo auditor; **esta versão consultor NÃO foi executada hosted**. Inclui marker canônico, RLS/SELECT e inventário agregado sem IDs/emails. Divergência exige STOP e revisão, não regeneração de hashes para obter PASS.

Staging somente produz diretório de revisão externo vazio: `python3 stage.py candidate|rollback <diretório>`. Não instala, publica, executa SQL nem ativa flag. Rollback restaura os dez arquivos anteriores byte-exatos e lista os dois testes novos para remoção manual; não restaura manifest/admin antigos nem desliga os recortes publicados. Qualquer mudança posterior em fonte/artefato protegido recusa staging; nunca aplicar rollback cegamente sobre evolução posterior.

## Gates pendentes

Revisão independente, preflight integral no ref `swzpzcwiasxmjutrmvkm`, eventual ativação autorizada e login real consultor/revoke/restore aguardam o proprietário. Sem banco, DDL/DML, Edge deploy ou publicação pelo agente. Não comprova revogação de vínculos técnicos específicos, entitlements, snapshot atômico, ABA/transientes entre polls, contratos, idempotência global ou v6 global. URLs/bytes já emitidos continuam sujeitos aos limites anteriores.