# Catálogo EXCLUSIVO por empresa — estado ATUAL do candidato (v2.13, 02/11/2026)

> Somente o estado vigente. Histórico (v1–v2.11) em `docs/catalogo-exclusivo-tenant-20261101-historico.md`.
> Decisões resolvidas (não reabrir): catálogo exclusivo por empresa, sem catálogo global e sem bypass de Superadmin;
> cadeia sem empresa DESCARTADA (19 linhas); dados atuais são de teste; Financeiro só associa produto fiscal ↔
> microrganismo na própria empresa, sem CRUD de catálogo. Produção já autorizada pelo proprietário sob condição:
> pacote exato com testes e revisão independente aprovados. **Nada foi aplicado em banco hospedado, publicado,
> emitido, cobrado ou enviado.**

**Veredito desta cópia: NÃO é GO.** PostgreSQL descartável **336 PASS / 1 FAIL**, sem vazamento. O único FAIL é a
agregadora `rpc_fiscal_nfe_readiness_v1`, que depende de `public.fiscal_certificates`, relação ainda não capturada
(§6). Faltam revisão independente, captura fresca no dia e prova JWT/RLS real (§8). Backup deixou de ser condição
(decisão do proprietário, 02/11). Os bytes do pacote SQL não mudaram nesta rodada.

## 0. Rodada v2.13 — captura de segurança v2.12 (`captura-v212-seguranca-20261102/`, SHA-256 `6b8fc306…8b6d`)
- 21 relações, 450 colunas, 200 constraints, 70 policies, 76 gatilhos com corpo/MD5, `fn_fiscal_base_components_valid`
  e `vw_os_integridade_esteira`, integrados por `test/v212_security.py` sem stub.
- As 15 relações já integradas batem 100% (colunas e constraints) com a captura anterior; 7 policies coincidentes
  idênticas; 63 policies novas instaladas verbatim.
- 6 relações novas (`fiscal_invoices`, `fiscal_document_series`, `payable_payments`, `financial_documents`,
  `financial_receipts`, `financial_report_exports`) com tipos/NOT NULL/constraints reais.
- 42 funções de gatilho: 0 falhas, 0 MD5 divergente; 76/76 gatilhos habilitados; ACL das 21 conferida por
  `has_table_privilege` (0 divergências); RLS 21/21 igual à produção. Único item estrutural criado: o esquema vazio
  `finance_private` (namespace da função real `protect_allocated_payable`).
- Fixture ajustada ao esquema real: notas de teste agora têm `company_settings_id` da própria empresa (configuração
  fiscal toda desligada) e `created_by`; nada foi afrouxado.
- Efeitos de guardas provados com tudo habilitado (`test/v212_guard_tests.py`, V212-G1..G7): exclusão de nota recusada
  pelos gatilhos e linha preservada; nota AR Bio com configuração fiscal da FSF recusada; FSF não lê nem altera nota
  AR Bio; `anon`/`authenticated` sem acesso a `bank_accounts`; 12 gatilhos de nota ativos.
- Fechados: `fn_fiscal_scenario_coverage` (agora executa sem vazamento), CHECK `ftr_base_components_chk`, policy
  `financial_audit_source_tenant_scope` e as views de esteira. Evidências: `run-v2.13-seguranca-20261102/`.

## 1. Pacote e ordem
`02-chain-purge-maintenance` → `00-pre-global` → `01-migrate` (gerados por `build.py`; nunca editar à mão).
Na homologação o 02 não roda (variante limpa do pacote de alinhamento).

| Arquivo | SHA-256 |
|---|---|
| 02-chain-purge-maintenance.sql.review | `ded870f8447eb1682df9b5d202bf10a8b0085e96150f5f5cd122a5d4314c6242` |
| 00-pre-global.sql.review | `5117003ddebad2cd6b0198e701fdcd5c8be750728964a0c26b7aa89b57cb9af1` |
| 01-migrate.sql.review | `5e7a66333c2984d94e996632e47afbe9b90e83d2898015ff70201638ee0f7394` |

## 2. O que mudou nesta rodada (v2.12)
1. **Captura v2.11 de dependências integrada sem stub** (`captura-v211-dependencias-20261102/`, SHA-256
   `6eed148a…30cc`, verificada): 14 relações novas com colunas/tipos/defaults/NOT NULL e PK/UNIQUE/CHECK/FK reais
   (`accounts_payable` já existia e foi conferida idêntica), 10 funções verbatim com md5 conferido (0 divergências),
   2 sequências reais (sem estado), view `_src_vw_esteira_laboratorio` tentada (falta a view-fonte, §6).
   Flags de RLS/policies/gatilhos/ACL dessas 14 relações não vieram e NÃO foram inventados.
2. **Achado novo, reproduzido e corrigido: `rpc_microorganism_regulatory_overview` lista microrganismos de TODAS as
   empresas.** Com as dependências reais a agregadora passou a executar e a sonda acusou LEAK para gestor AR Bio e FSF
   (DEF-1 = 4). Correção: delta pinado (md5 LIVE `a5763623…6e5d`, 1 ocorrência exata) filtrando
   `owner_organization_id = h15_actor_organization()`. GREEN: AGG executada sem vazamento, DEF-1 = 0, AE-0 = 14 deltas.
3. Testes positivos de envase/etiqueta deixaram de usar sequências sintéticas; só a linha de configuração do modelo de
   etiqueta é dado de fixture, com colunas NOT NULL e CHECKs reais.
4. O stub de `h15_actor_organization` passou a trocar só o corpo (CREATE OR REPLACE), porque o default real de
   `recurring_financial_templates.organization_id` depende dela.

