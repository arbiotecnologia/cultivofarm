# Complemento 17:06 — C2 + financeiro INATIVO

## 1. Histórico INVOKER
`public.get_partner_user_lifecycle(uuid,uuid,integer,timestamptz,uuid)` é agora SQL SECURITY INVOKER com `search_path=''`, delegando ao corpo idêntico autorizado em `platform_private.get_partner_user_lifecycle(uuid,uuid,integer,timestamptz,uuid)` SECURITY DEFINER. Wrapper de dois argumentos permanece INVOKER. EXECUTE apenas authenticated; PUBLIC/anon/service_role negados em ambos. Core revalida ator/tenant/target, inclusive chamada direta; não confia no wrapper como autorização.

CAS, whitelist, limite 1–50, cursor `(at,id)` e histórico preservados. PRE assertivo exige ausência das três assinaturas; POST/in-transaction exige configuração e ACL. Rollback integral fecha wrappers/core sem apagar logs. Fonte lifecycle, montagem coordenada, SQL integral e réplica executável atualizados; `replica.sql` base hosted fica byte-idêntica porque o novo core é instalado pelo candidato, não inventado no snapshot LIVE.

## 2. Mensagem financeira
Só a cópia financeira multiperfil usada pelo manifesto integral foi alterada. Quando o menu contém rota financeira autorizada por capability+entitlement, o aviso não diz que financeiro está indisponível. Demais negativas e contenções continuam. Cadastro cumulativo, permissões, runtime, preços, arquivos e Outlet intactos.

## 3. Compatibilidade c0441e86 sem reload
Leitores `useMyPartner`, `useAvailableContexts` e `b2bContextProbe` foram extraídos via git show, byte-idênticos, para `frontend/published-c0441e86/`. `publishedCompatibility.test.tsx` monta hooks antigos com Auth/transporte sintéticos e respostas reais capturadas de instalação integral na réplica descartável (somente fixtures sintéticas).
- Gestor/técnico singleton: contexto/projeção mantêm `role`, `papel`, tenant/owner/mode/ID e catálogo; probe antigo aceita. Finanças novas não se abrem na aba antiga.
- Administrador singleton: contexto `admin` preservado, nunca passa pelo decoder externo.
- Produtor singleton: leitor antigo filtra `producer`, porém mantém seu fallback canônico `/app` após resposta bem-sucedida/sem contextos e monitor pronto. **Teste concreto passou**, sem inventar alias `admin/technical/b2b`. Seleção/preferência de novo contexto produtor não está disponível na aba antiga.
- SQL integral mantém overload escalar `p_role`; teste de claim legado→Auth sintética→finish novo passou para gestor e produtor, conjunto exato de um papel. Edge antiga continua recusando técnico/cumulativo como antes; não é regressão.
- **Limite NO-GO de convivência:** atribuir segundo papel a sessão antiga não torna `useMyPartner` antigo cumulativo (`roles.length===1`). Não há garantia de expansão multiperfil transparente nem do novo seletor em abas antigas. Não retirar contratos escalares na publicação: aba antiga persiste após deploy. Não recarregamos/trocamos sessões e não enfraquecemos guard. Homologação real de requisição pendente/schema cache/Edge/primeiro acesso/revogação continua aberta.

## Arquivos e reconciliação 10/85 → 13/113
Não são três arquivos em coordinated/frontend; são:
1. `scripts/contracts-c2-20261022/coordinated/frontend/multiProfileContract.test.ts` — 11.
2. `scripts/contracts-c2-20261022/coordinated/frontend/selector.integration.test.tsx` — 3.
3. `scripts/contracts-c2-20261022/frontend/coordinatedContracts.test.ts` — 14.
Somam 28 casos: 85+28=113 e 10+3=13. A configuração seletor isolada exclui AuthProvider candidato dos aliases; usar `integral/frontend/vitest.config.ts` para cadeia integral, não somar execução isolada como certificação. Agora somam 15 arquivos/134 (15 casos cadastro +6 compatibilidade adicionados).

## Provas desta rodada
- PostgreSQL integral **67/67**, histórico isolado **40/40**, fidelity197 funções/16 relações; Auth sintética, não JWT/RLS hosted.
- Vitest integral **134/134**, 15 arquivos; tipos20cópias PASS; Edge **13/13**.
- SQL install/rollback/hash atualizados em SHA256SUMS; fonte única para frontend é manifesto20+`frontend/integral-review.patch`, não patch financeiro legado desatualizado.
- Primeiro teste antigo negou fixture com `codigo=NULL`: corrigida apenas fixture sintética para código explícito, validação antiga intacta. Primeiro claim legado rejeitou iat futuro do harness: Auth sintética passou a usar timestamp atual; servidor intacto.
- Proprietário relatou tipagem18cópias PASS e preflight hosted READ ONLY PASS/gate intacto; adminB publicado e B2BA preview disponíveis. São relatos recebidos, não execução/homologação hosted deste agente. Novo core exige revisão do PRE/POST atualizado, sem repetir aplicação.
- Sem hosted SQL, Edge deploy, promoção src, alteração de roles/sessões reais ou publicação.