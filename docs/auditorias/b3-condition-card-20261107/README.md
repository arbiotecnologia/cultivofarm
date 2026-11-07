# Resumo da condição B3 — 07/11/2026

- Alteração somente de apresentação: cartão recebe condição escolhida ou `payment_condition` da simulação cercada; parcelas exibidas pelos valores exatos do cronograma, sem média.
- Fluxo obrigatório/indeterminado nunca afirma parcela única por campos legados. Modo legado permanece no caminho original.
- Tela montada com plano 1x e condição/ACK 3x a 1,8%: tabela 20, desconto 2, líquido 18, juros 0,65, total 18,65 e parcelas 6,22/6,22/6,21. Versão 1x com taxa e troca para Pix removem cronograma/total anteriores enquanto aguardam nova simulação. Nenhum criador de pedido chamado nessa regressão.
- Foco: 3 arquivos, 31 testes aprovados; reteste final: 16/16. Logs preservados; avisos React act preexistentes em casos anteriores não são prova de sessão real. Build automático OK; typecheck separado não observado, pois o ambiente veda executá-lo manualmente.
- Sessão da prévia do usuário não foi disponibilizada ao navegador automatizado (external_unmanaged, sem sessão injetada); não foi solicitado login nem alegada validação JWT/browser real. Testes montados usam transporte sintético sem acesso hospedado.
- Refinamento de nomes adiado: contrato administrativo disponível no código fornece apenas UUIDs dos parceiros. Nenhuma leitura/permissão/SQL ampliada.
- Instalação d9041a70 e piloto ARBio foram informados pelo auditor, não reproduzidos. Nenhum SQL/dado hospedado, publicação, pedido, título, fiscal ou envio alterado; PB-001036 preservado. Suíte completa não repetida.