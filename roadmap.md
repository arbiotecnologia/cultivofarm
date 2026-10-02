# Roadmap

## Em andamento
- [ ] Gate D51.2 — configuração SMTP agora verde: test mode ON, allowlist exclusiva controlada, global/e-mail ON, WhatsApp/in-app/webhook OFF, SMTP completo, zero lease e zero conflito D51.2. Sessão real do Superadmin ainda indisponível às ferramentas (HTTP 401). Cobertura segura sem sessão concluída: 50 testes focados, suíte global com 5.307 testes aprovados e chamadas negativas fail-closed. E01–E21 seguem NOT RUN/PARCIAL, sem PASS E2E; NO-GO para encerrar D51 ou avançar D52.

## Próximo / autorizado a preparar execução
- [ ] Gate D51.2 — E2E controlado conforme `docs/plano-d51-2-e2e-controlado.md`; e-mail controlado autorizado: `teste@refilinformatica.com.br`; Leaked Password Protection adiada como risco aceito; execução E2E ainda aguarda comando explícito. Não enviar e-mail, criar usuário, processar pedido, publicar ou avançar D52 antes desse comando.

## Concluído
- [x] Gate D51.2-F — P1 de isolamento SaaS corrigido: provider settings e teste SMTP globais agora exigem `is_platform_superadmin` no servidor; UI tenant removida e o mesmo componente reutilizado em `/plataforma`, sem papel operacional. Duas Edge Functions implantadas após preflight fail-closed; chamadas negativas retornaram 401, 63 testes focados e suíte global com 5.307 testes verdes; nenhum envio/configuração/E2E.
- [x] Gate D51.2-E — checklist de prontidão SMTP exibido na tela; teste fixado ao único destinatário autorizado, bloqueado por readiness, test mode, allowlist e flags antes do socket; respostas/logs brutos removidos. Typecheck, 57 testes focados, suíte global (5.300 aprovados) e build verdes; nenhum envio/configuração/E2E.
- [x] Gate D51.2-D — ACL direta de `PUBLIC`/`anon`/`authenticated` revogada, acesso técnico preservado e preflight SMTP booleano implantado sem envio. E15A preparado como teste parcial A→B com uma identidade; caminho autenticado ainda NOT RUN.
- [x] Gate D51.2-C — singleton SMTP restaurado no canônico por migration idempotente; entrega global/e-mail/WhatsApp/in-app/webhook OFF, test mode ON, allowlists vazias e SMTP/segredos ausentes. Ledger e linha única verificados; nenhum envio, Vault, usuário, tenant ou E2E.
- [x] Gate D51.2-B — migration/objetos/grants confirmados no canônico; flags SMTP OFF, configuração ausente e zero lease ativo comprovados; somente `platform-invite-org-admin` implantada; chamadas sem JWT/JWT inválido retornaram 401 sem mutação. Interface e pré-condições manuais documentadas; nenhum envio/configuração/E2E realizado.
- [x] Gate D51.2-A — P1 de código corrigido reutilizando o SMTP do módulo Comunicação; estado auditável, lease/fencing, cooldown, retomada e resposta sem action link. Testes mockados, typecheck, suíte global e Deno verdes; nenhum e-mail/usuário/tenant criado. Envio real permanece bloqueado por configuração externa.
- [x] Gate D51.1 — certificação técnica verde, P0 de origem Auth corrigido e sete no-ops reconciliados 1:1 como dívida histórica aceita; apto condicionalmente ao Gate E2E controlado sob exceção formal de Leaked Password Protection, que permanece não resolvida.
- [x] Onboarding — consulta de CNPJ (Etapa 1 “Identificar empresa”): Edge Function `onboarding-cnpj-lookup` implantada, etapas reordenadas (1 Identificar empresa, 2 Dados da empresa, 3 Endereço e contatos, 4 Responsável, 5 Preferências, 6 Plano, 7 Revisão), campos oficiais protegidos, conflitos com escolha, fallback manual marcado como não verificado, retomada de rascunho na primeira pendência. Typecheck OK, 104 testes SaaS OK, 11 testes Deno OK, build OK, 401 sem JWT confirmado.

## Exceções/Riscos aceitos
- [ ] **Leaked Password Protection — ADIADO / RISCO ACEITO TEMPORARIAMENTE:** continua desativada, não resolvida e não homologada como controle de senha. Responsável pela decisão: responsável do projeto Cultivo Farm. Manter visível até habilitação futura e reavaliar antes de produção comercial ou ampliação de usuários.

## Pendências (aguardam usuário/autorização)
- [ ] D51.2: responsável permanecer autenticado como Superadmin controlado na prévia e iniciar nova retomada. A sessão continuou indisponível nesta tentativa; não compartilhar senha e não substituir sessão por `service_role`. Se persistir, executar E01 em diante por interação manual assistida no navegador.
- [ ] D51.2: decidir se a janela SMTP permanece aberta para retomada imediata; caso contrário, desligar entrega global/e-mail na aba Comunicação de `/plataforma`. Nenhum envio ocorreu nesta tentativa.
- [ ] D51.2/E15A: executar futuramente prova parcial Admin A → Tenant B sem segundo administrador; não declarar E15 completo sem prova B → A/segunda sessão controlada.
- [ ] Futuramente habilitar `Leaked password protection` no Dashboard canônico e reexecutar o linter; não marcar como resolvida antes da confirmação.
- [ ] Teste funcional na prévia com CNPJ público 19.131.243/0001-97 — exige sessão autenticada do administrador em onboarding (não salvar no rascunho real nem concluir).
- [ ] Homologação autenticada do primeiro acesso (troca de senha) — aguarda usuário de teste.
