# Fase F1 — Hardening Fiscal e Quarentena de Classificações Sintéticas

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não foi acessada.

| Artefato | Versão no ledger |
| --- | --- |
| `supabase/migrations/20260812000000_fase_f1_hardening_fiscal_quarentena.sql` | F1 original |
| `supabase/migrations/20260813000000_fase_f1_correcao_promovivel.sql` | Correção pós-auditoria (head atual) |

Ledger após a correção: **630 versões**, head `20260813000000`.

---

## 1. O que a fase entrega

1. **Superfície pública fechada** — `anon` e `PUBLIC` não têm nenhum privilégio nas 14 relações fiscais/de microrganismos do escopo, e nenhuma policy do escopo endereça esses papéis.
2. **Quarentena das classificações sintéticas** — perfis fiscais criados para homologação ficam `BLOCKED` + `is_active = false`, sem apagar linha nem alterar qualquer valor fiscal.
3. **Motor de prontidão diagnóstico** — um avaliador único decide prontidão e devolve as pendências que faltam, separando o que é **técnico** do que é **regulatório**.
4. **Auditoria estendida** ao escopo novo sem tocar no comportamento de auditoria já existente.

Nenhuma classificação fiscal foi inventada, corrigida ou preenchida. O hash dos campos fiscais (`ncm`, `cest`, `origin_code`, CFOPs, CSTs, CSOSN) é comparado contra o baseline a cada pós-check.

---

## 2. Correções aplicadas após a auditoria independente

A auditoria do commit `78bfa61d` apontou cinco falhas. Todas foram corrigidas em `20260813000000`:

### 2.1 Dependência de UUID de ambiente → predicado semântico

A F1 original identificava os perfis sintéticos por UUID literal, o que a tornava não promovível (os IDs de produção são outros). A correção identifica o perfil pelo **conteúdo do próprio registro** — marcadores `hml-b2b`, `test_only`, `sintetic`, `homologacao` em `accounting_notes` — e nunca toca em perfil com `accounting_validated_at` preenchido.

Migration, rollback e postcheck estão livres de UUID literal (verificado por varredura).

### 2.2 Quarentena invisível no RPC → quarentena é pendência de primeira classe

Antes, o item em quarentena simplesmente desaparecia do diagnóstico (a view filtrava `is_active = true`), fazendo o RPC responder "sem perfil". Agora:

- as views selecionam de forma **determinística**: perfil ativo/validado primeiro, e só então o perfil em quarentena — este último exclusivamente para fins de diagnóstico;
- o retorno traz `quarantined: true` e as pendências `PROFILE_QUARANTINED` e `PROFILE_SYNTHETIC`;
- `ready` e `technical_ready` permanecem `false`, então quarentena nunca vira caminho de emissão.

### 2.3 Trigger compartilhado reescrito → escopo próprio

A F1 original reescreveu o corpo de `fiscal_audit_trigger()`, usado por 7 triggers de outros módulos. A correção **restaurou o corpo pré-F1** (md5 `ed0a7720…`) e criou `fiscal_audit_trigger_microorganism_profiles()` dedicada ao escopo novo. O pós-check falha se o corpo compartilhado voltar a mencionar `microorganism_fiscal_profiles`.

### 2.4 Alegação de evidência documental → nomenclatura honesta

O código `NCM_WITHOUT_EVIDENCE` sugeria uma verificação de evidência que não existe. Ele foi substituído por:

- `NCM_NOT_ACCOUNTING_REVIEWED` — o que de fato é verificado: ausência de revisão contábil registrada;
- `REGULATORY_EVIDENCE_NOT_IMPLEMENTED` — pendência **sempre presente**, declarando explicitamente que a validação regulatória é trabalho da F2.

Daí a separação de campos: `technical_ready` pode ser `true` para um perfil bem formado, mas `ready` (prontidão operacional) permanece `false` enquanto a evidência regulatória não existir. Nenhum item pode ser tratado como apto a emitir nesta fase.

### 2.5 Contagens absolutas no postcheck → comparação contra baseline

O pós-check não congela mais números ("24 microrganismos", "3 perfis"). Ele recebe o baseline capturado antes da correção (`restoration/fase-f1/baseline/pre-correcao.json`) e verifica **não regressão**: hashes fiscais idênticos, contagens que não caem, ledger que não retrocede. Invariantes que não dependem de volume (privilégios, ausência de duplicidade, zero itens prontos) continuam absolutas por serem semânticas.

---

