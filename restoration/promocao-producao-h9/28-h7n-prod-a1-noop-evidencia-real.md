# 28 — H7n-PROD A1: EVIDÊNCIA REAL DE PRODUÇÃO E RECLASSIFICAÇÃO COMO NO-OP

**Data da evidência:** 2026-09-10 (UTC-3)  
**Alvo:** produção `navfzbwgwzruipouyfnk`  
**Execução por este ambiente:** nenhuma. Nenhum banco acessado, nenhum SQL executado, nada publicado, nenhuma Edge Function implantada.  
**Continuação de:** `27-h7n-prod-pacote-variante.md`  
**Relatório local anexo:** `evidencias/h7nprod-a1-production-evidence-2026-09-10.md`

---

## 1. Resumo executivo

O operador realizou, em sua máquina local e por canal autenticado direto, um censo somente-leitura na produção `navfzbwgwzruipouyfnk`. O censo comprovou que o **estado-alvo da onda A1 já existe**: as três views (`vw_os_integridade_esteira`, `vw_esteira_laboratorio`, `vw_fluxo_visita_tecnica`) já possuem `security_invoker=true`. Por isso a onda A1 foi **reclassificada de "preparada/GO condicionado" para NO-OP/NAO EXECUTADA** e **não deve ser registrada no ledger**, para não criar uma entrada fictícia de mudança que de fato não ocorreu.

Nenhum `ALTER VIEW`, `GRANT`, `REVOKE`, `CREATE OR REPLACE` ou outro comando de escrita foi emitido.

## 2. Evidências declaradas pelo operador

| Item | Valor |
|---|---|
| Pacote baixado localmente | `h7n-prod-a1-package.zip` |
| SHA-256 do ZIP | `a80832ab0c1cb6c979243b49f45944226f79ca2931b46012295b32f0e44c0d97` |
| Data/hora da coleta | 2026-09-10, horário local de São Paulo (UTC-3) |
| Método | Censo somente leitura; nenhum SQL de alteração executado |
| Ledger produção | `493` / latest `20261101000000` |

## 3. Resultados do censo de produção

### 3.1 Views alvo da onda A1

| View | Existe | `security_invoker` | Observação |
|---|---|---|---|
| `vw_os_integridade_esteira` | SIM | `true` | Já endurecida |
| `vw_esteira_laboratorio` | SIM | `true` | Já endurecida |
| `vw_fluxo_visita_tecnica` | SIM | `true` | Já endurecida |

**Score:** 3/3 views com `security_invoker=true`.

### 3.2 Outros objetos verificados

| Objeto / condição | Estado |
|---|---|
| ACLs das três views | Preservadas, sem alteração |
| Schema `private` | Ausente |
| `SECURITY DEFINER` executáveis por `authenticated` | 277 (inalterado) |
| Views de catálogo H7n | Ausentes |
| `fn_catalogo_preco_canonico(uuid, uuid, text, numeric)` | Ausente |
| Quatro helpers da P2 (`fn_h6b_num`, `fn_gtin_is_valid`, `fn_regulatory_storage_path_ok`, `fn_regulatory_storage_dossier_id`) | Ausentes |

## 4. Reclassificação da onda A1

A onda A1 tinha como objetivo aplicar `security_invoker=true` nas três views. Como o estado-alvo já foi atingido por ações anteriores (P0d/P1 parcial), executar o forward A1 não produziria mudança material no banco. Classificação atual:

- **Veredito:** `NO-OP / NAO EXECUTADA`
- **Registro no ledger:** `NAO REGISTRAR`. Não se cria entrada `APLICADA` para uma mudança que não ocorreu.
- **Registro em `public.promocao_execucao_registro`:** `NAO INSERIR`.

## 5. Divergência entre precheck e estado real

O precheck original (`checks/01-prechecks.sql`) esperava encontrar **2 de 3** views já endurecidas, deixando a A1 para endurecer a terceira (`vw_os_integridade_esteira`). O censo real encontrou **3 de 3** views endurecidas. Essa divergência é benigna e indica que ações manuais anteriores (fora do ledger ou como parte do hardening P0d) já completaram o objetivo da A1.

Ação tomada: reclassificar a onda como NO-OP, sem executar SQL.

## 6. Estado das demais ondas e da P2

| Onda / fase | Veredito | Motivo |
|---|---|---|
| H7n-PROD A1 | **NO-OP / NAO EXECUTADA** | Estado-alvo já existe |
| H7n-PROD A2..A5 | **NO-GO** | Censo ainda não arquivado; objetos ausentes; diff de corpos não realizado |
| Onda P2 geral | **BLOQUEADA** | H7n-PROD não concluído; evidências P1 pendentes de arquivamento |

## 7. Ações proibidas nesta etapa

- Não executar SQL na produção.
- Não registrar a A1 no ledger como aplicada.
- Não publicar frontend.
- Não implantar Edge Functions.
- Não ativar integrações externas.

## 8. Próximos passos sugeridos

1. Arquivar, com SHA-256, a saída bruta do censo executado em produção.
2. Executar o diff de contratos (`md5(pg_get_functiondef)` staging × produção) para as RPCs do P1b, se ainda for intenção avançar A4.
3. Promover, em homologação, as ondas que criam `fn_catalogo_preco_canonico`, as views de catálogo e os quatro helpers da P2, antes de tentar replicá-los em produção.
4. Classificar os 277 `SECURITY DEFINER` de produção em trigger / helper interno / RPC pública.
5. Somente após os itens acima, reavaliar A2..A5.

## 9. Gate

- **H7n-PROD A1:** `NO-OP` — não executar, não registrar ledger. Estado-alvo já atingido.
- **H7n-PROD A2..A5:** `NO-GO`.
- **Onda P2:** `BLOQUEADA`.
- **Promoção geral H9:** `NO-GO` até novas evidências.
