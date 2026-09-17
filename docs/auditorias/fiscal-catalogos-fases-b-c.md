# Central de Configuração Fiscal — Fases B e C (catálogos oficiais + combobox)

Projeto: `swzpzcwiasxmjutrmvkm` (único autorizado). Nada publicado, nenhuma
emissão habilitada, nenhum dado histórico recalculado.

## Fase B — catálogos de referência (banco)

Script: `restoration/fiscal-catalogos/20261033000000_h11a_fiscal_reference_catalogs_v1.sql`
(aplicado e registrado em `supabase_migrations.schema_migrations`, versão `20261033000000`).

Tabelas criadas:

- `fiscal_reference_catalogs` — tipo, fonte, referência, versão, publicação,
  vigência, checksum, status `DRAFT`/`ACTIVE`/`SUPERSEDED`, metadados, quem importou.
  Únicos: (tipo, versão) e no máximo **um ACTIVE por tipo**.
- `fiscal_reference_entries` — código, descrição, código pai, texto de busca
  normalizado (trigger), vigência, ativo, metadados. Único (catálogo, código).
  Índices por código, pai, vigência e busca por prefixo.

Tipos aceitos: NCM, CFOP, CNAE, MUNICIPIO_IBGE, NFSE_SERVICO_NACIONAL,
CCLASSTRIB, CCREDPRES, CBS_RATE, FCP_UF, RTC_NORMA.

Segurança:

- RLS habilitada; leitura apenas por `fn_fiscal_can_read_internal()`
  (administrador, gestor, financeiro). `anon` sem qualquer acesso.
- **Nenhuma política de escrita**: gravação só por RPC `SECURITY DEFINER`
  com `search_path` fixo, validação de `auth.uid()` + perfil administrador,
  EXECUTE revogado de `PUBLIC`/`anon`/`authenticated`.

RPCs:

| RPC | Modo | Quem executa |
| --- | --- | --- |
| `rpc_fiscal_catalog_search_v1` | SECURITY INVOKER (respeita RLS) | authenticated |
| `rpc_fiscal_catalog_resolve_v1` | SECURITY INVOKER | authenticated |
| `rpc_fiscal_catalog_import_v1` | SECURITY DEFINER | service_role (admin autenticado) |
| `rpc_fiscal_catalog_publish_v1` | SECURITY DEFINER | service_role (admin autenticado) |

Auditoria: vocabulário de `fiscal_audit_log` ampliado com `CATALOG_IMPORTED`,
`CATALOG_PUBLISHED`, `CATALOG_SUPERSEDED` e `CFOP_CHANGE` (este último reservado
para a Fase G). Publicar um catálogo supersede automaticamente o anterior do
mesmo tipo, com registro na trilha.

Evidência funcional (transação revertida, `BEGIN … ROLLBACK`):
importação de 3 CFOPs → status `DRAFT`, busca retorna **0 linhas** (rascunho
não é fonte); após publicar → `ACTIVE`, busca retorna o código sugerido em
primeiro lugar, `resolve` devolve descrição e a trilha registra
`CATALOG_IMPORTED` + `CATALOG_PUBLISHED`. Estado final do banco: 0 catálogos
(rollback confirmado).

## Fase C — `FiscalCatalogCombobox`

- `src/hooks/useFiscalCatalog.ts` — busca e resolução via RPC, cache,
  `retry:false`, mensagens traduzidas sem expor SQL nem nome de tabela.
- `src/components/fiscal/FiscalCatalogCombobox.tsx` — Popover + Command já
  existentes (nenhuma biblioteca nova), debounce de 250 ms, limite
  server-side (máx. 30), busca por código ou descrição, códigos sugeridos no
  topo com selo "sugerido", estados de carregamento/erro/vazio, acessibilidade
  (`role="combobox"`, `aria-expanded`, `aria-invalid`, `aria-describedby`),
  e preservação de valor legado com aviso "Código gravado fora do catálogo
  vigente. Revise antes de emitir." — nunca sobrescreve sozinho.

Testes: `src/test/fiscal/fiscalCatalogCombobox.test.tsx` (6 casos: ordenação
com sugerido, nenhuma consulta enquanto fechado, seleção, valor legado,
permissão negada sem vazamento técnico, catálogo vazio).

## Validações

- `vitest src/test/fiscal src/test/config`: **1.796 aprovados**, 4 pulados, 0 falhas.
- Typecheck: sem erros. Build: OK.
- Gate de conexão: exclusivamente `swzpzcwiasxmjutrmvkm`.

## Pendências

- Carga oficial dos catálogos (CFOP vigente completo, municípios IBGE, NCM,
  CNAE) ainda não importada — as tabelas estão vazias por decisão de fase.
- Fases D–F (conversão dos campos das abas Empresa/NF-e/NFS-e/Produtos/
  Serviços/Clientes) e G (política de operação + CFOP 5101 apenas como
  sugestão, com resolução server-side) não iniciadas.
- C7 (E2E real) segue bloqueado pela configuração fiscal incompleta; C8
  (deploy `fiscal-xml-engine`) segue sem credencial de implantação.
- Não declarado apto para produção.
