# Verificação pós-publicação (somente leitura) — deployment c21d45d1

## Evidência já coletada (sem escrita, sem nova publicação)

- `https://app.cultivofarm.com.br` responde HTTP 200 com cabeçalho `x-deployment-id: psr2.c21d45d1-ce61-4e9a-ac3b-6d3705735a9a...` — o deployment solicitado está live no domínio próprio.
- `https://cultivofarm.lovable.app` responde 302 → `https://app.cultivofarm.com.br/`; serve o mesmo conteúdo por redirecionamento.
- Metadata da página: `cultivo-build-id = build-mwgkynir`; não há meta de commit. A ligação a `e19c46cd` vem só do ID de deployment informado, não de metadata.
- Assets servidos (SHA-256):
  - `index-RrPcHpxL.js` 4c964478…4ceccb
  - `App-ChfC0bPZ.js` 52b363a6…acace8a (contém a tela Configurações)
- Layout no JS publicado: seletor "Tipo de cadastro" com `grid grid-cols-1 gap-2 mt-1` (uma coluna em todas as larguras). Antes da correção (pai de `39bfbb08`) era `grid-cols-1 min-[480px]:grid-cols-3`. A lista de Perfis continua `grid-cols-1 min-[480px]:grid-cols-2`, igual à fonte.
- `e19c46cd` contém a mesma classe corrigida (linha 846).
- Observação: o HEAD local atual (`01a21a75`, merge do PR GitHub `primeiro-acesso-parceiro`) não descende de `e19c46cd` (base comum `00564ff4`). O que foi publicado e o repositório local divergem; vale conferir antes de publicar de novo.

## Passo restante (após aprovação)

1. Playwright headless carregando os assets reais de `app.cultivofarm.com.br` em 390x844, 464x522 e 1440x900.
2. Sem sessão real: para abrir Configurações > Novo Usuário, interceptar apenas no navegador do teste as chamadas Supabase (Auth/RPC) com respostas sintéticas de administrador; bloquear qualquer escrita (POST/PATCH/DELETE abortados) e não enviar formulário.
3. Medir, em cada largura, a posição das 3 opções de tipo (mesmo `left`, `top` crescente = 1 coluna), ausência de rolagem horizontal e de cortes; capturar telas em `/tmp/browser/postpub/`.
4. Relatório: hashes, cabeçalhos, medições, distinção explícita "assets reais + sessão simulada", sem JWT/RLS/dados reais.

Nada é gravado no projeto além deste plano; nenhuma publicação.
