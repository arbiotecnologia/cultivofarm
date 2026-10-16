# Cliente principal — candidato de consistência (fase pequena, revisável)

**Data:** 16/10/2026. **Base:** `bfce1cc6`. **Estado:** CANDIDATO REVISÁVEL — nenhum SQL hospedado aplicado, nenhuma publicação, nenhuma alteração de contas/vínculos reais, gate de associação fechado. Common F2 e V0 instalados preservados.

## 1. Análise live (captura própria, somente leitura, ref canônico validado)

| Objeto | Estado live | MD5 definição |
|---|---|---|
| `public.sync_user_cliente_principal()` | AFTER ROW em `user_clientes`; elege principal **sem filtrar** is_active/revoked_at/validade; desempate só `created_at` | `50392a57c5908c67c709c4e84f0e932e` |
| `public.enforce_cliente_id_for_produtor()` | Trata `user_roles` (conta **todos** os links, inclusive históricos) e branch `user_clientes` **sem trigger instalado** nessa tabela; em `profiles` retorna NEW sem validar principal | `ecad56badcb2120f7048fad7519f76f4` |
| `get_cliente_ids_for_user` | Correto: filtra vigência e protege fallback `profiles.cliente_id` | `c80d5900692d960f649d0a9f7850fe2c` |
| `has_active_user_cliente_access` | V0 instalado: inclui `revoked_at IS NULL` | `e099f51d128620e5a68cc3e9001dd976` |

Triggers live em `user_clientes`: `a00_cf_user_gate` (BEFORE STATEMENT), `trg_user_clientes_sync` (AFTER ROW), `z90_cf_touch_profile` (AFTER ROW). Em `profiles`: guards de campos sensíveis/tenant/senha, `trg_profiles_enforce_cliente`, stamp `z99`, `require_admin`. Constraints: `UNIQUE(user_id,cliente_id)` em user_clientes; `profiles.cliente_id` FK `ON DELETE SET NULL`; `profiles.user_id` UNIQUE.

**Achados de risco do comportamento atual:**
1. Principal pode apontar para vínculo revogado/inativo/expirado/futuro (sem filtro de vigência).
2. Desempate não determinístico entre linhas com mesmo `created_at` (falta tiebreak por id).
3. `profiles.cliente_id` pode ser sincronizado para histórico — não é vazamento confirmado (resolver live protege o fallback), mas bloqueia consistência da troca.
4. Recursão: os UPDATEs internos re-disparam o trigger; o término atual depende de os UPDATEs não encontrarem linhas — o candidato preserva essa propriedade de convergência e a prova em teste.
5. O UPDATE de `profiles` pelo trigger atravessa `guard_profile_sensitive_fields`/`guard_profile_tenant_fields`: para `authenticated` não-admin, mudança de `cliente_id` é negada — contenção existente preservada, não alterada neste recorte.

## 2. Candidato (`scripts/user-links-principal/candidate.sql.review`)

Fora da pasta de migrations. Escopo: **somente** `sync_user_cliente_principal`. Assinatura, `SECURITY DEFINER`, `search_path` e ACL preservados; nenhum GRANT/REVOKE novo. Preflight DO falha por drift (hashes live, trigger e UNIQUE).

Mudanças:
- Vigência canônica idêntica ao resolver live: `is_active AND revoked_at IS NULL AND valid_from/valid_until` na janela.
- Passo 1 novo: rebaixa principais não vigentes.
- Passo 2: só honra `NEW.principal` se a linha for vigente.
- Passo 3: elege o vigente mais antigo com desempate `created_at, id` (determinístico); se não houver vigente, **nenhum** principal — sem fallback histórico.
- Passo 4: `profiles.cliente_id` sincroniza só com principal vigente ou NULL.
- Convergência: cada UPDATE tem predicado que só casa linhas a mudar; segunda passagem não encontra trabalho (provado nos testes).

**Não alterado de propósito:** `enforce_cliente_id_for_produtor` (contagem histórica na checagem de role) — revisão separada já registrada em `scripts/user-links-v0/principal-analysis.md`; impor proibição nova aqui poderia quebrar writers/provisionamento legados. Nenhuma mudança de negócio além de fechar principais históricos.

## 3. Testes (`scripts/user-links-principal/test-local.py`)

PostgreSQL descartável em `/tmp` (socket, porta 55497, nunca hosted). **18/18 checks PASS**:
- Baseline live reproduz o defeito (principal revogado eleito) — documentado, sem PASS falso.
- Candidato: vigente aceito; revogado/inativo/futuro/expirado nunca eleitos; profile nunca aponta para histórico; exatamente um principal vigente; reativação por UNIQUE (mesma id) funciona; DELETE do principal reelege vigente; sem vínculo vigente → profile NULL; consultor sem vínculos intacto; convergência sem recursão infinita; rollback transacional não persiste nada.
- Limites: schema reduzido local (sem guards cf_user_guards_v1 completos, sem RLS, sem concorrência real); prova hosted e concorrência ficam para ensaio transacional do auditor.

## 4. Rollback

`rollback.sql.review` restaura a definição live byte a byte (MD5 `50392a57c5908c67c709c4e84f0e932e`). Não apaga dados nem reverte vínculos legítimos.

## 5. Pendências (não deste recorte)

- Cache/sessão do titular em outra sessão/dispositivo e signed URLs: seguem pendentes (sem BroadcastChannel entre origens).
- `enforce_cliente_id_for_produtor`: análise separada, não instalada.
- Gestão de associações (troca mesmo tipo): gates fechados, aguarda esta correção + revisão.
- Ensaio hosted BEGIN/ROLLBACK e teste de concorrência: pelo auditor, após revisão.
