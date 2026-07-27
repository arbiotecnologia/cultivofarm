## Diagnóstico

Consulta em `auth.users` no staging `ikaauvsflpmamgxmkhoq` confirma: **o usuário `admin@arbio.com` não existe**. Só há os seeds `tecnico_agronomo@`, `gestor@`, `comercial@` e `financeiro@arbio.com`. Por isso o Supabase retorna `invalid_credentials` (400) — não é senha errada, é usuário inexistente. Ele foi criado em uma sessão anterior porém no banco de produção (proibido) ou em um snapshot que não sobreviveu. Preciso recriá-lo em staging.

## Plano

### 1. Recriar `admin@arbio.com` em staging (`ikaauvsflpmamgxmkhoq`)
- Inserir usuário em `auth.users` com senha `Bio#2026` (hash bcrypt via `crypt`), `email_confirmed_at=now()`, provider `email`.
- Inserir linha em `public.profiles` (`nome='Administrador'`, `ativo=true`, `email='admin@arbio.com'`).
- Inserir linha em `public.user_roles` com `role='administrador'`.
- Idempotente: usa `ON CONFLICT DO NOTHING` / verificação prévia.
- Produção `navfzbwgwzruipouyfnk` permanece intocada.

### 2. Toggle mostrar/ocultar senha no login (`src/pages/Auth.tsx`)
- Adicionar estado `showPassword`.
- Trocar `type="password"` por `type={showPassword ? "text" : "password"}`.
- Botão ícone (`Eye`/`EyeOff` do lucide-react) posicionado dentro do input à direita, seguindo o mesmo padrão já usado em `src/pages/app/MobileLogin.tsx` (consistência visual).
- Apenas mudança de UI/apresentação; nenhum efeito em lógica de auth.
- `MobileLogin.tsx` já tem o toggle — nenhuma mudança lá.

## Detalhes técnicos

SQL (via `supabase--insert`, aplicado somente em `ikaauvsflpmamgxmkhoq`):
```sql
-- cria user em auth.users com senha bcrypt
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) VALUES (
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated','authenticated',
  'admin@arbio.com', crypt('Bio#2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"nome":"Administrador"}'::jsonb, false
) ON CONFLICT (email) DO NOTHING;

-- profile + role
INSERT INTO public.profiles (user_id, nome, email, ativo)
SELECT id, 'Administrador', 'admin@arbio.com', true FROM auth.users WHERE email='admin@arbio.com'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'administrador' FROM auth.users WHERE email='admin@arbio.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

Credenciais finais: `admin@arbio.com` / `Bio#2026`.

## Validação
- Consultar `auth.users` + `profiles` + `user_roles` para confirmar criação.
- `tsgo --noEmit` e `bun run build` após a edição do `Auth.tsx`.
- Sem alterações de RLS, edge functions, flags ou produção.
