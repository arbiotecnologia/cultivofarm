# D52 — Assinaturas, trial e ciclo interno

## Decisão

- **Segurança e isolamento:** PASS estrutural.
- **Núcleo A+B+C:** PASS estrutural.
- **Ativação comercial:** NO-GO funcional até publicação explícita de versão real.
- **Pagamento externo:** BLOCKED / NO-GO. Não existe gateway homologado e nenhum fluxo, webhook ou confirmação simulada foi criado.

## Estado encontrado

- Cinco assinaturas foram preservadas: três `TRIAL`, uma `ACTIVE` e uma `SUSPENDED`.
- As cinco são legadas, sem versão comercial, preço, ciclo e vigência confiáveis.
- Nenhuma recebeu versão, preço, moeda, ciclo ou vigência comercial por inferência.
- Os três trials tinham `started_at` inequívoco; somente `trial_ends_at` recebeu backfill determinístico de `started_at + 14 dias`.
- O catálogo tinha 54 vínculos de funcionalidades, todos sem limite numérico definido.

## Implementação

- Versões imutáveis de plano guardam nome, preço, moeda, ciclo, limites, funcionalidades e vigência.
- Assinaturas novas guardam snapshots comerciais e iniciam trial imutável de 14 dias.
- Assinaturas legadas permanecem identificadas e fail-closed até regularização comercial explícita.
- Ações de estado são específicas, idempotentes por correlação, serializadas por lock e auditadas; não existe seletor arbitrário de status.
- A expiração diária alcança somente trials versionados com data vencida, usa lock e gera correlação única por alteração.
- Extensão de trial é uma exceção explícita e auditada, limitada a 14 dias por ação; não há renovação silenciosa.
- Entitlements e telas ficaram fora desta execução e foram restaurados ao comportamento anterior.

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

- Estado vivo: zero versões comerciais e zero assinaturas vinculadas; dados legados preservados e três datas finais de trial derivadas somente do início registrado.
- Job `saas-expire-due-trials`: ativo diariamente às 02:15 UTC; trials legados continuam fora da expiração automática por não terem versão comercial.
- Testes focados de estados, trial, autorização e idempotência passaram; typecheck, scanner, linter e compilação automática foram executados nesta retomada.
- A suíte global anterior permanece como referência; esta retomada ficou restrita aos testes focados do núcleo.
- Linter Supabase: 467 achados preexistentes (17 informativos, 450 avisos), nenhum novo achado atribuído às migrations D52.
- Smoke passivo sem sessão: `/auth`, HTTP navegável e zero erro de página; nenhuma mutação ou cobrança foi acionada.

## Rollback e forward-fix

- Rollback seguro imediato: desabilitar o job e revogar as RPCs específicas, preservando tabelas, snapshots e histórico.
- Não remover colunas, versões ou eventos após uso; correções devem ser migrations aditivas.
- Forward-fix: cadastrar versões comerciais reais por Superadmin e regularizar cada assinatura legada explicitamente, sem inferir valores.