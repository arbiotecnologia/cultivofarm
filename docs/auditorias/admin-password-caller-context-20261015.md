# Alteração administrativa de senha — recorte 21:51 UTC

## Diagnóstico e proveniência
Evidência **externa canônica**, informada por Renato: POST `admin-update-user-password` às 21:47:15.602Z retornou403; Edge v79 usava service_role em has_role e ignorava o erro. Probe service_role retornou42501 em platform_private; authenticated/Admin AR retornou has_role=true e admin_can_update_user_password_server=true para o Produtor. Não é falta de perfil nem falha da senha comprovada. Nenhuma reprodução remota de mutação foi realizada pelo agente.

## Alteração focal
- `supabase/functions/admin-update-user-password/index.ts`: getUser valida o JWT; anonClient existente executa **ambas** RPCs. Negação false/NULL →403 `ADMIN_PASSWORD_FORBIDDEN`; erro RPC →500 `ADMIN_PASSWORD_AUTHORIZATION_ERROR`; exceções →500 código interno fixo; ausência/JWT inválido →401. Service client criado somente após autorização para Auth password/audit_senha_log. Sem grants, SECURITY DEFINER, DDL ou novos endpoints.
- Backend valida UUID e senha8–128/letra+número, incluindo o conjunto acentuado já aceito no frontend. Frontend reutiliza senhaValida e confirma coincidência. Não aceita sucesso implícito.
- `src/lib/configuracoes/adminPassword.ts` é o contrato de mensagens usado pela mutation existente de Configuracoes: lê FunctionsHttpError, somente código público allowlisted; mensagens arbitrárias, stack e resposta bruta nunca exibidas.
- Primeiro acesso preservado: updateUserById recebe **exatamente** `{password}`. Nenhum email_confirm, metadata, profiles, senha_provisoria ou readiness alterado. Para a conta cuja senha_provisoria=true/email não confirmado foi informada, reset administrativo não substitui prova recovery nem promete desbloqueio. UI explica a pendência sem inventar estado Auth que não lê.
- Auditoria mantém executor/alvo sem senha. Erro de auditoria retornado mantém comportamento anterior de sucesso após Auth atualizado, com log fixo seguro. Não há atomicidade distribuída entre Auth e audit; nenhuma compensação que altere senha é introduzida.
- Recuperação429, pausa local60s, redirects, SMTP, limites, Auth config, OS, Storage e demais permissões intocados.

## Testes e limites
Handler **real** transpilado, Deno/SDK mockados, sem rede:29 testes cobrem JWT, admin, tenant negado, papéis externos/Financeiro/SA, scope NULL, RPC erro/exceção, senha, payload password-only, auditoria e ausência de senha/erro bruto em saída pública/logs. Mocks de false para empresa/readiness/revogação provam obediência da Edge, **não** os predicados hosted.
Contrato UI17 testes: códigos allowlisted, corpo arbitrário, FunctionsHttpError, validação, confirmação e sucesso estrito. Mutation real da página:2 testes, fonte extraída por AST, SDK isolado.
Primeira bateria7arquivos **123/123 PASS**, incluindo recuperação/regras/guards. QA final registrado no roadmap. Build automáticoOK21:54:30Z; typechecks manuais não executados (harness responsável). Lint novos arquivos e teste existente focal0; Configuracoes tem18erros/2avisos **legados**, mesma saída normalizada do baseline03ad3093; não alegar lint globalPASS.

## Estado/ativação e rollback
**GO restrito para revisão de fonte; produção pós-fix UNVERIFIED.** Nenhuma senha real, email, conta, SQL, grant, deploy ou publicação executados. Admin AR disponível ao auditor: a limitação desta evidência não implica indisponibilidade da sessão dele. Auditor revisa/implanta e verifica handler no canônico `swzpzcwiasxmjutrmvkm`; não usar outros refs. Versão vigente pós-implantação ainda não informada.
Rollback de contenção: manter ação administrativa desabilitada na UI e interromper endpoint antes de Auth update, caso o fix apresente regressão; não restaurar chamada service_role de has_role nem validação6caracteres como solução. Recovery429 continua independente e não deve ser revertido. Sem rollback de dados, flags de primeiro acesso ou permissões.

Snapshot funcional de código/testes iniciais: `6d0a155a` (versionamento automático do ambiente; commit manual não executado).