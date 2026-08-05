# Fase F2 — Cadastro regulatório e fiscal auditável dos microrganismos

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** apenas. Produção `navfzbwgwzruipouyfnk` não tocada, nada publicado.

Migration: `supabase/migrations/20260814000000_fase_f2_regulatorio_microrganismos.sql`
(cópia canônica em `restoration/fase-f2/migration.sql`).
Ledger: 631 versões. Pós-check: **32/32 gates PASS**.

## Princípio

A fase **não classifica nada**. Ela cria a estrutura de evidência e o fluxo de aprovação
que permitem classificar com prova. Nenhum NCM, CEST, CFOP, CST/CSOSN, origem, alíquota,
benefício, GTIN, uCom/uTrib ou fator de conversão é inferido de espécie, nome comercial
ou prática de mercado. Ausência de evidência vira **pendência explícita**, nunca liberação.

## Estruturas criadas

| Relação | Papel |
|---|---|
| `fiscal_official_sources` | Referências normativas citáveis (TIPI, MAPA/SIPEAGRO, CONFAZ/CEST) |
| `microorganism_regulatory_dossiers` | Dossiê versionado por microrganismo, com tripla revisão |
| `microorganism_regulatory_presentations` | Apresentações; uCom/uTrib/fator e GTIN exigem confirmação |
| `microorganism_ncm_candidates` | Candidatos de NCM/CEST com justificativa e fonte obrigatórias |
| `microorganism_regulatory_documents` | Rótulo, laudo, ato de registro; hash SHA-256 e bucket privado |
| `microorganism_regulatory_checklist` | 12 chaves obrigatórias, com `NOT_APPLICABLE` sempre justificado |
| `microorganism_regulatory_publication_snapshots` | Snapshot imutável e hash a cada publicação |

Bucket privado `fiscal-regulatorio` (não público, sem acesso anônimo).

## Checklist obrigatório (12 chaves)

`FINALIDADE_REGULATORIA`, `CEPA`, `FORMULACAO`, `GARANTIA_ROTULO`, `REGISTRO_MAPA`,
`TITULAR_FABRICANTE`, `NCM_CEST_TIPI`, `GTIN`, `UNIDADE_CONVERSAO`, `ORIGEM`,
`CFOP`, `TRIBUTACAO`.

Cada chave tem três estados: `PENDING`, `CONFIRMED`, `NOT_APPLICABLE`. O estado
`NOT_APPLICABLE` é bloqueado por constraint quando não há justificativa.

## Fluxo de aprovação

`DRAFT → PENDING_REVIEW → VALIDATED` (ou `BLOCKED`).

Publicação exige as três aprovações independentes: **técnica** (`tecnico_agronomo`),
**regulatória** (responsável técnico) e **fiscal/contábil** (`financeiro`). Dossiê
publicado é imutável (trigger `trg_regulatory_published_lock`); correção exige nova versão.

## Motor de prontidão

`fn_fiscal_item_profile_gate_eval` continua sendo o **único** motor (assinatura única,
agora com o argumento `p_regulatory jsonb`). O placeholder
`REGULATORY_EVIDENCE_NOT_IMPLEMENTED` da Fase F1 foi eliminado e substituído por
pendências acionáveis, rotuladas por camada (`TECHNICAL` / `REGULATORY`):

