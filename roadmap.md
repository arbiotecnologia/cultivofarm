# Roadmap

## Em andamento
- [ ] Gate D51.2 — **NO-GO para envio real**: caminho SMTP corrigido no D51.2-A, porém segue fail-closed porque não há SMTP/sender configurado nem sessão superadmin controlada. Aguardar configuração segura e novo comando. Sem publicação ou D52.

## Próximo / autorizado a preparar execução
- [ ] Gate D51.2 — E2E controlado conforme `docs/plano-d51-2-e2e-controlado.md`; e-mail controlado autorizado: `teste@refilinformatica.com.br`; Leaked Password Protection adiada como risco aceito; execução E2E ainda aguarda comando explícito. Não enviar e-mail, criar usuário, processar pedido, publicar ou avançar D52 antes desse comando.

## Concluído
- [x] Gate D51.2-A — P1 de código corrigido reutilizando o SMTP do módulo Comunicação; estado auditável, lease/fencing, cooldown, retomada e resposta sem action link. Testes mockados, typecheck, suíte global e Deno verdes; nenhum e-mail/usuário/tenant criado. Envio real permanece bloqueado por configuração externa.
- [x] Gate D51.1 — certificação técnica verde, P0 de origem Auth corrigido e sete no-ops reconciliados 1:1 como dívida histórica aceita; apto condicionalmente ao Gate E2E controlado sob exceção formal de Leaked Password Protection, que permanece não resolvida.
- [x] Onboarding — consulta de CNPJ (Etapa 1 “Identificar empresa”): Edge Function `onboarding-cnpj-lookup` implantada, etapas reordenadas (1 Identificar empresa, 2 Dados da empresa, 3 Endereço e contatos, 4 Responsável, 5 Preferências, 6 Plano, 7 Revisão), campos oficiais protegidos, conflitos com escolha, fallback manual marcado como não verificado, retomada de rascunho na primeira pendência. Typecheck OK, 104 testes SaaS OK, 11 testes Deno OK, build OK, 401 sem JWT confirmado.

## Exceções/Riscos aceitos
- [ ] **Leaked Password Protection — ADIADO / RISCO ACEITO TEMPORARIAMENTE:** continua desativada, não resolvida e não homologada como controle de senha. Responsável pela decisão: responsável do projeto Cultivo Farm. Manter visível até habilitação futura e reavaliar antes de produção comercial ou ampliação de usuários.

## Pendências (aguardam usuário/autorização)
- [ ] D51.2: configurar e validar o SMTP existente com sender de domínio autorizado, manter test mode/allowlist apenas para `teste@refilinformatica.com.br`, habilitar flags somente na janela controlada e disponibilizar sessão superadmin na prévia.
- [ ] D51.2/E15: aprovar adaptação sem segunda identidade ou fornecer segundo endereço controlado; nunca inventar destinatário.
- [ ] Futuramente habilitar `Leaked password protection` no Dashboard canônico e reexecutar o linter; não marcar como resolvida antes da confirmação.
- [ ] Teste funcional na prévia com CNPJ público 19.131.243/0001-97 — exige sessão autenticada do administrador em onboarding (não salvar no rascunho real nem concluir).
- [ ] Homologação autenticada do primeiro acesso (troca de senha) — aguarda usuário de teste.
