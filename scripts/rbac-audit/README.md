# Auditoria RBAC — rotas e lançamentos por papel

Rotina automatizada que valida, **no Supabase**, se cada papel consegue acessar
as rotas e realizar os lançamentos esperados em cada portal.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `matrix.ts` | Matriz declarativa: usuários de teste, rotas auditadas (rota → tabela → portal) e lançamentos esperados por papel. |
| `run-rbac-audit.ts` | Runner: autentica cada papel, checa papel efetivo, contexto de portal, leituras por rota e capacidade de lançamento. |
| `policies-report.sql` | Relatório somente-leitura de RLS, políticas de INSERT e grants para `anon`. |
| `src/test/rbac/rbac-audit-matrix.test.ts` | Guarda de consistência entre a matriz e `src/lib/permissions.ts`. |

## Execução

```bash
RBAC_AUDIT_PASSWORD='<senha dos usuários de teste>' bun run audit:rbac
# com relatório JSON
RBAC_AUDIT_PASSWORD='...' bun run audit:rbac -- --json /tmp/rbac.json
```

Ambiente padrão: **staging `ikaauvsflpmamgxmkhoq`**. Para outro ambiente,
informe `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Produção
(`navfzbwgwzruipouyfnk`) não deve ser auditada sem autorização explícita.

Saída: `PASS` / `FAIL` / `SKIP` por checagem e código de saída `1` se houver
qualquer `FAIL` (adequado para CI).

## Como a rotina decide

- **Rotas**: se `canAccess(papel, rota)` é verdadeiro no front, o `SELECT` da
  tabela que a rota consome não pode retornar `42501` (RLS/grant). Divergência
  significa tela acessível porém sem dados.
- **Lançamentos**: um `INSERT` de sonda é enviado com todas as colunas
  obrigatórias preenchidas e **FKs inexistentes**. O PostgreSQL avalia a
  política `WITH CHECK` antes da integridade referencial, então:
  - `42501` → lançamento **bloqueado** por RLS/grant;
  - qualquer outro erro (FK, validação, trigger) → política **permitiu** a
    escrita.
  Nada é persistido; se ainda assim uma linha for criada, o runner a remove
  imediatamente.

## Execução de referência (staging, última rodada)

263 PASS · 30 FAIL. Divergências reais encontradas, para tratamento posterior:

1. **Login falhou** para `admin@arbio.com`, `gestor@arbio.com`,
   `tecnico_agronomo@arbio.com`, `financeiro@arbio.com` e `comercial@arbio.com`
   (senha divergente da usada nos demais usuários de teste).
2. **`ordens_servico`, `lotes` e `envase` aceitam INSERT de praticamente
   qualquer papel autenticado** (consultor, aplicador, produtor, parceiro B2B) —
   políticas de INSERT permissivas demais.
3. **`clientes`, `fazendas`, `talhoes`** aceitam INSERT de `administrativo`,
   que na UI tem apenas leitura.
4. **`controle_qualidade`** bloqueia `operador_onfarm` (42501), embora o
   cockpit de laboratório ofereça esse lançamento.
5. **`portal_solicitacoes`** bloqueia o `cliente_produtor` no INSERT direto
   (o fluxo real passa por RPC — confirmar se a sonda direta deve ser exceção).
6. **`partner_orders`** bloqueia `parceiro_b2b` no INSERT direto (fluxo via
   `create_partner_order_secure`).

Os itens 5 e 6 podem ser esperados quando o lançamento ocorre exclusivamente
via RPC `SECURITY DEFINER`; nesse caso, ajuste `expectedRoles` na matriz e
documente a RPC correspondente.
