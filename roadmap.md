# Roadmap

## Em andamento
- [ ] Gate D51.1 — reconciliar ledger somente pelo mecanismo oficial, corrigir 6 contratos globais e P0/P1 SaaS dos advisors, validar proteção de senhas vazadas e certificar; sem E2E, e-mail, usuário, pedido, publicação ou D52.

## Concluído
- [x] Onboarding — consulta de CNPJ (Etapa 1 “Identificar empresa”): Edge Function `onboarding-cnpj-lookup` implantada, etapas reordenadas (1 Identificar empresa, 2 Dados da empresa, 3 Endereço e contatos, 4 Responsável, 5 Preferências, 6 Plano, 7 Revisão), campos oficiais protegidos, conflitos com escolha, fallback manual marcado como não verificado, retomada de rascunho na primeira pendência. Typecheck OK, 104 testes SaaS OK, 11 testes Deno OK, build OK, 401 sem JWT confirmado.

## Pendências (aguardam usuário/autorização)
- [ ] Teste funcional na prévia com CNPJ público 19.131.243/0001-97 — exige sessão autenticada do administrador em onboarding (não salvar no rascunho real nem concluir).
- [ ] Homologação autenticada do primeiro acesso (troca de senha) — aguarda usuário de teste.
- [ ] `Password Protection Disabled` reportado pelo Supabase — decisão do usuário.
