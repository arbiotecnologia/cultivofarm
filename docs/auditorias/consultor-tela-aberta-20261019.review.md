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

## Adendo — ativação limitada autorizada, 19/10 01:15 UTC

Seções anteriores e manifest são provas **OFF pré-ativação**, preservadas sem rehash. Proprietário informou revisão independente da candidata terminal `d509430a94fa42bcef84a3504ce3535d3133f1dd`: diff dos cinco arquivos runtime correto, 76 hashes fonte/artefatos PASS, staging6/6 Windows sem adaptação e probes fontes reais/transporte fake 12 consultor + 12 admin + 9 financeiro PASS. Informou execução **integral** de `preflight-readonly.sql.review` no conector produção `swzpzcwiasxmjutrmvkm`, `isError=false`, guards marker/5 MD5/ACL/RLS PASS. São evidências fornecidas pelo auditor/proprietário, não nova execução pelo agente.

Autorização aplicada: **somente** `CONSULTANT_CONTEXT_MONITOR_ENABLED: boolean = false` → `true`, mantendo byte a byte todo o restante do runtime/flags, inclusive comentários anteriores. Assertion real de `consultantGate.test.ts` agora exige true. Foundation/B2B/produtor/financeiro/admin seguem true, Blob false e global v6 fechado. Nenhuma alteração de monitor/probe/guard/anexos/contratos/banco/Edge.

### Staging ativo isolado

Novos `stage-active.py`, `test_stage_active.py` e `SHA256SUMS-active`; não substituem `stage.py`, `manifest.json`, `SHA256SUMS`, candidate/rollback OFF nem seus hashes.

O script fixa o SHA256 original do manifest `ed49a8d6f7814edf98ac713d209f4c50ecf1c318701cbf3ef0d39069519c1bac`, verifica seus 25 artefatos e 51 fontes/protegidos. Só admite gate ativo exatamente derivado da troca única false→true e assertion ativa exatamente derivada da troca explícita; diferenças adicionais recusam saída antes de escrever.

- `activation`: emite somente arquivo de gate ativo.
- `deactivation`: emite somente gate OFF pré-ativação; nenhuma outra flag/teste/runtime muda. Depois de desativar, assertion ativa exige ajuste consciente pelo operador; script não mascara drift alterando testes.
- `rollback`: emite bytes do rollback original (baseline anterior à candidata) e lista original dos dois testes novos para remoção manual. Não instala automaticamente.
- Cada modo exige fontes ativas exatas e diretório externo vazio; após desativação ou evolução das fontes, recusa nova operação até revisão específica.
- `stage.py` OFF original agora recusa fonte ativa: esperado, sem rehash para passar.

### Validação e limites

**5/5** testes staging ativo PASS: ativação/desativação byte-exatas/flags preservadas, rollback original, drift fonte/gate/assertion, drift manifest/artefatos, modos/destinos inválidos. **364/364** testes relevantes em 16 arquivos PASS (monitor/consultor/admin/financeiro/produtor/B2B/guards/gates/anexos/comprovante).

Suíte completa não repetida: só flag/assertion e artefatos isolados; seis falhas históricas permanecem documentadas. Build automático **OK em `2026-10-19T01:16:25Z`**. Busca em `/tmp/observability` e scripts disponíveis não encontrou recibo independente de typecheck: **typecheck não certificado**, sem execução manual pois o harness gerencia essa validação; lint indisponível.

Proprietário informou sessões reais consultor e admin B abertas, consultor ativo restaurado `00:56:57.928488Z`. Nenhum perfil/dado modificado neste turno. Testes fake não homologam login/revogação pós-ativação. Publicação pelo conector e homologação real dependem do proprietário; sem DDL/DML/Edge/publicação pelo agente. Não ampliar conclusões a vínculos específicos, snapshot/ABA, contratos, idempotência global ou global v6.