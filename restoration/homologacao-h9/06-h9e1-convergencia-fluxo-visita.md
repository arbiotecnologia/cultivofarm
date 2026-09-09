# H9-E1 — Convergência do fluxo de início de visita e prontidão de promoção

- Ambiente único: **homologação `ikaauvsflpmamgxmkhoq`**.
- Produção `navfzbwgwzruipouyfnk` e Sandbox `yzszlzjpovmcteuxjznj`: **não acessados**.
- Ledger: **675 → 677** (duas versões, cada uma aplicada **uma única vez**).
- 59 migrations repo-only do H7P: **conferidas ausentes do ledger** (0 presentes), quarentena intacta.

## 1. Diagnóstico e causa-raiz

O enum `public.status_registro_consultor` já contém `em_andamento`, e o estado é reconhecido por
`public.is_technical_visit_editable_status`. `public.start_technical_visit_secure(...)` grava
`status='em_andamento'` no check-in e `public.finish_technical_visit_secure(...)` exige exatamente
esse estado antes de `finalizado`. A matriz do trigger `trg_validate_registro_status`
(função `public.validate_registro_status_transition()`) nunca previu `em_andamento`:
admitia apenas `rascunho → finalizado/arquivado`.

Consequência comprovada: **o início de visita era impossível** para qualquer perfil, inclusive
administrador — falha genuinamente funcional, não de autorização.

Ao destravar o início, um **segundo defeito preexistente**, até então inalcançável, ficou exposto:
em `finish_technical_visit_secure` a contagem de diagnósticos usava
`FROM public.visita_diagnosticos WHERE registro_id = v_reg.id`, e `registro_id` é também o
parâmetro **OUT** do `RETURNS TABLE`. O encerramento abortava com `42702`
(`column reference "registro_id" is ambiguous`).

Nenhum dos dois defeitos era de escopo/permissão: a autorização de escopo (H9-D-L6/L7) permaneceu
íntegra em todas as provas.

## 2. Objetos e arquivos alterados

| Objeto | OID | Owner | Segurança | ACL | Fingerprint pré → pós |
|---|---|---|---|---|---|
| `public.validate_registro_status_transition()` | 18869 | postgres | DEFINER, `search_path=public` | `postgres=X, service_role=X` (sem PUBLIC/anon) | `33e9641876fc4cc6007cca730308ffa7` → `ec118fdf0c7b6739980f6f0bc45552d7` |
| `public.finish_technical_visit_secure(uuid,numeric,numeric,numeric,text,text,text,uuid)` | 24597 | postgres | DEFINER, `search_path=public` | `postgres=X, authenticated=X, service_role=X` (sem PUBLIC/anon) | `74cab9081642637b1d0bf6f6743e4a01` → `1a23e69ad1909af5b6021d81fb9ed918` |

Arquivos:

- `restoration/homologacao-h9/h9e-forwards/20261020000000_h9e1_visit_status_transition_convergence_v1.sql`
  — SHA-256 `e391fd8317c6c4f0aad04b4d4dab0fe1af9d9c443a17bac244ca9d7fee260dcc`
- `restoration/homologacao-h9/h9e-rollbacks/20261020000000_..._rollback.sql`
  — SHA-256 `edf56ef72edd39a03e88bfdc6c6d8ae307732c12c18a11cfb65dcf4afc38ed82`
- `restoration/homologacao-h9/h9e-forwards/20261021000000_h9e1c_finish_visit_ambiguous_column_v1.sql`
  — SHA-256 `f2a7f26c83dcd3fa75858bf2128043fcf71b398883cafba3697f4a5c2bff8fdc`
- `restoration/homologacao-h9/h9e-rollbacks/20261021000000_..._rollback.sql`
  — SHA-256 `05763c55d593e596d27b6095c3c0fa1dc79aea51a54087756b9391ca8b7f29db`
- Provas: `h9e-provas/h9e1-prova-start-visit.sql`, `h9e-provas/h9e1-prova-e2e-start-finish.sql`
- Manifestos: `h9c-applied-forwards.json` (15 → **17** entradas, ledger **677**),
  `restoration/homologacao-h7/h7p-repo-only-manifest.json` (ledger **677**, 59 quarentenas mantidas)
- Frontend: `src/lib/registroTransitions.ts` — contrato de transições sincronizado com o trigger
  (`rascunho → em_andamento`, `em_andamento → finalizado/arquivado`); nenhum fluxo paralelo criado.
- Teste estático novo: `src/test/security/h9e1-visit-status-convergence.static.test.ts`.

