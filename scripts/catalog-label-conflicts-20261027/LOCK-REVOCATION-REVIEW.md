# Achado separado (não corrigido neste lote): revogação antes/depois do lock

Ordem LIVE nos dois alvos: `catalog_metadata_require_actor()` (superadmin + `is_platform_superadmin` + `platform_actor_access_ready` + iat/exp) →
`catalog_entity_replay` (advisory xact lock por chave) → `SELECT ... FOR UPDATE` em `catalog_family_labels` → UPDATE → auditoria.

- A autoridade é avaliada UMA vez, antes de qualquer espera. Se o superadmin for revogado enquanto a chamada aguarda o advisory lock ou o lock de linha
  (outra escrita concorrente no mesmo rótulo), a operação prossegue com autoridade observada antes da espera. Não há gate global `cf_user_guards_v1.state` nem revalidação pós-lock.
- Também não há `lock_timeout` próprio nas funções (o pacote só usa `SET LOCAL lock_timeout='3s'` na transação de instalação).
- Revogação commitada ANTES do início da chamada é negada (42501) — coberto nos testes sintéticos para não-superadmin A/B.
- Impacto: limitado a Platform Superadmin global (catálogo global, sem tenant); janela = duração da transação concorrente.
- Proposta futura, fora deste lote por não ter sido autorizada: gate canônico antes do lock + revalidação de `catalog_metadata_require_actor` após o FOR UPDATE + lock_timeout 3s, com prova em duas conexões das duas ordens de commit.
