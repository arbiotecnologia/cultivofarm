# Vínculo canônico CultivoFarm

O frontend usa exclusivamente o cliente `src/integrations/supabase/client.ts`, com URL literal `https://swzpzcwiasxmjutrmvkm.supabase.co`, chave publicável canônica existente e `assertCanonicalSupabaseBinding` antes da criação. Nenhum banco foi consultado ou alterado.

## Contrato independente

`cultivofarm.types.ts` é uma cópia byte a byte do contrato no commit `368323086a95558ccf71ef27bc59ebbce9b6bd82`: 21.850 linhas, SHA-256 `f270cfbd1c4b42fbff928b4ad6bff351b4c37fbc135d880c8bb104ca2ac8cd41`. Os imports de produção usam essa cópia; o contrato gerenciado não é modificado nem importado.

## Proteções e limites

Testes estáticos verificam hash, linhas, cliente único, imports, variáveis ambientais e referências divergentes em produção. A guarda fiscal bloqueia qualquer ref diferente do canônico, sem carregar referências antigas no runtime. As correções de Cockpit foram preservadas.

A geração Cloud pode continuar divergindo `.env`, `types.ts` e `config.toml`; esses arquivos não determinam o destino do cliente nem seu contrato de tipos. Não foram alterados nesta entrega. Isso não corrige a associação gerenciada do Cloud nem autoriza ferramentas administrativas a acessar seu banco.

Testes não impedem uma plataforma de sobrescrever também o próprio cliente ou ignorar testes: a garantia cobre regeneração de ambiente e tipos, não alterações arbitrárias no código. Antes de publicar, executar os testes de vínculo como gate obrigatório. Nenhuma publicação foi realizada.

Typecheck e build são executados automaticamente pelo ambiente; resultados devem ser consultados no log da prévia, sem presumir aprovação de verificações anteriores.