## 3. Motor de prontidão

`fn_fiscal_item_profile_gate_eval(...)` é a **única** fonte de verdade. Views e RPC apenas a consomem, de modo que UI e SQL nunca divergem.

Pendências técnicas avaliadas:

| Código | Significado |
| --- | --- |
| `PROFILE_MISSING` | Item sem perfil fiscal |
| `PROFILE_QUARANTINED` / `PROFILE_SYNTHETIC` | Perfil em quarentena / de origem sintética |
| `PROFILE_INACTIVE`, `PROFILE_NOT_VALIDATED` | Estado do perfil |
| `NCM_MISSING`, `NCM_INVALID_FORMAT` | NCM ausente ou fora de 8 dígitos |
| `CEST_INVALID_FORMAT` | CEST fora de 7 dígitos |
| `ORIGIN_MISSING`, `CFOP_IN_STATE_MISSING`, `CFOP_INTERSTATE_MISSING` | Parametrização obrigatória |
| `ICMS_TAXATION_MISSING` | Nem CST nem CSOSN informado |
| `CST_AND_CSOSN_CONFLICT` | Ambos informados |
| `CSOSN_NOT_ALLOWED_FOR_CRT3` | CRT 3 (Regime Normal) exige CST |
| `CST_NOT_ALLOWED_FOR_CRT1` | Simples Nacional exige CSOSN |
| `PIS_CST_MISSING`, `COFINS_CST_MISSING` | Tributação federal ausente |
| `ACCOUNTING_NOT_VALIDATED`, `NCM_NOT_ACCOUNTING_REVIEWED` | Pré-requisito contábil |

Pendência regulatória (sempre presente nesta fase): `REGULATORY_EVIDENCE_NOT_IMPLEMENTED`.

A coerência de CRT é lida do emitente por `fn_fiscal_company_crt()` — o CRT atual é **3 (Regime Normal)**, logo qualquer perfil com CSOSN é rejeitado tecnicamente.

---

## 4. Segurança

- `anon`/`PUBLIC`: zero privilégios nas 14 relações do escopo; nenhuma policy os endereça.
- `rpc_fiscal_item_readiness` exige `administrador`, `gestor` ou `financeiro`; caso contrário `FISCAL_FORBIDDEN` (42501). Sem sessão, `anon` não tem sequer EXECUTE.
- Views são `security_invoker = true`, então a RLS das tabelas-base continua vigente — usuário autenticado sem papel enxerga zero linhas.
- Funções da fase: `SECURITY DEFINER` com `search_path` fixado, exceto o avaliador puro (`INVOKER`, `search_path = pg_catalog, pg_temp`, sem acesso a tabelas).
- As views de prontidão passaram a ter apenas `SELECT` para `authenticated` (perderam `TRUNCATE`/`REFERENCES`/`TRIGGER` herdados de grant amplo histórico).

---

## 5. Verificação

```bash
./restoration/fase-f1/run-postcheck.sh      # 24 gates, baseline injetado
```

Resultados registrados nesta execução, no staging `ikaauvsflpmamgxmkhoq`:

| Verificação | Resultado |
| --- | --- |
| Pós-check (24 gates, baseline) | **PASS** |
| Harness de runtime RBAC/diagnóstico (17 gates) | **17 PASS / 0 FAIL** |
| Rollback — ensaio transacional revertido | **PASS** |
| Reaplicação da migration (idempotência) | **PASS** |
| Vitest | 2723 passed / 4 skipped |
| `tsgo --noEmit` | limpo |
| `bun run build` | PASS |

O harness cobre, com sessões reais: `anon` bloqueado em view e RPC; autenticado sem papel com zero linhas e RPC negado; quarentena visível e nunca pronta; item sem perfil e item inexistente retornando o mesmo contrato `PROFILE_MISSING`; pendência regulatória sempre presente; papel `financeiro` preservado; hashes fiscais inalterados.

## 6. Rollback

`restoration/fase-f1/rollback.sql` — transacional e fail-closed. Não restaura grants de `anon`/`PUBLIC` (seria regressão de segurança), não reescreve o corpo compartilhado de auditoria (aborta se ele estiver contaminado), desquarentena por predicado semântico e remove as duas versões do ledger.

## 7. Escopo não coberto (F2)

Evidência regulatória por microrganismo, validação contábil das 24 classificações, CNPJ e certificado digital do emitente, geração/transmissão de XML. Nenhum item está apto a emitir documento fiscal ao fim da F1.
