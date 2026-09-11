# Plano de hardening — ondas, gates e critérios de aceite

Status: **aguardando inventário**. As ondas abaixo estão definidas em escopo,
ordem e critério; o SQL concreto de cada uma só é escrito com o inventário real
em mãos.

## Ordem de execução (fail-fast; cada onda tem forward + rollback + pós-check)

| Onda | Escopo | Depende do inventário |
| --- | --- | --- |
| H1 | Habilitar RLS em toda tabela exposta sem RLS em `public`/`private` | lista do bloco 1 |
| H2 | Policies mínimas por perfil/organização/ownership, usando `public.has_role` e colunas canônicas de posse | blocos 1, 2 |
| H3 | Revogar `anon`/`authenticated` indevidos em dados pessoais, financeiros, auditoria, notificações e documentos | bloco 3 |
| H4 | Views: `security_invoker=true` quando compatível; quando não, revogar acesso público e documentar a razão | bloco 4 |
| H5 | Funções `SECURITY DEFINER`: `search_path` fixo, checagem explícita de auth/role/escopo, `REVOKE EXECUTE FROM PUBLIC, anon, authenticated` salvo RPC pública comprovada | bloco 5 |
| H6 | Storage: buckets privados por padrão, policies por ownership | bloco 7 |

## Invariantes de escrita

- Guarda de alvo no topo de todo forward:

```sql
DO $$
BEGIN
  IF coalesce(current_setting('hardening.target_ref', true),'') <> 'swzpzcwiasxmjutrmvkm' THEN
    RAISE EXCEPTION 'ABORT: alvo nao e o CultivoFarm.';
  END IF;
END $$;
```

- Idempotência: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` é repetível;
  policies usam `DROP POLICY IF EXISTS` seguido de `CREATE POLICY`.
- Todo `UPDATE` em policy recebe `USING` **e** `WITH CHECK`, com o `SELECT`
  correspondente, para não criar bloqueio silencioso.
- Toda tabela em `public` mantém os `GRANT` compatíveis com suas policies;
  RLS sem grant derruba o aplicativo.
- Autorização apenas por `public.user_roles` / `public.has_role`. Nunca
  `auth.jwt() -> 'user_metadata'`.

## Gates de aceite (todos obrigatórios)

1. Scanner/advisor do CultivoFarm: **0 achados Critical**.
2. Nenhum acesso `anon` a dados pessoais, financeiros, auditoria,
   notificações, documentos ou Storage privado.
3. Harness em três perfis — anônimo, autenticado sem papel e `administrador` —
   com resultado esperado por tabela.
4. Testes de RLS/IDOR: um usuário não alcança linhas de outra organização.
5. Login de `admin@arbio.com` íntegro e smoke somente leitura em painel,
   clientes, financeiro, configurações e fiscal.
6. `tsgo --noEmit`, Vitest e `bun run build` verdes.
7. Emissão fiscal permanece desativada; certificados e secrets intocados.
8. Rollback disponível e testado em dry-run transacional.

## Parada obrigatória

Qualquer ambiguidade que possa bloquear usuário legítimo — coluna de posse
indefinida, tabela sem vínculo claro de organização, RPC pública sem prova de
intenção — interrompe a onda e volta como pergunta, sem aplicar correção
genérica.
