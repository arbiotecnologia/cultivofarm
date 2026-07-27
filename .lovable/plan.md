## Plano confirmado

Você confirmou (1) o Disconnect do Lovable Cloud e (2) forneceu a publishable key do `navfzbwgwzruipouyfnk`.

## Passos que executarei ao aprovar

1. Reescrever `.env` para apontar ao Supabase externo:
   ```
   VITE_SUPABASE_PROJECT_ID="navfzbwgwzruipouyfnk"
   VITE_SUPABASE_URL="https://navfzbwgwzruipouyfnk.supabase.co"
   VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_NPwB2bQXR7ZbgSF5zXXuqQ_PW-C8QFh"
   ```
2. Restaurar `src/integrations/supabase/types.ts` a partir da versão anterior (a última gerada contra o schema real do `navfzbwgwzruipouyfnk`, antes do Cloud sobrescrever o arquivo). Uso o histórico do arquivo no repositório para isso — não regenero via ferramenta do Cloud, senão ele reescreve zerado de novo.
3. Rodar `tsgo --noEmit` e `vite build` para provar que os ~centenas de erros `never` sumiram.
4. Reportar resultado.

## Sua parte (fora das minhas ferramentas)

- **Connectors → Lovable Cloud → Disable Cloud** (impede Cloud automático em futuros projetos).
- **Cloud → Advanced → Disconnect** neste projeto (admin do workspace). Lembre: é irreversível e apaga o backend Cloud — no seu caso está vazio, então sem perda real. Pode fazer antes ou depois dos meus passos; o runtime já vai apontar ao Supabase certo assim que eu editar o `.env`.

## O que NÃO farei

- Nenhuma migration, nem no Cloud, nem no `navfzbwgwzruipouyfnk`.
- Não mexer em `supabase/config.toml` além do project_id se necessário.
- Não imprimir/gravar service role, DSN, tokens ou senhas.

Aprove para eu executar.