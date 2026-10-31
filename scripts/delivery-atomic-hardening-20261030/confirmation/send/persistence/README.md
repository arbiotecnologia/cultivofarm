# Enviar — retenção durável da tentativa (somente preparação)

Base: `8d276bea`. Sem hosted, sem SQL, sem implantação/publicação, sem cobrança/fiscal/automações. Nenhum pacote liberado; release Enviar continua NO-GO.

## O que mudou (frontend)
- `src/lib/entregas/deliverySendPersistence.ts`: registro `cf:delivery-send:v1:<ator>:<empresa>:<entrega>` com exatamente `v=1, schema=delivery_send_attempt, actor, org, entrega, os, observed, key`. Sem JWT, senha, arquivo ou PII.
- Parse estrito: conjunto exato de campos, versão/schema, UUIDs não nulos, timestamp com fuso, slot coerente com o conteúdo e serialização canônica idêntica. Qualquer divergência = corrompido → envios bloqueados, nada apagado.
- Persistência ocorre de forma síncrona imediatamente antes do writer, após preflight de capability fresco; leitura de verificação obrigatória. Falha de get/set/read-back → nenhum writer.
- Concorrência entre abas: Web Locks API (`navigator.locks`, exclusivo, `ifAvailable`) por ator+empresa, mantido do re-read do storage até o transporte terminar (inclusive após timeout de UI). localStorage nunca é tratado como lock. Sem Web Locks → envio recusado antes de qualquer chamada (bloqueio explícito seguro).
- Registro existente diferente nunca é sobrescrito; com tentativa retida no escopo, nova chave é recusada ("Reconcilie somente o mesmo envio pendente.").
- Remoção só do registro exato, após ACK validado e contexto atual. Falha de remoção mantém o registro e avisa; reconciliação seguinte usa a mesma chave.
- Após reload: carregados somente registros do ator+empresa atuais; reconciliação exige clique (sem replay automático) e capability/autoridade fresca do servidor. Registros de outro ator/empresa ficam intactos e invisíveis.
- Terminal: consulta/recusa, sem mutação nova.

## Evidências (`evidence/*.log.txt`, brutas)
- `send-persistence-focused.log.txt`: 30/30 (11 unitários + 19 montados com QueryClient real).
- `vitest-regression.log.txt`: entregas+envase+etiquetas+estoque: 700 passaram, 5 falharam.
- `estoque-baseline-8d276bea.log.txt`: as mesmas 5 falhas reproduzidas com `Entregas.tsx` da base `8d276bea` → preexistentes (testes estáticos de estoque que buscam padrões antigos em `Entregas.tsx`). Não corrigidas aqui; não ocultadas.
- `typecheck.log.txt`: `tsgo --noEmit -p tsconfig.app.json` exit 0, 0 erros.
- `frontend.diff.txt`: diff real contra `8d276bea`.

## Limites honestos
- "Reload" e "duas abas" são simulados em jsdom (unmount/remount; storage compartilhado; Web Locks falso). Não provam comportamento de navegador real nem JWT/RLS hosted.
- Timeout de 30 s não foi reexecutado com timers reais neste recorte; coberto pelo teste existente de timeout + teste de ACK tardio após reload com lock mantido.
- PG/hosted não foram reexecutados (sem mudança SQL).
