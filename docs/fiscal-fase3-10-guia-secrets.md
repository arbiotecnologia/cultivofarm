# Fase Fiscal 3.10 — Guia não técnico para configurar o ambiente de STAGING

Este guia explica **quais dados fornecer** ao ambiente que vai rodar o pacote
`fiscal:staging:certify` e, com o mesmo cuidado, **quais dados NUNCA fornecer**
em chat, log ou repositório.

> ⚠️ Ambiente obrigatório: um **projeto Supabase descartável de STAGING**, com
> `ref` diferente do projeto de produção (`navfzbwgwzruipouyfnk`). Nada será
> executado enquanto o `ref` for o de produção.

## 1. O que é cada segredo

| Segredo | Para quê serve | Onde obter | Fornecer ao Lovable? |
|---|---|---|---|
| **Postgres URL (PGURL_STAGING)** | Conexão direta ao banco (migrations, marker, backfill, teardown). Contém senha. | Projeto Supabase de STAGING → *Project Settings → Database → Connection string → URI*. | **Nunca colar em chat.** Salvar apenas como secret no ambiente de execução. |
| **REST URL (PGREST_STAGING)** | Endpoint PostgREST do STAGING. Não contém senha. | *Project Settings → API → Project URL*, sufixado com `/rest/v1`. | Pode aparecer em log sanitizado. Ainda assim, salvar como secret. |
| **Anon key (PGREST_ANON_KEY)** | Chave **publishable** de leitura sob RLS. | *Project Settings → API → anon / publishable*. | Pode ser copiada com cuidado, mas ainda é secret. |
| **Service role key (PGREST_SERVICE_ROLE_KEY)** | Chave **administrativa** que ignora RLS. **Uso restrito a setup/teardown server-side em staging.** | *Project Settings → API → service_role*. | **Somente no ambiente que executa o pacote.** Jamais compartilhar em chat, jamais versionar. |
| **Marker `_fiscal_staging_marker`** | Sinalização em banco de que aquele projeto é STAGING. Requer coluna `project_ref` casada com `FISCAL_TEST_PROJECT_REF`. | Criado por script SQL manual (fora deste pacote). | N/A — vive no banco de staging, não é secret. |

## 2. Distinção crítica: anon × service_role

- **Anon / publishable**: chave pública. Pode ser lida por qualquer cliente.
  RLS ainda protege o dado. Serve para leitura sob usuário sintético.
- **Service role**: chave administrativa. **Ignora RLS**. Apenas o backend
  autorizado deve conhecê-la. Neste pacote ela é usada exclusivamente para
  criar/deletar as *fixtures* sintéticas de setup/teardown do harness RLS. Nunca
  deve chegar ao frontend, nunca deve ser embutida em código, nunca deve ser
  colada no chat.

## 3. Como fornecer ao Lovable

- **Nunca colar valores no chat.** Se o Lovable pedir uma chave em texto no
  chat, isso é sinal de erro — recusar e usar o formulário seguro (`add_secret`).
- Guardar os secrets no **cofre de secrets do ambiente que executa o pacote**
  (variáveis de ambiente do agente de CI ou máquina do operador). O pacote
  lê apenas `process.env`; não consulta arquivos.
- Verificar que `.env`, `.env.local` e artefatos de execução **não são
  versionados**. O relatório gerado pelo pacote é sanitizado e não contém
  valores de secret, mas o operador deve confirmar visualmente antes de
  compartilhar.

## 4. O que NUNCA fornecer

- ❌ `service_role` do projeto de produção `navfzbwgwzruipouyfnk`.
- ❌ URL de banco de produção.
- ❌ Senhas de usuários reais.
- ❌ Certificados A1/A3, arquivos `.pfx`, `.p12`, `.pem` privados.
- ❌ Tokens de provedor fiscal (nem existem ainda — o pacote é *pré*-homologação).
- ❌ Qualquer valor citado neste guia diretamente no chat, mesmo "para testar".

## 5. Passo a passo

1. **Criar projeto Supabase de STAGING** com nome que deixe claro o descarte
   (`arbio-fiscal-staging`).
2. Aplicar manualmente o SQL do marker no banco de staging:
   ```sql
   CREATE TABLE IF NOT EXISTS public._fiscal_staging_marker (
     marker      text NOT NULL,
     project_ref text NOT NULL,
     PRIMARY KEY (marker)
   );
   INSERT INTO public._fiscal_staging_marker(marker, project_ref)
   VALUES ('STAGING', '<ref-do-projeto-staging>')
   ON CONFLICT (marker) DO UPDATE SET project_ref = EXCLUDED.project_ref;
   ```
3. Configurar no ambiente de execução as variáveis:
   - `FISCAL_TEST_ENV=STAGING`
   - `FISCAL_TEST_PROJECT_REF=<ref-do-projeto-staging>`
   - `PGURL_STAGING=…` (URI completa do banco)
   - `PGREST_STAGING=https://<ref>.supabase.co/rest/v1`
   - `PGREST_ANON_KEY=…`
   - `PGREST_SERVICE_ROLE_KEY=…`
4. Rodar o **dry-run** sem `--execute`. Analisar o relatório em
   `restoration/fiscal-fase3-10/certify-report.md`.
5. Somente depois, rodar `bunx tsx scripts/fiscal-staging-certify.ts --execute`.
   Se qualquer gate falhar ou for pulado, o pacote classifica **INAPTO**.
6. Ao final, **rotacionar a senha do banco de staging** (Settings → Database
   → Reset password). Isso é obrigatório mesmo em staging, para higienizar
   qualquer resíduo de exposição durante o setup.

## 6. Rotação obrigatória de senhas já compartilhadas

Qualquer senha ou chave que tenha sido **compartilhada em chat/mensageria
durante a construção deste pacote** deve ser **rotacionada** após os testes.
Não reproduza aqui o valor antigo. Basta ir em
*Project Settings → Database / API* e clicar em *Reset* / *Rotate*. A rotação
invalida imediatamente o valor exposto.

## 7. Deploy do `fiscal-preflight` em staging

O pacote **não faz deploy automático** da função `fiscal-preflight`. Se o
operador quiser testar o gate `I` no STAGING, deve rodar manualmente:

```bash
FISCAL_TEST_ENV=STAGING \
FISCAL_TEST_PROJECT_REF=<ref-staging> \
scripts/fiscal-staging-deploy-preflight.sh --confirm
```

O script recusa qualquer execução sem `--confirm` e sem as duas variáveis, e
bloqueia refs de produção. Se essas condições não forem atendidas, o gate `I`
fica como `skipped` e a classificação final será `INAPTO` — por design.
