# C2-CAT — promoção local restrita, 22/10/2026 01:22 UTC

## Escopo autorizado e efetivamente promovido
- `src/hooks/useMyPartner.ts`
- `src/pages/portal-parceiro/PortalParceiroLayout.tsx`
- `src/lib/catalogo/catalogAccess.ts`
- `src/components/catalogo/OwnerCatalog.tsx`

Hashes dos dois arquivos-base conferidos com `drift.json` antes de qualquer escrita; os dois destinos novos estavam ausentes. Quatro arquivos promovidos byte-exatos dos candidatos, dependências antes dos consumidores; nenhum conflito/drift descartado. Nenhum outro arquivo runtime alterado. A matriz foi repetida com resolução apontando para os quatro arquivos ativos, não apenas cópias candidatas.

## Validação local
- Candidata: **30/30 Vitest PASS**.
- Mesma matriz contra runtime promovido: **30/30 PASS** (layout real, fonte/grid simulados, chamadas canônicas simuladas).
- Regressões C1B/fichas/myPartner/entitlements/multiportal: **55/55 PASS**.
- `tsgo --noEmit -p scripts/contracts-c2-cat-20261022/tsconfig.json`: **PASS sem override**, com configuração corrigida pelo auditor incorporada.
- Runtime completo: **tsgo PASS** com configuração temporária equivalente a tsconfig.app acrescida dos tipos jest-dom/vite necessários aos testes, caminhos absolutos para resolução desde `/tmp`; nenhum tsconfig global alterado.
- Build automático: **build OK**, log22/10 01:22:56Z.

Falhas iniciais da configuração temporária em `/tmp` (resolução de vitest e tipos) foram corrigidas e a mesma matriz/types repetidos com PASS. Não são falhas de runtime. Typecheck original da candidata **falhou**, conforme auditor; PASS refere-se à configuração corrigida, nunca ao original.

## Evidência real externa — executada pelo auditor
Revisão `9743dd58`:30/30Vitest, preflight LIVE seis hashes/ACL/owner. Migration `b2b_owner_catalog_capabilities_20261022` aplicada pelo auditor em `swzpzcwiasxmjutrmvkm`, sem DML. Sessão teste4 `beb25695…`: projeção canônica HTTP200 `commercial_owner`, contrato `C2_CAT_V1`, catálogo e fichas true. Nenhum token copiado, nenhuma recarga/sessão alterada pelo agente.

**Ainda não homologação UI**: monitor “verificando acesso”, catálogo/fichas no navegador real, revogação e conteúdo técnico aprovado não vazio continuam pendentes. Não alterar monitor/lease/roles para contornar essa pendência. Fluxos autenticados não exercidos pelo agente nesta promoção; matriz local usa transporte simulado.

## Segurança e reversão
Somente catálogo e fichas exatos com capacidade canônica + entitlement; `commercialOwner` mantido. Sem NovoPedido/carrinho/simulação/pagamentos/templates/arquivos/escrita; pedidos próprios existentes somente dashboard. Financeiro/preços/composição/RLS/scope/monitor não alterados. C2.1 writers continuam **INATIVOS**.

Rollback frontend limitado aos quatro arquivos desta promoção, preservando todas as alterações posteriores via revisão de drift; retira capacidades da UI, não reabre canais. Filtros C1B/rótulos e banco permanecem instalados. SQL de rollback é pacote revisável, não execução autorizada. Nenhuma reaplicação SQL, Edge ou publicação realizada; publicação cabe ao auditor.