`REGULATORY_DOSSIER_MISSING`, `REGULATORY_DOSSIER_NOT_PUBLISHED`, `REGULATORY_DOSSIER_BLOCKED`,
`REGULATORY_CATEGORY_MISSING`, `REGULATORY_STRAIN_MISSING`, `REGULATORY_FORMULATION_MISSING`,
`REGULATORY_LABEL_GUARANTEE_MISSING`, `REGULATORY_MAPA_REGISTRATION_MISSING`,
`REGULATORY_MAPA_REGISTRATION_INVALID`, `REGULATORY_HOLDER_MISSING`,
`REGULATORY_LABEL_DOCUMENT_MISSING`, `REGULATORY_REPORT_DOCUMENT_MISSING`,
`REGULATORY_DOCUMENT_EXPIRED`, `REGULATORY_TECHNICAL_APPROVAL_MISSING`,
`REGULATORY_RESPONSIBLE_APPROVAL_MISSING`, `REGULATORY_FISCAL_APPROVAL_MISSING`,
`REGULATORY_CHECKLIST_INCOMPLETE`, `REGULATORY_NCM_NOT_APPROVED`,
`REGULATORY_NCM_DIVERGES_FROM_PROFILE`, `REGULATORY_PRESENTATION_MISSING`,
`REGULATORY_UNITS_NOT_CONFIRMED`, `REGULATORY_GTIN_NOT_DECLARED`.

O escopo `PRODUCT` não possui camada regulatória: sua avaliação permanece inalterada.

## Estado atual dos 24 microrganismos ativos

O seed é **estrutural**: cria um dossiê `DRAFT` e as 12 chaves de checklist para cada
microrganismo ativo e importa as 48 apresentações já existentes em `catalogo_volumes`
com `origin_note = 'CATALOGO_A_CONFIRMAR_FISCALMENTE'`, `units_confirmed = false` e
`gtin_confirmed = false`. Nenhum campo regulatório foi preenchido (gate G15).

Consequência esperada e correta: **nenhum** dos 24 itens está `fiscally_ready`. Cada um
lista exatamente o que falta, por camada.

## Artefatos

- `restoration/fase-f2/migration.sql` — DDL, RLS, triggers, RPCs, gate, views, seed, hardening de privilégios
- `restoration/fase-f2/postcheck.sql` — 32 gates fail-closed
- `restoration/fase-f2/rollback.sql` — remoção atômica e restauração do gate da F1
- `restoration/fase-f2/baseline/pre-f2.json` — baseline pré-fase

## Camada de interface (concluída)

- `src/hooks/useMicroorganismRegulatory.ts` — hooks tipados para as 14 RPCs da fase.
  Todo cast de tipo está confinado a uma única boundary (`callRegulatoryRpc`); o
  cliente não infere NCM, CEST, CFOP, CST, origem, GTIN nem unidades.
- `src/components/fiscal/RegulatorioMicrorganismosSecao.tsx` — seção
  "Cadastro regulatório e fiscal de microrganismos" com lista de dossiês, progresso
  do checklist, pendências acionáveis por camada e painel de dossiê em abas
  (Fatos, Checklist, Apresentações, NCM, Documentos, Revisão, Pendências).
- Montada em `src/pages/configuracoes/FiscalProdutos.tsx`, logo abaixo do resumo
  de prontidão.

Regras de UI aplicadas:

- ausência de dado é sempre exibida como `não informado`, nunca como palpite;
- `NOT_APPLICABLE` no checklist exige justificativa antes do envio (e o servidor
  rejeita novamente com `REGULATORY_JUSTIFICATION_REQUIRED`);
- decisões de revisão, bloqueio e nova versão exigem justificativa preenchida;
- candidato de NCM só é enviado com 8 dígitos, justificativa e fonte oficial;
- falha de leitura por permissão exibe estado fail-closed, sem inferir prontidão.

## Validações desta etapa

- `bunx vitest run src/test/fiscal/faseF2.regulatorio.test.ts` — 15/15 PASS
- `bunx vitest run` (suíte completa) — 2738 PASS, 4 skipped, 167 arquivos
- `bunx tsgo --noEmit` — limpo
- `bun run build` — PASS
- `restoration/fase-f2/postcheck.sql` — 32/32 gates PASS (staging `ikaauvsflpmamgxmkhoq`)

Ambiente: exclusivamente staging `ikaauvsflpmamgxmkhoq`. Produção
`navfzbwgwzruipouyfnk` não foi tocada e nada foi publicado.

---

## Correção pós-auditoria (commit 9d6c63d9) — staging ikaauvsflpmamgxmkhoq

