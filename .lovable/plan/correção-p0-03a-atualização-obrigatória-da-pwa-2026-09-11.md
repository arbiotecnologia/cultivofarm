# Correção P0-03A — atualização obrigatória da PWA

## Objetivo
Impedir que uma instalação antiga continue executando um pacote conectado a banco legado, sem tocar em banco, integrações ou publicação.

## Alterações
1. Ativar tomada automática de controle do novo service worker e manter navegações em `NetworkFirst`, limpeza de caches antigos e assets com hash em `CacheFirst`.
2. Tornar a atualização obrigatória: overlay bloqueante, `SKIP_WAITING`, recarga única por troca de controlador e fallback protegido contra loops.
3. Verificar atualizações no carregamento, ao voltar à aba, ao recuperar conexão e em intervalo moderado, com limpeza de listeners e intervalos.
4. Introduzir um gate de conexão fail-closed antes da criação do cliente, aceitando somente HTTPS no host exato `swzpzcwiasxmjutrmvkm.supabase.co`; em falha, renderizar uma tela bloqueante sem revelar chaves.
5. Ampliar testes estáticos/unitários para o gate, PWA obrigatória e ausência de destinos legados em chamadas runtime.

## Validação
- Testes direcionados do binding/PWA.
- Typecheck, suíte Vitest e build completo.
- Inspeção do bundle final, com contagem dos quatro refs e classificação entre destino runtime e referência histórica/de bloqueio.
- Prévia verificada sem publicação.

## Fora do escopo
Banco, migrations, RLS, policies, grants, Storage, dados, usuários, secrets, Edge Functions, comunicação, push, emissão fiscal e publicação.
