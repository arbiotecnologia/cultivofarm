# Matriz Fiscal Mestre v1.0 — carga dos microrganismos

Fonte: **Matriz Fiscal Mestre AR Bio v1.0 (07/08/2026)**. A própria matriz declara
NCM, CFOP e benefícios como **preliminares**.

Ambiente: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` proibida.
A carga é de **dados** (não altera schema), transacional, idempotente e reversível.

## Ordem de execução

```bash
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f 10-carga.sql
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f 20-postcheck.sql
# reversão total do lote:
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f 90-rollback.sql
```

## O que a carga faz

1. **Guarda de ambiente** — aborta se existir emitente com `production_enabled`,
   `fiscal_environment = PRODUCTION` ou `nfe_environment_code = '1'`.
2. **Conciliação 24 → 27** — cria apenas `BAC-1` (Azospirillum brasilense),
   `BAC-12` (Bradyrhizobium japonicum) e `BAC-17` (Pantoea agglomerans),
   com tripla verificação anti-duplicidade (código, nome, nome científico).
   Correspondência é estrita: divergência de nome científico aborta a transação.
3. **Dossiê regulatório DRAFT v1** por microrganismo (24 existentes reaproveitados,
   3 criados). `regulatory_category` é gravada **somente** para itens inequívocos
   (PF-01 → INOCULANTE, PF-02 → AGENTE_BIOLOGICO_CONTROLE, PF-03 → OUTRO_A_DEFINIR).
   Itens condicionais permanecem **NULL** — finalidade não é presumida pela espécie.
4. **Checklist 12 itens, todos PENDING** (a carga não decide nada).
5. **Apresentação 1 L** com uCom/uTrib = L, fator 1, `units_confirmed = false`,
   declaração formal **SEM GTIN até cadastramento**. As apresentações 5 L / 20 L
   da Fase F2 não são tocadas.
6. **Candidatos de NCM `PROPOSED`** (28 = 27 + o alternativo `38089299` de
   *Bacillus subtilis*), com fonte oficial `RFB_NCM_TIPI`, data de consulta
   07/08/2026, confiança da matriz e justificativa rastreável. Nenhum aprovado.
7. **Perfil fiscal DRAFT** por microrganismo: NCM da matriz, origem `0`,
   CFOP 5101/6101 (preliminares), CST em vez de CSOSN (Lucro Presumido),
   PIS/COFINS propostos por perfil (PF-01/PF-02 → CST 06; PF-03 → CST 01;
   condicionais → não propostos), CEST nulo, GTIN nulo, IPI não enquadrado,
   ICMS não gravado. Sem `accounting_validated_at`.
8. **Higienização** — resíduo de harness `BAC-27` desativado (`ativo = false`,
   `b2b_enabled = false`). Não é excluído porque é referenciado por
   `partner_order_items`; a desativação preserva integridade e auditoria.

## Invariantes asseridas dentro da transação

Qualquer violação aborta tudo: perfis fora de DRAFT, validação contábil preenchida,
dossiê fora de DRAFT/PENDING, `published_ncm`/`published_cest` gravados, candidato
fora de PROPOSED, item de checklist decidido, contagem diferente de 27.

## Estado após a carga (evidência de staging)

| Verificação | Valor |
|---|---|
| Microrganismos da matriz | 27 |
| Perfis fiscais ativos em DRAFT | 27 |
| Perfis VALIDATED / com validação contábil | 0 / 0 |
| Dossiês DRAFT / fora de DRAFT | 27 / 0 |
| Candidatos de NCM da carga / aprovados | 28 / 0 |
| Apresentações 1 L | 27 |
| Checklist PENDING / decidido | 324 / 0 |
| `published_ncm` | 0 |
| `BAC-27` ativo | 0 |

`rpc_fiscal_item_readiness('MICROORGANISM', …)` retorna `ready = false`,
`status = NOT_READY` para todos os itens amostrados (BAC-1, BAC-8, BAC-9, CON-1,
FUN-5), com 19 a 22 pendências. `quarantined = false`: os itens **não** são
sintéticos — estão legitimamente incompletos, o que é a semântica correta.

## Pendências deliberadamente não resolvidas

- Registro MAPA, cepa, rótulo, laudo e composição — não confirmados.
- Sinônimos taxonômicos `FUN-3` / `FUN-4` (*Paecilomyces* / *Purpureocillium*)
  mantidos como registros distintos até decisão regulatória formal.
- Composição do consórcio `CON-1` (E.M.) — não declarada.
- IBS/CBS (CST 200, cClassTrib 200038, redução 60%): registrado como **proposta
  textual** nas notas do perfil. Não existe coluna tipada de IBS/CBS para
  microrganismos e nenhuma estrutura paralela foi criada.
- ICMS MG (CST 40 interno / CST 20 com redução 60% interestadual): não gravado
  e nenhuma tax rule publicada.
