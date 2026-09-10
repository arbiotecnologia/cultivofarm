# Evidência de Produção — H7n-PROD A1 — 2026-09-10

**Projeto:** AR Bio Manager  
**Ambiente:** produção `navfzbwgwzruipouyfnk`  
**Data/hora da coleta:** 2026-09-10, horário local de São Paulo (UTC-3)  
**Responsável:** operador local (Renato S. Cunha)  
**Método:** censo somente leitura; nenhum SQL de alteração executado  
**Artefato-fonte:** `h7n-prod-a1-package.zip`

---

## 1. Identidade do pacote baixado

| Propriedade | Valor |
|---|---|
| Nome do arquivo | `h7n-prod-a1-package.zip` |
| SHA-256 | `a80832ab0c1cb6c979243b49f45944226f79ca2931b46012295b32f0e44c0d97` |
| Conteúdo declarado | 6 artefatos da onda A1 (forward, rollback, censo, prechecks, pós-checks, plano) |

## 2. Contexto do ledger

| Propriedade | Valor |
|---|---|
| Ledger atual | `493` |
| Latest migration | `20261101000000` |
| Estado das tabelas de convergência | RLS habilitada, zero policies, sem SELECT para `anon`/`authenticated`, vazias, sem baseline |

## 3. Censo das views alvo

Consulta somente leitura executada na produção para confirmar existência, `relkind` e `security_invoker` das views:

| View | Esquema | Existe | `relkind` | `security_invoker` |
|---|---|---|---|---|
| `vw_os_integridade_esteira` | `public` | SIM | `v` | `true` |
| `vw_esteira_laboratorio` | `public` | SIM | `v` | `true` |
| `vw_fluxo_visita_tecnica` | `public` | SIM | `v` | `true` |

**Resultado:** 3/3 views já possuem `security_invoker=true`.

## 4. ACLs e schema auxiliar

| Verificação | Resultado |
|---|---|
| ACLs das três views preservadas | SIM |
| Schema `private` presente | NÃO |
| `SECURITY DEFINER` executáveis por `authenticated` | 277 |

## 5. Objetos ausentes (bloqueiam A2..A5)

| Objeto / dependência | Estado em produção |
|---|---|
| Views de catálogo H7n | Ausentes |
| `fn_catalogo_preco_canonico(uuid, uuid, text, numeric)` | Ausente |
| `fn_h6b_num` | Ausente |
| `fn_gtin_is_valid` | Ausente |
| `fn_regulatory_storage_path_ok` | Ausente |
| `fn_regulatory_storage_dossier_id` | Ausente |

## 6. Interpretação

O estado-alvo da onda A1 (`security_invoker=true` nas três views) já foi atingido em produção. Executar o forward `20261103000000_h7nprod_a1_security_invoker_views_v1.sql` não alteraria o banco de dados. Por isso a onda A1 é classificada como **NO-OP / NAO EXECUTADA**.

O precheck original esperava 2/3 views endurecidas, mas o censo real encontrou 3/3. Essa divergência é benigna e indica que o hardening das views já foi concluído por outros meios.

## 7. Decisões de registro

- **Não registrar** a onda A1 no ledger de produção.
- **Não inserir** linha em `public.promocao_execucao_registro` para a A1.
- **Manter bloqueadas** as ondas A2..A5 e a onda P2 geral.

## 8. Restrições observadas

- Nenhum comando de escrita (`ALTER`, `CREATE OR REPLACE`, `GRANT`, `REVOKE`, `INSERT`, `UPDATE`, `DELETE`) foi emitido.
- Nenhum frontend foi publicado.
- Nenhuma Edge Function foi implantada.
- Nenhuma integração externa foi ativada.
