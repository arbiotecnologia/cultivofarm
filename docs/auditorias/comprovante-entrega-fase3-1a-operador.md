# Fase 3.1.A — Nome amigável do operador no Comprovante de Entrega

Status desta etapa: **APTA (BACKEND AGUARDANDO BINDING)**

## 1. Diagnóstico funcional
O campo "Registrado no sistema por" do Romaneio/Comprovante era alimentado por
`recebimento.confirmado_por`, que carrega o identificador técnico (UUID) do usuário
interno — impróprio para documento apresentado ao cliente.

Origem do UUID: `public.entregas.confirmado_por` (com fallbacks legados
`confirmada_por` e `recebimento_confirmado_por`), serializado por
`public.fn_comprovante_entrega_montar_v1` no bloco `recebimento`.

Estrutura reutilizável para o nome amigável: `public.profiles.nome`, ligada por
`profiles.user_id = auth.uid()`. Não há necessidade de nova tabela de usuários.

## 2. Bloqueio de ambiente (motivo de NÃO estar apta)
O conector interno de banco (migration / read_query / psql do sandbox) está
apontando para um projeto **diferente** do staging autorizado:

- Projeto detectado pelo conector: `yzszlzjpovmcteuxjznj` (projeto Cloud vazio —
  `information_schema` sem `public.entregas` e sem `public.profiles`).
- Staging autorizado e certificado no histórico: `ikaauvsflpmamgxmkhoq`.

Duas tentativas de migration falharam exatamente por isso:

1. `ERROR: 42883: function public.fn_os_assert_staging_exato() does not exist`
2. `ERROR: 42P01: relation "public.entregas" does not exist`

Ou seja: o guard de ambiente funcionou como projetado e impediu escrita fora do
staging. **Nenhuma alteração de schema foi aplicada.** Nenhum acesso à produção
`navfzbwgwzruipouyfnk` foi realizado; nada foi publicado; SEFAZ não foi acionado.

Efeito colateral do conector: a plataforma regenerou `.env` e
`src/integrations/supabase/types.ts` (reduzido a 155 linhas) para o projeto errado.
Ambos foram restaurados a partir do commit certificado `ec4801cb`
(`types.ts` = 21.850 linhas, binding = `ikaauvsflpmamgxmkhoq`).

## 3. O que foi efetivamente alterado nesta etapa
Somente frontend, sem tocar banco/migrations/RPC/RLS:

- `src/lib/comprovanteEntregaPdf.ts`
  - novo helper puro `nomeOperadorDocumento(recebimento)`;
  - o campo "Registrado no sistema por" passa a ler `confirmado_por_nome`;
  - qualquer valor em formato UUID é bloqueado na renderização;
  - fallback neutro `—` para snapshots históricos sem o campo.

## 4. Backend planejado (NÃO aplicado)
`CREATE OR REPLACE FUNCTION public.fn_comprovante_entrega_montar_v1` acrescentando
ao bloco `recebimento`:

- `confirmado_por_id` (UUID preservado para auditoria interna);
- `confirmado_por_nome` (resolvido via `public.profiles`).

Sem alteração de numeração CE, hash, contador de reemissão, regras Romaneio ×
Comprovante, estoque, produção, financeiro, fiscal, pedidos, OS ou QR Code.

## 5. Snapshots históricos
Nenhum backfill. Snapshots congelados permanecem imutáveis e, por não possuírem
`confirmado_por_nome`, passam a exibir `—` em vez de UUID — correção puramente de
exibição, sem reescrita de documento histórico.

## 6. Riscos residuais
- O binding do conector de banco continua divergente; qualquer nova tentativa de
  migration sem correção do conector atinge o projeto errado.
- Enquanto a função não for aplicada no staging, todo comprovante exibirá `—` no
  campo do operador (comportamento seguro, porém incompleto).

## 7. Veredito

FASE_3_1A_APTA_COM_RESSALVAS (Aguardando binding do conector para aplicar migration no staging)
