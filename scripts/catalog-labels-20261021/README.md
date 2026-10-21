# Candidata — cadastro canônico de rótulos por família (NÃO INSTALADA)

Preparada em 21/10/2026 enquanto se aguarda a sessão B2B real do C1B. **Nenhum DDL/DML hosted foi executado, nenhum runtime foi substituído e nada foi publicado.** `frontend/src/` contém os arquivos propostos; `frontend.patch` é o diff contra o runtime vigente para revisão/promoção posterior.

## Inventário: existente versus lacuna

| Fonte | Hoje | Lacuna |
|---|---|---|
| `produtos_classe_catalogo_coerente_check` (CHECK literal) | lista fixa de 7 rótulos; `fertilizante_adubo` sem rótulos | CHECK imutável não aceita cadastro novo |
| `platform_private.set_global_product_family_core` | valida rótulo contra lista literal no corpo | mesma lista duplicada no servidor |
| `src/lib/catalogo/platformCatalogFamily.ts` | `FAMILY_CLASSES`/`CLASS_LABEL` fixos | frontend não reflete cadastro autorizado |
| `src/lib/catalogo/platformCatalogRead.ts` | zod enum fixo de `classe_catalogo` + refine de coerência | leitor rejeitaria rótulo novo legítimo |
| `PlatformCatalogFamilyDialog` | `<select>` alimentado por `FAMILY_CLASSES` | sem fonte canônica dinâmica |
| Gestão da plataforma → Catálogo | abas de família e diálogo de classificar | inexistia cadastro/edição/inativação de rótulos |

## Decisões da candidata

- **Fonte canônica única:** tabela `public.catalog_family_labels` (família, chave imutável, nome de exibição, ativo, auditoria de criação). Nenhuma classificação paralela; nunca inferir por nome/tipo/composição.
- **Semente mínima:** somente os 7 rótulos atuais (4 biológicos, 3 químicos). Nenhuma taxonomia agronômica inventada; `fertilizante_adubo` começa sem rótulos e passa a admitir cadastro autorizado.
- **Escrita restrita:** RPCs `platform_create_catalog_label`, `platform_update_catalog_label` (somente nome de exibição; chave imutável) e `platform_set_catalog_label_active`, todas DEFINER com `search_path` fixo, gate `catalog_metadata_require_actor()` (Platform Superadmin), motivo 10–500, CAS em `updated_at`, idempotência por `catalog_entity_replay` e auditoria imutável em `catalog_platform_admin_audit` (operações novas adicionadas à whitelist). Leitura via `platform_list_catalog_labels`, mesmo gate. Acesso direto à tabela negado (RLS sem policies; grants só `service_role`).
- **Histórico preservado:** inativar rótulo não toca atribuições existentes; novas atribuições exigem rótulo **ativo** da família correta. Trigger `produtos_catalog_family_label_validate` substitui o CHECK literal e valida apenas atribuição nova/alterada.
- **Classificação de produto:** `set_global_product_family_core` recriado com a **mesma assinatura/OID**, trocando apenas a lista literal pela consulta à tabela canônica. Demais regras (CAS, idempotência, auditoria, imutabilidade de preços/composição) intactas.
- **Frontend:** diálogo de classificar passa a ler rótulos da RPC canônica (loading desabilita, erro falha fechado, rótulo atual inativo é exibido mas não oferecido); novo painel `PlatformCatalogLabelsPanel` na Gestão → Catálogo; zod do leitor aceita rótulo novo (coerência é servidor); `FAMILY_CLASSES`/`CLASS_LABEL` viram apenas fallback de exibição dos rótulos semeados.

## Arquivos

- `preflight.sql` — somente leitura: assinaturas/corpos/ACL, constraints de `produtos`, whitelist de auditoria, censo de rótulos em uso, ausência da tabela. Operador aprovado confirma o ref `swzpzcwiasxmjutrmvkm`; variável de ambiente não prova destino.
- `candidate.sql.review` — migration transacional com guardas de drift, lock timeout, semente mínima, trigger, recriação do core e RPCs de gestão. **Revisar e aplicar só com autorização independente.**
- `postflight.sql` — leitura de verificação pós-aplicação (tabela, semente=7, trigger, CHECK removido, ACLs, whitelist).
- `STRUCTURAL-ROLLBACK.md` — reversão estrutural somente documentada (restaurar CHECK literal reabriria lista fixa; nunca automática). Reversão frontend segura: `frontend-safe-reversal.patch` mantém validação no servidor.
- `test_sql.py` — PostgreSQL descartável local, helpers de autorização sintéticos. **Não é JWT/RLS LIVE.**
- `frontend/` — arquivos runtime propostos + testes vitest.

## Validação reproduzível

```sh
python3 scripts/catalog-labels-20261021/test_sql.py
bun run test -- --config scripts/catalog-labels-20261021/vitest.config.ts
bunx --package @typescript/native-preview tsgo -p scripts/catalog-labels-20261021/tsconfig.json --noEmit
```

## Limites declarados

- Sem prova hosted: migration não aplicada, REST/RLS real não exercitado, promoção de runtime bloqueada até revisão independente.
- Leitores B2B/técnicos continuam exibindo rótulos pelo mapa de exibição existente; rótulos novos aparecem pela chave até promoção do frontend.
- Pendências antigas adiadas seguem abertas (SU-518022/CDN, origin-deny, monitorB, XML/OS/CQ/termos, sync imediato). C1B aguarda sessão B2B real; contratos funcionais cumulativos são fase posterior, não implementados aqui.
