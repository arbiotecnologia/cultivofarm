# Etapa posterior — criação do único usuário `admin@arbio.com`

Só executar **depois** de os pós-checks da promoção estrutural passarem
(`24-postchecks-readonly.sql`). Nenhum usuário é migrado do AR Bio: contas,
senhas e identidades antigas ficam fora do escopo.

Alvo único: **`swzpzcwiasxmjutrmvkm`**. Nenhuma outra base pode ser tocada.

## 1. Criar a conta pelo painel de autenticação do projeto CultivoFarm

- E-mail: `admin@arbio.com`
- Senha: definida pelo responsável, **nunca** registrada em arquivo, log,
  dossiê, commit ou mensagem de chat.
- Confirmar e-mail manualmente na criação; não habilitar cadastro anônimo.

Não usar SQL de `INSERT` direto em `auth.users`: a criação precisa passar pela
API de autenticação para gerar identidade e hash corretos.

## 2. Conceder o papel administrativo

O papel vive na tabela dedicada de papéis (nunca no perfil). Executar apenas
após a conta existir, substituindo `<UUID>` pelo id real retornado pelo painel:

```sql
SET promocao.target_ref = 'swzpzcwiasxmjutrmvkm';

-- Confirme o id antes de inserir.
SELECT id, email FROM auth.users WHERE email = 'admin@arbio.com';

INSERT INTO public.user_roles (user_id, role)
VALUES ('<UUID>', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

Se o projeto exigir uma linha de perfil, criá-la em seguida com os campos
mínimos, sem copiar dados do ambiente antigo.

## 3. Verificação somente leitura

```sql
SELECT count(*) AS total_usuarios FROM auth.users;                     -- esperado: 1
SELECT u.email, r.role
  FROM auth.users u JOIN public.user_roles r ON r.user_id = u.id;      -- admin@arbio.com / admin
```

## 4. Critério de aceite

- Exatamente **um** usuário no projeto.
- Exatamente **um** papel `admin`, ligado a `admin@arbio.com`.
- Login funcional pela interface, com acesso administrativo.
- Nenhum outro usuário, convite pendente ou provedor social ativado nesta etapa.

## 5. Ambiguidades que exigem decisão humana

- Nome da tabela e do enum de papéis no destino precisam ser confirmados contra
  o schema efetivamente promovido antes de rodar o `INSERT`.
- Se o pacote estrutural criar um gatilho que popula perfis automaticamente, o
  passo de perfil manual deve ser suprimido para não duplicar linhas.
