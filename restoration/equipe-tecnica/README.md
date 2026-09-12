# Equipe Técnica (/consultor-tecnico) — riscos e scripts preparados

Status: **NÃO EXECUTADO**. Nenhum script aqui foi aplicado ao banco.

## Contrato atual observado

- Não existe tabela `consultores`. A "equipe técnica" é derivada de
  `user_roles` (papéis `tecnico_agronomo`, `consultor_tecnico`, `gestor`)
  cruzada com `profiles`.
- `profiles` no contrato tipado expõe: `id`, `user_id`, `nome`, `email`,
  `ativo`, `avatar_url`, `created_at`, `updated_at`.
- A tela exibe colunas **CREA**, **Especialidade**, **Cargo** e
  **Data de admissão**, lidas via `select("*")` e acesso `any`. Essas colunas
  **não constam no contrato tipado**, portanto a exibição depende de colunas
  possivelmente ausentes e retorna `—` sempre que não existirem.

## Bloqueios (não corrigíveis só no frontend)

1. **Cadastro/edição de consultor** — não há RPC nem tela de formulário nesta
   rota; a criação de usuário depende da Edge Function `create-user`
   (restrita a `administrador`). Manter o cadastro em Configurações > Usuários.
2. **Ativar/desativar** — `profiles.ativo` existe, mas não há RPC de mudança de
   status auditada nem política comprovada de UPDATE por gestor. Alterar direto
   pela tabela dependeria exclusivamente de confiança no frontend.
3. **Unicidade de e-mail/CPF/CREA** — sem constraint conhecida nesses campos;
   a tela agora apenas **sinaliza** duplicidade de e-mail, sem impedir.
4. **Registros órfãos** — papéis técnicos sem `profiles` correspondente são
   sinalizados na tela; a limpeza exige decisão de negócio.
5. **Vínculos com clientes/fazendas** — leitura por `user_clientes` existe;
   não há gestão de vínculo nesta rota.

## Script preparado

`01_PREPARADO_equipe_tecnica_integridade.sql` — somente diagnóstico
(idempotente, read-only) para inventariar órfãos e duplicidades antes de
qualquer decisão de correção de dados. Não executar sem autorização.
