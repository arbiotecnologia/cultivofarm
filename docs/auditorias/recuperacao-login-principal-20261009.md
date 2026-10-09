# Delta focal — recuperação no login principal

## Escopo e referência
Solicitação de 2026-10-09 19:59 UTC, base confirmada `fe5755e48d32609f531b783f85ad864cbbe16e20`. Ausência da opção no login principal confirmada no código; mobile já solicitava recuperação. Este delta não certifica a auditoria integral nem o fluxo B2B.

## Alteração
- Login principal oferece “Esqueci minha senha” e formulário somente email, com retorno ao login.
- Desktop e MobileLogin usam `PasswordRecoveryForm`, cliente Supabase canônico e política já existente `getPlatformInviteRedirectUrl`: `https://app.cultivofarm.com.br/reset-password`. Origem da prévia, parâmetros e hash não compõem o redirect.
- Sucesso genérico não afirma existência de conta nem entrega de email. Erro retornado/rejection não reproduzem mensagens do provedor. `finally` libera loading/lock; ref bloqueia reentrada síncrona, retorno e input ficam desabilitados enquanto há envio. Resposta após desmontagem não atualiza a tela.
- Link inválido em ResetPassword oferece login ou novo pedido em `/auth?recovery=1`; nenhuma nova rota. Diagnóstico first-access, finalizadores, limpeza de fragmento e guards/RLS permanecem intactos. Cadastro público não foi reaberto.

## Verificação e proveniência
- **36/36 testes em três arquivos PASS**, incluindo 12 testes UI desktop/mobile com mocks: abrir/voltar, ausência de senha/cadastro, redirect exato, nenhuma chamada signUp/signIn/update, confirmação genérica, erro/rejection/retry, submit duplicado e loading, links inválidos. Cinco testes recovery-flow e 19 first-access preservados.
- Primeira execução: 35 PASS/1 FAIL, falha preexistente por procurar URL literal em reexport histórico. Corrigida para executar a política compartilhada e assertar o valor exato; nova rodada 36 PASS. Não alterar histórico de PASS anterior.
- **Lint focal dos seis arquivos TS/TSX PASS**, scanner de segredos do repositório PASS e diff-check PASS.
- **Build automático da prévia OK** em 20:02:49 UTC, após alterações funcionais. Nenhum build manual executado.
- **Typechecks app/node separados NOT RUN**: tsgo disponível, mas execução manual de typecheck/build é proibida neste ambiente; o processo automático valida a prévia. Build OK não é apresentado como execução separada de typecheck app/node.
- **Browser público local PASS focal**: abriu recuperação pelo botão, voltou ao login e navegou de link inválido para `/auth?recovery=1`; formulário sem senha. Capturas 1280×1800 e 390×844 sem overflow horizontal. Nenhum email preenchido, zero pedidos `/auth/v1/recover`; interceptação adicional abortaria qualquer pedido. Sem sessão autenticada nem teste de envio real. Capturas mostraram marca ainda em loading, portanto não certificam carregamento de branding.

## Riscos e limites
Pronto localmente e verificado com mocks/visualização pública, **não publicado nesta rodada**. SMTP, allowlist efetiva hospedada, recebimento/expiração de email, rate-limit real e troca real de senha **UNVERIFIED**. Bloqueio local não é idempotência distribuída e não impede pedidos em abas/dispositivos distintos; limites reais pertencem ao Auth. Mensagens sanitizadas não constituem certificação contra enumeração temporal do serviço remoto. Sem chamadas reais de Auth, alteração de senha, migration, gate B2B, emissão, cobrança ou publicação; Executivo19/emailv9 preservados.

## Rollback
Reverter somente as mudanças de Auth.tsx, MobileLogin.tsx, links adicionais de ResetPassword.tsx e remover o formulário compartilhado caso seja necessário recuar; nenhum rollback de banco/Auth, guards, finalizadores ou contenções. Isso restaura a lacuna do login principal, portanto preferir correção focal. Preservar os adendos históricos e registrar eventual decisão de rollback.

## Arquivos
1. `src/components/auth/PasswordRecoveryForm.tsx`
2. `src/pages/Auth.tsx`
3. `src/pages/app/MobileLogin.tsx`
4. `src/pages/ResetPassword.tsx`
5. `src/test/saas/password-recovery.ui.test.tsx`
6. `src/test/saas/first-access.test.ts`
7. `AGENTS.md`
8. `roadmap.md`
9. `docs/auditorias/retomada-delta-2026-10-08.md`
10. Este relatório.

Commits automáticos observados: `43ae29e3` (funcional), `b40e166b` (testes UI), `66cd1ed4` (asserção do redirect). SHA final documental atribuído pelo harness, não por comando git stateful. **GO focal local; email real/publicação não testados; NO-GO integral mantido.**