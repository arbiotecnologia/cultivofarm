# Candidata v2 — cadastro canônico de rótulos por família (NÃO INSTALADA)

Preparada em 21/10/2026; v2 incorpora a revisão independente da v1 (11/11 testes + tsc já aprovados). **Nenhum DDL/DML hosted foi executado, nenhum runtime foi substituído e nada foi publicado.** `frontend/src/` contém os arquivos propostos; `frontend.patch` é o diff contra o runtime vigente para revisão/promoção posterior.

## Correções da revisão independente (v1 → v2)

1. **Validação sem lock:** o `EXISTS` de rótulo ativo podia coexistir com inativação concorrente. v2 introduz `platform_private.catalog_family_label_check` com `FOR KEY SHARE`, serializando contra o `FOR UPDATE` de `platform_set_catalog_label_active`: a atribuição ou conclui antes da inativação (e vale), ou espera e falha. Prova com **duas transações reais** no harness, nas duas ordens.
2. **Idempotência vs. inativação:** a validação de rótulo ativo ocorria antes do replay, rejeitando retry legítimo após inativação. v2 move a revalidação mutante para **depois** de `catalog_entity_replay`; validações de forma (família, fingerprint) e o gate de ator permanecem antes. Retry com mesma chave/fingerprint retorna o recibo original (`idempotent=true`) mesmo com o rótulo inativado.
3. **Guard de baseline fraco:** v1 checava só presença. v2 exige definição (md5 `8bd3ce69…`), ACL (`{postgres=X/postgres,authenticated=X/postgres}`) e owner (`postgres`) exatos de `set_global_product_family_core`, e o md5 exato (`0ae66545…`) do CHECK removido; qualquer drift aborta a migration.
4. **Exibição dinâmica além do platformCatalogRead:** inventário de consumidores abaixo; nova RPC `catalog_family_labels_read` (qualquer perfil ativo, somente rótulos ATIVOS, sem id/versão/auditoria) para leitores autorizados — sem expor a RPC administrativa nem consulta direta à tabela. `PlatformCatalogReadTab` passa a exibir o nome do servidor (fallback: seed, depois chave crua); renomear na Gestão reflete após invalidação do cache.

## Inventário: existente versus lacuna

| Fonte | Hoje | Lacuna |
|---|---|---|
| `produtos_classe_catalogo_coerente_check` (CHECK literal) | lista fixa de 7 rótulos; `fertilizante_adubo` sem rótulos | CHECK imutável não aceita cadastro novo |
| `platform_private.set_global_product_family_core` | valida rótulo contra lista literal no corpo | mesma lista duplicada no servidor |
| `src/lib/catalogo/platformCatalogFamily.ts` | `FAMILY_CLASSES`/`CLASS_LABEL` fixos | frontend não reflete cadastro autorizado |
| `src/lib/catalogo/platformCatalogRead.ts` | zod enum fixo de `classe_catalogo` + refine de coerência | leitor rejeitaria rótulo novo legítimo |
| `PlatformCatalogFamilyDialog` | `<select>` alimentado por `FAMILY_CLASSES` | sem fonte canônica dinâmica |
| `PlatformCatalogReadTab` | exibe `CLASS_LABEL` fixo | nome de exibição editado não refletia |
| `MobileCatalogoTecnico` / `useCatalogoUnificado` / `ProdutosTab` | carregam `classe_catalogo`, **não exibem** rótulo amigável hoje | quando exibirem, devem usar `catalog_family_labels_read` (disponível nesta candidata) |
| Gestão da plataforma → Catálogo | abas de família e diálogo de classificar | inexistia cadastro/edição/inativação de rótulos |

## Decisões da candidata

