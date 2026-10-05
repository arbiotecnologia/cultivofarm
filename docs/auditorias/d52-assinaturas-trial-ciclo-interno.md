# D52 — Assinaturas, trial e ciclo interno

## Decisão

- **Segurança e isolamento:** PASS estrutural.
- **Ciclo interno SaaS:** PASS estrutural / NO-GO funcional para ativação comercial.
- **Pagamento externo:** BLOCKED / NO-GO. Não existe gateway homologado e nenhum fluxo, webhook ou confirmação simulada foi criado.

## Estado encontrado

- Cinco assinaturas foram preservadas: três `TRIAL`, uma `ACTIVE` e uma `SUSPENDED`.
- As cinco são legadas, sem versão comercial, preço, ciclo e vigência confiáveis.
- Nenhuma delas foi preenchida, recalculada ou migrada por inferência.
- O catálogo tinha 54 vínculos de funcionalidades, todos sem limite numérico definido.

## Implementação

- Versões imutáveis de plano guardam nome, preço, moeda, ciclo, limites, funcionalidades e vigência.
- Assinaturas novas guardam snapshots comerciais e iniciam trial imutável de 14 dias.
- Assinaturas legadas permanecem identificadas e fail-closed até regularização comercial explícita.
- Ações de estado são específicas, idempotentes por correlação e auditadas; não existe seletor arbitrário de status.
- A expiração diária alcança somente trials versionados com data vencida; legado sem data é ignorado.
- Entitlements existem apenas para assinatura versionada em `TRIAL` vigente ou `ACTIVE`; `PAST_DUE`, `SUSPENDED`, `CANCELLED` e `EXPIRED` não liberam módulos.
- Limites quantitativos não foram inventados: sem métrica e valor comercial definidos, a criação adicional deve permanecer bloqueada no fluxo correspondente.

## Segurança

- Escritas usam RPCs `platform_*` com validação server-side de Platform Superadmin, RLS e ticket por transação.
- Identificadores enviados pelo navegador selecionam o alvo, mas nunca concedem autorização.
- Histórico é append-only e registra ator, origem, motivo, ação, estados, planos, versão, snapshots e correlação.
- Nenhuma chave, token, preço ou identidade de homologação aparece neste relatório.

## Pagamento

Pagamento externo permanece **BLOCKED / NO-GO**. Ativação automática por pagamento, checkout, cobrança, webhook, conciliação e reativação financeira exigem integração real posteriormente autorizada e homologada. Falhas ambíguas nunca devem marcar uma assinatura como paga.

## Homologação controlada

- A matriz estrutural confirmou que usuários tenant só leem a própria assinatura e não recebem ações de mutação.
- Escritas de assinatura exigem Platform Superadmin, ação permitida, motivo, correlação e ticket transacional.
- IDs de organização ou versão enviados pelo navegador não concedem autorização.
- Não foram criadas organizações, versões, preços ou limites fictícios para produzir um falso PASS funcional.
- A prova positiva de criação, upgrade, downgrade e reativação ficou **BLOCKED**: não existe versão comercial real publicada e as cinco assinaturas vivas são legadas sem snapshots confiáveis.
- A prova A/B D51.6 continua válida para isolamento tenant; não foi reaberta nem reutilizada para declarar sucesso comercial.

## Validações

- Estado vivo: zero versões comerciais e zero assinaturas vinculadas; dados legados preservados.
- Job `saas-expire-due-trials`: ativo diariamente às 02:15 UTC; trials legados sem versão/data não são tocados.
- 15 testes D52 focados passaram; typecheck, scanner de segredos, ESLint dos arquivos alterados e compilação automática passaram.
- Suíte global: 5.472 testes passaram e quatro foram ignorados após correção das fixtures de Storage.
- Linter Supabase: 467 achados preexistentes (17 informativos, 450 avisos), nenhum novo achado atribuído às migrations D52.
- Smoke passivo sem sessão: `/auth`, HTTP navegável e zero erro de página; nenhuma mutação ou cobrança foi acionada.

## Rollback e forward-fix

- Rollback seguro imediato: desabilitar as ações de interface e o job de expiração, preservando tabelas, snapshots e histórico.
- Não remover colunas, versões ou eventos após uso; correções devem ser migrations aditivas.
- Forward-fix: cadastrar versões comerciais reais por Superadmin e regularizar cada assinatura legada explicitamente, sem inferir valores.