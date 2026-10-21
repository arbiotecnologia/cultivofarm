# Reversão estrutural — SOMENTE DOCUMENTAÇÃO (nunca executar automaticamente)

A reversão estrutural da candidata de rótulos **não é um script executável**. Restaurar o
CHECK literal `produtos_classe_catalogo_coerente_check` congelaria novamente a lista de
rótulos e invalidaria silenciosamente rótulos cadastrados depois da instalação. Por isso:

1. **Reversão preferida (frontend):** aplicar `frontend-safe-reversal.patch`, que devolve os
   consumidores ao comportamento anterior **mantendo** a validação no servidor. Nenhum dado
   ou permissão é alterado.
2. **Contenção sem desinstalação:** inativar rótulos problemáticos via
   `platform_set_catalog_label_active` (com motivo e auditoria). Atribuições existentes são
   preservadas por contrato.
3. **Desinstalação estrutural** exige decisão humana registrada, backup comprovado e
   migration nova, revisada e independente, que: recrie o CHECK literal somente após provar
   que nenhum rótulo fora da lista original está atribuído; remova trigger, RPCs e tabela;
   e restaure a whitelist de auditoria. Este documento **não** fornece esse SQL.

Baseline histórica para comparação: saída de `preflight.sql` arquivada pelo operador.