Migration corretiva idempotente: `supabase/migrations/20260815000000_fase_f2_correcao_auditoria.sql`
(kit em `restoration/fase-f2-correcao/`: `migration.sql`, `rollback.sql`, `postcheck.sql`,
`runtime-harness.sql`, `gen-types.py`).

### Achados tratados
1. **Storage sem escopo de registro** — path canônico `dossiers/<dossier_id>/<document_id>/<arquivo>`;
   policies de SELECT/INSERT/UPDATE/DELETE em `storage.objects` extraem o `dossier_id` do path e
   validam existência do dossiê/documento, papel e estado. Blob de dossiê `VALIDATED` ou com snapshot
   publicado não pode ser alterado nem removido. Exclusão lógica via
   `rpc_regulatory_document_soft_delete` + fila compensável `regulatory_storage_cleanup_queue`
   confirmada por `rpc_regulatory_storage_cleanup_confirm`. O registro rejeita path fora do dossiê
   (`REGULATORY_STORAGE_PATH_OUT_OF_SCOPE`) e objeto inexistente (`REGULATORY_STORAGE_OBJECT_MISSING`).
2. **NCM sem fonte oficial** — candidato `PROPOSED` exige fonte cadastrada ativa OU URL oficial
   allowlisted (`fn_fiscal_official_url_allowlisted`), `consulted_at` e justificativa >= 20 caracteres.
   Aprovação exige fonte cadastrada, descrição oficial do NCM e versão/data da tabela. Trigger
   deferível garante que o `published_ncm_candidate_id` pertence ao mesmo dossiê. Nenhum candidato
   foi criado para os 24 itens.
3. **GTIN** — `fn_gtin_is_valid` (imutável) implementa o dígito verificador GS1 para GTIN-8/12/13/14,
   aplicada por constraint e pelo motor. "SEM GTIN" permanece declaração explícita, mutuamente
   exclusiva e auditada.
4. **Tipos canônicos** — `src/integrations/supabase/types.ts` regenerado a partir do catálogo do
   staging por `restoration/fase-f2-correcao/gen-types.py` (DSN só via ambiente, nada em código):
   8 tabelas e 18 funções. O hook `useMicroorganismRegulatory.ts` não usa mais boundary solta nem
   `as unknown as`; o nome e os argumentos de cada RPC são verificados pelo compilador.
5. **Segregação de funções** — a mesma identidade não aprova mais de uma camada no mesmo dossiê
   (`REGULATORY_SEGREGATION_OF_DUTIES`). Override emergencial só por administrador, com justificativa
   forte, flag e log (`rpc_regulatory_sod_override`). Publicação exige três camadas `APPROVED` com três
   identidades distintas (ou override auditado), candidato NCM aprovado do mesmo dossiê, evidências e
   checklist concluído; rejeição devolve a `DRAFT` e nunca publica.

### Evidências
- `postcheck.sql`: **39/39 gates PASS** + **4/4 provas transacionais PASS** (revertidas).
- `runtime-harness.sql` (papel `authenticated` real, via `request.jwt.claims`): **24/24 PASS**,
  cobrindo RLS por admin/gestor/financeiro/técnico/parceiro/produtor/sem papel, ausência de DML direto
  apesar dos grants, fonte de NCM, GTIN, escopo de storage, segregação e publicação. Transação revertida.
- Ledger: versão `20260815000000` registrada.
- `tsgo --noEmit`: limpo. `vitest`: suíte completa PASS. `build`: PASS.

### Ressalva remanescente
A camada de UI (`RegulatorioMicrorganismosSecao.tsx`) ainda não explica textualmente as novas regras
de fonte obrigatória, segregação de funções e erros de storage — o servidor já falha fechado, mas as
mensagens ao operador seguem genéricas.

PRODUCTION_NOT_ACCESSED (navfzbwgwzruipouyfnk) · NOT_PUBLISHED
