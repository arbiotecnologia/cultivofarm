# 26 — AUDITORIA DE COMPATIBILIDADE H7n EM PRODUÇÃO — NO-GO

**Data do relato:** 2026-09-10 (UTC-3)
**Alvo auditado:** produção Supabase `navfzbwgwzruipouyfnk`
**Execução por este ambiente:** nenhuma. Nenhum banco foi acessado, nenhum SQL
executado, nada publicado. Todos os números abaixo são **evidência declarada
pelo operador** a partir de leitura autenticada na própria máquina.
**Veredito:** **NO-GO** para promover diretamente as cinco migrations H7n do
staging para produção. **P2 permanece bloqueada.**

---

## 1. Estado observado em produção

| Item | Valor observado |
|---|---|
| Ledger | **493** linhas, latest `20261101000000` |
| Versões H7n no ledger | **ausentes** (nenhuma das cinco) |
| Alvos de view do H7n presentes | **3 de 5**: `vw_esteira_laboratorio`, `vw_fluxo_visita_tecnica`, `vw_os_integridade_esteira` |
| Views de catálogo do H7n | **inexistentes** |
| `fn_catalogo_preco_canonico(uuid,uuid,text,numeric)` | **inexistente** |
| `mv_esteira_laboratorio`, `mv_fluxo_visita_tecnica` | **existem** |
| `fn_h6b_num` | **inexistente** |
| `fn_gtin_is_valid` | **inexistente** |
| `fn_regulatory_storage_path_ok` | **inexistente** |
| `fn_regulatory_storage_dossier_id` | **inexistente** |
| `SECURITY DEFINER` executáveis por `authenticated` | **277** |

## 2. Por que o veredito é NO-GO

As cinco migrations H7n foram escritas contra o schema do staging
`ikaauvsflpmamgxmkhoq`, que está materialmente à frente da produção. Aplicá-las
como estão em `navfzbwgwzruipouyfnk` falharia ou, pior, aplicaria parcialmente:

1. **Alvos de view ausentes.** Dois dos cinco alvos não existem em produção. Um
   `ALTER VIEW` / `CREATE OR REPLACE VIEW` sobre objeto inexistente aborta a
   transação; um `IF EXISTS` silencioso deixaria o hardening incompleto sem
   sinalizar — ambos os desfechos são inaceitáveis numa onda de promoção.
2. **Views de catálogo inexistentes.** A superfície de catálogo que o H7n
   endurece simplesmente não foi promovida ainda. Não há o que endurecer.
3. **Dependência de função ausente.** `fn_catalogo_preco_canonico(uuid, uuid,
   text, numeric)` não existe em produção, embora as materializadas
   `mv_esteira_laboratorio` e `mv_fluxo_visita_tecnica` existam. Qualquer
   definição H7n que referencie essa função quebra em tempo de criação.
4. **Helpers ausentes.** `fn_h6b_num`, `fn_gtin_is_valid`,
   `fn_regulatory_storage_path_ok` e `fn_regulatory_storage_dossier_id` não
   existem. Constraints, políticas e checks do H7n que os invocam falham.
5. **Superfície SECURITY DEFINER divergente.** As 277 funções executáveis por
   `authenticated` em produção não correspondem ao conjunto auditado em
   homologação. Um `REVOKE`/`GRANT` em lote derivado do staging tem alto risco
   de negar execução a caminhos operacionais vivos em produção.

Nenhum desses pontos é contornável por reordenação: são lacunas de schema, não
de sequência.

## 3. Encaminhamento proposto — variante H7n específica de produção

O caminho seguro não é promover o H7n do staging, e sim derivar uma variante
`H7n-PROD` construída contra o schema real de produção.

**Etapa A — diff de contratos (somente leitura, sem escrita em nenhum banco).**
Produzir um diff objeto a objeto entre `ikaauvsflpmamgxmkhoq` e
`navfzbwgwzruipouyfnk` cobrindo: as 5 views alvo, as views de catálogo,
`fn_catalogo_preco_canonico` e as materializadas correlatas, os 4 helpers, e a
lista completa de `SECURITY DEFINER` com `EXECUTE` para `authenticated`. O
artefato deve registrar, por objeto: existe/não existe, assinatura, owner,
`reloptions`/`prosecdef`, ACL e hash da definição.

**Etapa B — variante recortada.** Escrever forwards novos, forward-only, que
cubram **apenas** os objetos comprovadamente presentes em produção, com
prechecks fail-closed que abortam se qualquer alvo estiver ausente, e com
rollback e baseline de ACL capturados antes da alteração. Objetos ausentes
saem do escopo desta onda e viram dependência declarada de uma onda anterior de
promoção de schema.

**Etapa C — dry-run em homologação.** Executar a variante `H7n-PROD` primeiro em
`ikaauvsflpmamgxmkhoq`, contra uma réplica do recorte de produção, com
pre/post-checks e Security Advisor antes/depois. Sem esse dry-run verde, não há
autorização de execução em produção.

**Etapa D — gate.** Só então reabrir a discussão de P2, com evidência arquivada.

## 4. Restrições mantidas

- Frontend **não** publicado.
- Edge Functions **não** implantadas.
- Integrações externas **não** ativadas; nenhum e-mail, WhatsApp, fiscal ou
  webhook disparado.
- Binding local permanece em homologação `ikaauvsflpmamgxmkhoq`.
- Sandbox `yzszlzjpovmcteuxjznj` permanece proibido.

## 5. Gate

- **Promoção direta das 5 migrations H7n:** **NO-GO.**
- **Onda P2:** **bloqueada**, sem alteração de status.
- **Pré-requisito para reabrir:** diff de contratos (Etapa A), variante
  `H7n-PROD` (Etapa B) e dry-run verde em homologação (Etapa C), arquivados em
  `restoration/promocao-producao-h9/evidencias/`.
