# Promoção runtime 22/10/2026 — consumidores C1B + rótulos v2 (NÃO publicado)

## Estado do banco (evidência do auditor, não do agente nem do proprietário)
- `catalog_family_labels_canonical_20261021` APLICADA em produção `swzpzcwiasxmjutrmvkm` pelo auditor.
- Correção independente ESSENCIAL do auditor: a whitelist reescrita de `catalog_platform_admin_audit_operation_check`
  removia a operação existente `set_global_product_composition`. Versão aplicada preserva essa operação e acrescenta
  guard de md5 `a62259c75c05f0f0c6be34a387b483e9` do CHECK de auditoria antes do DROP/ADD. `candidate.sql.review`
  foi atualizado para refletir exatamente isso, como registro de auditoria — **não reaplicar**.
- C1B (`catalog_c1b_scoped_families_20261021`) e C1B-SCOPE v2 instalados antes; REST real teste4 antigo/v2 200/35,
  técnico 200 `[]` (sem fichas aprovadas), cross-parceiro 403, admin B→A 403 (auditor).

## Testes do pacote SQL (PostgreSQL local descartável, sintético; não é JWT/RLS LIVE)
`python3 scripts/catalog-labels-20261021/test_sql.py` → 47/47. Novos: baseline sintético do CHECK de auditoria = md5
LIVE `a62259c7…`; guard aborta com CHECK divergente; whitelist preserva `set_global_product_composition`, operações
antigas e novas; rejeita operação desconhecida. `postflight.sql` item 9 confere a operação de composição.

## Promoção do frontend
- Drift: `frontend.patch` de ambos os pacotes aplicou sem conflito sobre o runtime (`patch --dry-run` limpo).
- O patch C1B tinha arquivos sem newline final que colavam o cabeçalho do próximo diff; os 4 arquivos afetados foram
  substituídos pelos finais revisados em `scripts/catalog-c1b-20261021/frontend/src`, só trocando imports relativos
  por `@/` (conteúdo idêntico). Nenhuma alteração existente do runtime foi descartada.
- Painel `PlatformCatalogLabelsPanel` montado em Gestão → Catálogo como botão “Rótulos por família” nos cadastros de apoio
  (mesmo escopo/gate do leitor; sem rota nova).
- Correção adicional: troca de identidade agora descarta também os caches `catalog-labels-read`/`platform-catalog-labels`
  do escopo anterior (antes só o leitor do catálogo).
- Testes antigos atualizados ao contrato novo sem afrouxar: rótulos vêm da RPC canônica (fail-closed sem lista, inativo
  não atribuível); coerência família↔rótulo é do servidor; FichasTecnicas usa a RPC técnica e não consulta tabelas;
  mocks B2B passam `catalog_contract: C1B_DUAL_TENANT_V1` (contrato ausente falha fechado).

## Validação
Vitest focado catálogo/saas/B2B 1613 + sessão B2B 29/29 PASS; `tsc -p tsconfig.app.json` OK; `vite build` OK.
Suite completa: 12 arquivos falham (fiscal XSD/Xerces, Blob autenticado, visita/PDF, financeiro edge, notificações);
nenhum importa módulo alterado nesta promoção — registrado, não corrigido aqui.

## Rollback frontend seguro
`frontend-safe-reversal.patch` (rótulos) e `../catalog-c1b-20261021/frontend-safe-reversal.patch` (C1B) revertem só a UI.
Filtros de visibilidade, família, ficha aprovada e validação de rótulo continuam no banco (RPCs/trigger); a reversão
nunca reabre lista literal, visibilidade antiga nem consulta direta. Rollback estrutural segue apenas documental.

## Pendente (não marcar completo)
Publicação pelo auditor; conteúdo técnico não vazio (sem ficha aprovada real; nenhuma inventada); UI real por perfil
e matriz de perfis; SU-518022/CDN, origin-deny técnico/anexos, monitor B, XML/OS/CQ/termos, sync imediato.
Próxima fase: contratos de múltiplos perfis — não implementada aqui.

## Revisão adicional independente (22/10 00:22) — corrigida no runtime promovido
1. **Nome cruzado entre famílias:** o mapa de exibição usava só `rotulo`; a unicidade canônica é `(familia, rotulo)`.
   Agora `labelNameKey(familia, rotulo)` e `labelDisplayName(names, familia, rotulo, fallback)`; leitor do catálogo passa
   a família do produto. Teste de colisão: mesma chave em químico e fertilizante exibe nomes próprios e não vaza para biológico.
2. **Leitor stale após mutação:** `PlatformCatalogLabelsPanel.refresh` agora invalida `platform-catalog-labels` E
   `catalog-labels-read` do mesmo escopo/família, só após confirmação. Teste integrado painel→leitor
   (`src/test/catalogo/catalogLabelsPanelFlow.test.tsx`) renomeia pela UI e prova o leitor atualizado, sem invalidação manual.
3. **Conflito CAS:** mensagem não manda mais "Recarregue"; o painel exibe "Atualizar dados", que faz refetch controlado
   (mesmas chaves, fence de época, bloqueado durante operação) sem recarregar a página. Testado.
Os arquivos `frontend/src` do pacote ficam como registro da revisão 784cc6d; o runtime contém estas correções adicionais.
Validação: 948/948 focados (catálogo, plataforma, sessão B2B), tsc e build OK. Sem migração, SQL ou publicação.
