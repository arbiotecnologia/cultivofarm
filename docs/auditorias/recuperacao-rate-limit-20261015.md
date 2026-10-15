# Recuperação Auth — P2 UX, 2026-10-15 21:45 UTC

## Diagnóstico e proveniência
- Evidência fornecida pelo auditor e logs anexados: no canônico `swzpzcwiasxmjutrmvkm`, `/recover` em21:44:39Z e21:44:46Z retornou429/`over_email_send_rate_limit` (`email rate limit exceeded`). Sucessos anteriores em21:30:24Z e21:36:38Z informados; o segundo também consta dos logs anexados. Não houve consulta remota adicional pelo agente.
- Limite do serviço de email; não é falha comprovada do cadastro. Esta entrega melhora a UX, não altera nem resolve a capacidade/disponibilidade do provedor.

## Delta focal
- `PasswordRecoveryForm` compartilhado desktop/mobile classifica `failure.code` `over_email_send_rate_limit`, `over_request_rate_limit` ou `failure.status===429` sem reproduzir mensagem do provedor.
- Mensagem: “O serviço de email atingiu um limite temporário de envios. Aguarde e tente novamente mais tarde.” Sem existência de conta, prazo prometido ou previsão sem Retry-After.
- Pausa local de60s após esse retorno: botão desabilitado e guard síncrono por timestamp também impede submit programático/Enter/duplicado. Timer apenas reabilita a interface; não faz retry. Cleanup na desmontagem e resposta tardia não cria timer.
- Sucesso neutro, demais erros genéricos, redirect fixo canônico, pending/loading, readiness e finalizadores existentes preservados. Nenhuma mudança em rate limit, SMTP, configuração Auth, senhas, dados, roles, permissões, dependências ou rotas.
- Pausa volátil da instância do formulário: voltar/remontar, outra aba ou dispositivo não compartilham o bloqueio. Não é idempotência distribuída nem proteção substituta do Auth.

## Verificações próprias
- Vitest42/42 em3arquivos:18 UI (6 novos),5 recovery-flow,19 first-access. Códigos específicos/status429, erro genérico/rejection com retry manual, sucesso neutro, destino exato, duplicidade pending/cooldown, bloqueio59.999ms/liberação60.000ms, ausência de retry e cleanup/resposta tardia. Transporte/Auth simulados; nenhum email real.
- ESLint focal nos2arquivos TSX: exit0; `git diff --check`: exit0. Avisos preexistentes React Router nos testes, sem falhas.
- Build automático da prévia OK em21:47:17Z. Typecheck separado app/node NÃO EXECUTADO manualmente (restrição do ambiente); não confundir build com prova separada.
- Browser local público, formulário real em `/auth?recovery=1`,429 interceptado antes da rede: botão bloqueado59.999ms, liberado60.000ms, exatamente1pedido simulado/zero retries automáticos. Desktop1280×1800 e mobile390×844, sem overflow; capturas em `/tmp/browser/recovery-limit/`.
- Primeira medição browser falhou porque o relógio continuava avançando durante as capturas; não foi PASS. Corrigido somente instrumento com relógio pausado, repetição PASS. Limite exato também coberto por fake timers Vitest.

## Estado, dependência e rollback
**GO focal local para revisão; serviço de email/recuperação real não certificados nesta rodada.** Auditor revisa e publica; nenhuma publicação/deploy, DDL/grant, conta ou email pelo agente. Não se promete liberação do provedor após60s.

Rollback: remover somente classificação429/cooldown do formulário e os testes correspondentes, preservando redirect, lock, sucesso neutro e erro genérico. Isso retorna à UX genérica anterior, sem rollback de Auth/banco. Arquivos: formulário, teste UI, regra existente de recuperação emAGENTS, memória do requisito, roadmap e este relatório. Snapshot funcional/testes automático observado `5876e51c`; snapshot documental final atribuído pelo harness, sem commit manual.