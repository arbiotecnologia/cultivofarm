# Roadmap

## Em andamento
- [ ] Gate D51.1 — certificação técnica verde, P0 de origem Auth corrigido e sete no-ops reconciliados 1:1 como dívida histórica aceita; bloqueado somente até habilitar leaked password protection. Sem E2E, e-mail, usuário, pedido, publicação ou D52.

## Próximo
- [ ] Gate D51.2 — E2E controlado conforme `docs/plano-d51-2-e2e-controlado.md`; bloqueado por Leaked Password Protection e aguardando endereço/conta de teste controlado e aprovação explícita. Não executar antes de novo comando.

## Concluído
- [x] Onboarding — consulta de CNPJ (Etapa 1 “Identificar empresa”): Edge Function `onboarding-cnpj-lookup` implantada, etapas reordenadas (1 Identificar empresa, 2 Dados da empresa, 3 Endereço e contatos, 4 Responsável, 5 Preferências, 6 Plano, 7 Revisão), campos oficiais protegidos, conflitos com escolha, fallback manual marcado como não verificado, retomada de rascunho na primeira pendência. Typecheck OK, 104 testes SaaS OK, 11 testes Deno OK, build OK, 401 sem JWT confirmado.

## Pendências (aguardam usuário/autorização)
- [ ] Habilitar `Leaked password protection` no Dashboard canônico e reexecutar o linter.
- [ ] Teste funcional na prévia com CNPJ público 19.131.243/0001-97 — exige sessão autenticada do administrador em onboarding (não salvar no rascunho real nem concluir).
- [ ] Homologação autenticada do primeiro acesso (troca de senha) — aguarda usuário de teste.
- [ ] `Password Protection Disabled` reportado pelo Supabase — decisão do usuário.