Escopo mínimo: apenas a matriz de transições, a extensão da exigência de `problema_principal` ao
novo caminho e a qualificação de uma coluna. **Nenhuma permissão ampliada**; nenhum `GRANT` novo;
sem PUBLIC/anon; `SECURITY DEFINER` com `search_path` fixo preservado nos dois objetos.

## 3. Provas (transação integralmente revertida, resíduo zero)

Antes (`20261020000000`):

| Caso | SQLSTATE | Resultado |
|---|---|---|
| dono legítimo | 23514 | `Transição inválida … "rascunho" para "em_andamento"` |
| administrador | 23514 | idem |
| autenticado sem escopo | 42501 | `not_visit_owner` |
| registro inexistente | 42501 | `not_visit_owner` (indistinguível) |
| `client_uuid` alheio | 42501 | `not_visit_owner` (indistinguível) |
| anon | 42501 | `permission denied for function` |

Depois (`20261020000000` + `20261021000000`):

| Caso | SQLSTATE | Resultado |
|---|---|---|
| dono legítimo — início | 00000 | check-in criado, `status=em_andamento` |
| dono legítimo — encerramento | 00000 | check-out criado, `status=finalizado` |
| clique repetido / mesmo `client_uuid` | 00000 | mesmo `checkin_id`, `is_new=false` |
| administrador | 00000 | início e encerramento OK |
| sem escopo / inexistente / `client_uuid` alheio | 42501 | `not_visit_owner`, indistinguíveis |
| anon | 42501 | permission denied |
| regressão `finalizado → aprovado` | 23514 | bloqueada (visita finalizada é imutável) |
| finalizar sem `problema_principal` | 23514 | bloqueada |

Ensaios reversíveis: forward → fingerprint esperado; rollback → fingerprint pré **byte-fiel**
(`33e9641876fc4cc6007cca730308ffa7` e `74cab9081642637b1d0bf6f6743e4a01`). Os artefatos **não têm
`BEGIN/COMMIT` próprios** — a transação é sempre externa, evitando a repetição do incidente da L7.
Deltas de fixtures voltaram a zero após o rollback.

## 4. Validação

- Gate estático novo H9-E1 e gates acumulados: **segurança 14 arquivos / 181 testes, 100%**.
- Suíte completa: **224 arquivos passaram, 1 skipped; 3.501 testes passaram, 4 skipped**.
- Typecheck OK. Build OK.
- Jobs `cron` **1, 2, 5, 8, 9, 18** verificados **ativos**.
- Sem `service_role` ou segredo no frontend: as únicas ocorrências em `src/` são comentários em
  `src/lib/protocolos/seedCatalogoARBioV13.ts`, sem chave.
- Binding: `.env` e `src/integrations/supabase/client.ts` restaurados para **homologação**
  (`ikaauvsflpmamgxmkhoq`) após drift automático da plataforma para o Sandbox;
  `src/integrations/supabase/types.ts` restaurado íntegro (21.850 linhas).
- **Advisors gerenciados não foram medidos por mim**: a ferramenta disponível pode atingir outro
  projeto, o que é proibido. Valores de referência informados externamente permanecem
  segurança 390 e performance 507; a verificação própria foi feita no catálogo vivo (SECDEF,
  `search_path`, ACL, owner) e **não introduziu categoria nova** — os dois objetos alterados
  mantiveram exatamente owner, ACL e `proconfig` anteriores.

## 5. Riscos remanescentes

1. `finish_technical_visit_secure` grava o registro de encerramento com
   `tipo_checkin='inicio_visita'`, embora o enum possua `checkout`. É inconsistência **semântica
   preexistente**; alterar mudaria dados/relatórios e está fora do escopo deste lote.
2. Não há callsite direto de `start_technical_visit_secure`/`finish_technical_visit_secure` em
   `src/` ou Edge Functions — o app usa `rpc_realizar_checkin_visita`. A convergência do fluxo
   seguro ainda não está exercida por tela; ligar a UI exige lote próprio.
3. O `.env` volta a apontar para o Sandbox a cada regeneração automática da plataforma; qualquer
   lote seguinte deve reconferir o binding antes de tocar o banco.
4. Advisors gerenciados seguem sem medição própria (item 4).

## 6. Decisão

- **H9-E1: GO em homologação.**
- **Promoção para produção: NO-GO** — riscos 1 a 4 acima ainda abertos e H9-E não concluída.
- Lote encerrado aqui; nenhum lote seguinte iniciado.