## 3. PostgreSQL descartável (esquema real) — `run-v2.12-deps-20261102/`
**328 PASS / 2 FAIL.** Tipo: `PG_DISPOSABLE_REAL_SCHEMA_SYNTHETIC_AUTH` (esquema e corpos reais, autenticação
sintética). Não é prova JWT/RLS hospedada.

- 59 tabelas da captura: 158/158 CHECKs, 232/232 policies, 255/255 gatilhos, 151 FKs, 320 índices.
- Relações extras + v2.11: 411/412 constraints e 159/160 policies ativas; gatilhos com dependência ausente: 0
  (os 4 de OS agora usam `private.assert_os_approval_scope` real).
- DEFINER/agregadoras: 0 LEAK. `rpc_microorganism_regulatory_overview` executada e isolada por empresa.
- Sintético declarado: membership/papéis, entitlements, `has_role`, `is_platform_superadmin`,
  `h15_actor_organization`; tabelas ainda vindas de tipos gerados; fixtures por transação com suspensão nominal só dos
  gatilhos da tabela-alvo; a linha de `etiqueta_templates`.

## 4. Telas (regressão)
Ver §9 para os números desta rodada. Testes alterados por causa da regra nova (sem apagar asserts de segurança):
- `productFiscalProfiles.session` reescrito para o gravador canônico, com 14 casos: CAS, motivo, chave,
  ACK divergente incerto, 42501, PT409, troca de ator, trava desligada e ator sem papel;
- `fase3_20.unified_list.ui`: motivo obrigatório, mesma chave após resposta incerta, trava desligada somente leitura e
  Superadmin sem gravador;
- `fiscalProdutos.platformUx`: a aba da plataforma agora mostra "Ver", sem gravador global.

## 5. Consumidores de escrita do catálogo (antes de qualquer revogação)
| Superfície | Estado |
|---|---|
| produtos | `tenant_product_save` (ProdutosTab) |
| microrganismos, culturas, volumes, fichas técnicas | `tenant_catalog_root_save/delete` |
| formulações | `tenant_catalog_formulacoes_replace` |
| ficha fiscal de produto | `tenant_owned_product_fiscal_save`; escrita direta revogada (v2.11) |
| associação produto fiscal↔micro | RPC específica (admin/gestor/financeiro da própria empresa) |
| ficha fiscal de microrganismo | ainda grava direto pelo cliente, sob policies restritivas da própria empresa; não foi revogada (sem RPC própria) |
| cargas fixas `seedCatalogoARBioV13` / `seedMicrorganismosARBio2026` | sem uso pela aplicação; a primeira tem trava. Depois da migração, a escrita direta em raízes é negada |

## 6. Dependências ausentes — lista exata (nada inventado)
1. `public.fiscal_certificates` — colunas reais (`valid_from`/`valid_until` com tipo real, `company_settings_id`,
   `environment`, `status`, `is_active`, `revoked_at`) e segurança. Hoje vem dos tipos gerados (datas como texto), por
   isso `rpc_fiscal_nfe_readiness_v1` para com BLOCKED_DEP. Não foi simulada.
2. Continuam sintéticos e declarados: membership/papéis, entitlements, `has_role`, `is_platform_superadmin`,
   `h15_actor_organization` (prova real só com JWT).

## 7. Pendências que não bloqueiam a revisão, mas bloqueiam o GO de produção
1. A agregadora `rpc_fiscal_nfe_readiness_v1` só será provada quando chegar `fiscal_certificates` (§6).
2. Painéis B2B financeiros: continuam fechados (como hoje em produção). Reabrir exige um contrato próprio por empresa.
3. Ficha fiscal de microrganismo ainda grava direto, sob policy da própria empresa (§5).
4. A trava `OWNED_PRODUCT_FISCAL_ENABLED` continua desligada; nenhuma flag fiscal é ligada automaticamente por
   publicação — ligar é passo separado, após prova própria.
5. Prova JWT/RLS/navegador real (§8).

## 8. Prova real sem tocar produção
Homologação `vrlcdwmlytukrjezrrnf`, depois da aprovação do auditor:
1. restaurar o esquema equivalente à captura;
2. aplicar 02 → 00 → 01;
3. fixtures A/B mínimas: AR Bio, FSF, parceiro FSF na AR Bio, técnico, Financeiro e Superadmin;
4. cenários: CRUD próprio, leitura cruzada negada, Superadmin sem bypass, gravador fiscal com CAS/replay, cercas,
   B2B vendedor×tenant e painéis B2B fechados.
Contenção, automações, cobrança, emissão e comunicação continuam desligadas.

## 9. Regressão de telas desta rodada (Vitest completo, `--maxWorkers=2`)
- Resultado completo: **10.611 PASS / 126 FAIL / 6 skipped**, em 757 arquivos.
- Os 126 FAILs são **anteriores** a esta rodada. Os mesmos 14 arquivos, rodados sobre uma cópia limpa de `HEAD`
  (git archive, sem as mudanças desta rodada), falham com os mesmos números: 106 + 20 = 126. Arquivos:
  - `create-user-edge-handler`
  - `external-user-ab-proposal`
  - `authenticatedBlobUrls` e `authenticatedBlobPaging`
  - `etapasVisita`, `pdfVisitaAuthenticated` e `visitaTecnicaSalvamento`
  - `navigation-inventory` e `superadmin-home-plataforma`
  - `d51-5-p0d` e `d51-5-p1`
  - `fase3-deploy-kit` e `notification-p1-scope`
  - `agronomicOriginPostgres`
- Nenhum deles toca catálogo ou fiscal. Nenhuma falha nova.
- Testes da ficha fiscal (`productFiscalProfiles.session`, `fase3_20`, `fiscalProdutos.platformUx`,
  `ownedProductFiscal`): todos passam.
