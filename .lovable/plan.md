# Corrigir as 6 falhas antigas de testes fiscais

## O que está acontecendo

As seis falhas não são defeitos do sistema fiscal: são testes conferindo o **arquivo de tipos errado**.

O projeto tem dois arquivos de definição de tipos do banco:

- `cultivofarm.types.ts` — o canônico, gerado a partir do banco Cultivo Farm e o único usado pelo aplicativo em execução (é ele que o cliente do banco importa).
- `types.ts` — arquivo herdado, gerado automaticamente por outro ambiente (o banco proibido), desatualizado e não importado por nenhum código do aplicativo.

Os quatro arquivos de teste que falham leem `types.ts` e, como esperado, não encontram lá o que existe só no banco correto. Verificado: `nfe_configuration`, `v_fiscal_company_readiness`, `fiscal_json_has_sensitive_key` e `jsonb_object_keys_count` aparecem no arquivo canônico (7, 3, 1 e 1 ocorrências) e zero vezes no arquivo herdado. No caso da Fase F2, o teste exige que o hook importe de `.../types`, enquanto o hook real importa — corretamente — de `.../cultivofarm.types`.

Ou seja, hoje esses testes reprovam justamente o comportamento certo.

## Correção proposta

1. Apontar os quatro testes para o arquivo de tipos canônico:
   - `src/test/fiscal/fase3_15.static.test.ts` (3 falhas)
   - `src/test/fiscal/fase3_19_2.audit.test.ts` (1 falha)
   - `src/test/fiscal/faseF2.regulatorio.test.ts` (1 falha — passa a exigir o import de `cultivofarm.types`)
   - `src/test/fiscal/sinief49/staging/verifier.test.ts` (1 falha — verificador do contrato SINIEF 49)
2. Rodar os testes e conferir que as asserções passam **por cobertura real** do contrato, e não por afrouxamento. Se alguma divergência legítima sobrar (por exemplo, uma coluna que de fato não existe no banco), ela é reportada como achado, não mascarada.
3. Adicionar um teste de guarda curto: nenhum arquivo de `src/` fora dos próprios testes pode importar de `@/integrations/supabase/types` — a fonte de tipos é sempre a canônica. Isso evita que a divergência volte.

## Detalhes técnicos

- Nenhuma alteração em código de produção, banco, RPCs, RLS ou XML. Só arquivos de teste (e um novo teste de guarda).
- `src/integrations/supabase/types.ts` é gerado automaticamente e não será editado nem removido neste trabalho.
- Três outros testes também citam `types.ts` e hoje passam (`comunicacao/fase2-schema-onfarm`, `comunicacao/fase02-static`, `financeiro/h6c.helpersAcl`, `config/cultivofarm-runtime`). Vou conferir cada um: os que usam o arquivo como *exclusão* ficam como estão; o de comunicação que lê o conteúdo para validar schema será avaliado — se estiver passando contra o arquivo errado, entra na mesma correção.
- Validação: `vitest src/test/fiscal src/test/comunicacao src/test/config src/test/financeiro`, typecheck e build.

## Resultado esperado

Bateria fiscal 100% verde, com as verificações de contrato passando contra o banco Cultivo Farm real, e uma guarda impedindo o retorno da divergência.

## Fora de escopo

Publicação, sincronização com GitHub, alterações de banco, Edge Functions e os testes de tela ponta a ponta do rascunho de NF-e.