- **Fonte canônica única:** tabela `public.catalog_family_labels` (família, chave imutável, nome de exibição, ativo, auditoria de criação). Nenhuma classificação paralela; nunca inferir por nome/tipo/composição.
- **Semente mínima:** somente os 7 rótulos atuais (4 biológicos, 3 químicos). Nenhuma taxonomia agronômica inventada; `fertilizante_adubo` começa sem rótulos e passa a admitir cadastro autorizado.
- **Escrita restrita:** RPCs `platform_create_catalog_label`, `platform_update_catalog_label` (somente nome de exibição; chave imutável) e `platform_set_catalog_label_active`, todas DEFINER com `search_path` fixo, gate `catalog_metadata_require_actor()` (Platform Superadmin), motivo 10–500, CAS em `updated_at`, idempotência por `catalog_entity_replay` e auditoria imutável em `catalog_platform_admin_audit` (operações novas adicionadas à whitelist). Leitura de gestão via `platform_list_catalog_labels`, mesmo gate. Acesso direto à tabela negado (RLS sem policies; grants só `service_role`).
- **Leitura de exibição:** `catalog_family_labels_read` (DEFINER, `search_path` fixo) para qualquer usuário autenticado com perfil ativo; retorna somente rótulos ativos (família, chave, nome de exibição). Não expõe a RPC administrativa nem dados internos a B2B.
- **Histórico preservado:** inativar rótulo não toca atribuições existentes; novas atribuições exigem rótulo **ativo** da família correta. Trigger `produtos_catalog_family_label_validate` substitui o CHECK literal e valida apenas atribuição nova/alterada, com lock consistente.
- **Classificação de produto:** `set_global_product_family_core` recriado com a **mesma assinatura/OID/ACL/owner**, trocando a lista literal pela fonte canônica e movendo a revalidação mutante para depois do replay. Demais regras (CAS, auditoria, imutabilidade de preços/composição) intactas.
- **Frontend:** diálogo de classificar lê rótulos da RPC canônica (loading desabilita, erro falha fechado, rótulo atual inativo exibido mas não oferecido); painel `PlatformCatalogLabelsPanel` na Gestão → Catálogo; zod do leitor aceita rótulo novo (coerência é servidor); `PlatformCatalogReadTab` exibe nome do servidor via `catalogLabelDisplay`; `FAMILY_CLASSES`/`CLASS_LABEL` viram apenas fallback de exibição dos rótulos semeados.

## Arquivos

- `preflight.sql` — somente leitura: assinaturas/corpos/ACL/owner, md5 exato do CHECK, whitelist de auditoria, censo de rótulos em uso, ausência da tabela. Operador aprovado confirma o ref `swzpzcwiasxmjutrmvkm`; variável de ambiente não prova destino.
- `candidate.sql.review` — migration transacional com guardas de drift (md5/ACL/owner), lock/statement timeout, semente mínima, helper com lock, trigger, recriação do core e RPCs. **Revisar e aplicar só com autorização independente.**
- `postflight.sql` — leitura de verificação pós-aplicação (tabela, semente=7, trigger, CHECK removido, ACLs/owner preservados, RPCs, whitelist).
- `STRUCTURAL-ROLLBACK.md` — reversão estrutural somente documentada (restaurar CHECK literal reabriria lista fixa; nunca automática). Reversão frontend segura: `frontend-safe-reversal.patch` mantém validação no servidor.
- `test_sql.py` — PostgreSQL descartável local, helpers de autorização sintéticos, **duas transações reais** para concorrência. **Não é JWT/RLS LIVE.**
- `frontend/` — arquivos runtime propostos + testes vitest.

## Validação reproduzível

```sh
python3 scripts/catalog-labels-20261021/test_sql.py          # 42/42
npx vitest run --config scripts/catalog-labels-20261021/vitest.config.ts   # 16/16
npx tsc -p scripts/catalog-labels-20261021/tsconfig.json --noEmit          # OK
```

## Limites declarados

- Sem prova hosted: migration não aplicada, REST/RLS real não exercitado, promoção de runtime bloqueada até revisão independente.
- Leitores B2B/técnicos que hoje não exibem rótulo amigável seguem inalterados; a RPC de exibição fica disponível sem consulta indevida.
- Pendências antigas adiadas seguem abertas (SU-518022/CDN, origin-deny, monitorB, XML/OS/CQ/termos, sync imediato). C1B-SCOPE v2 foi aplicada pelo auditor (ver pacote `catalog-c1b-partner-scope-20261021`); contratos funcionais cumulativos são fase posterior, não implementados aqui.
