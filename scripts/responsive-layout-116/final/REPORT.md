# Fechamento concreto — 00564ff4

## Reconciliação dos 116
- **88** com geometria/conteúdo/último controle comprovados para o conjunto declarado de perfis de ação, qualificado pela cadeia estática de consumidor.
- **16** com geometria comprovada, mas cadeia/contexto/capacidade ainda não integralmente resolvidos: **3, 6, 7, 9, 13, 26, 37, 38, 42, 53, 54, 87, 88, 89, 90, 115**.
- **11 N/A**: nove anteriores preservados; #48/#49 agora classificados por gates originais fechados `canEditFull=false`, não por “montou via props”.
- **1 caso especial #116**: seletor staff corrigido e troca validada em montagem original isolada; o **B2BRouteGuard original nega entrada staff**. Não ampliar esse guard: a correção visual não representa liberação de navegação integral.

Total: **116**, numeração preservada. Completa aqui significa cobertura local do controle na matriz, não todas as variantes, sessão real, RLS, RPC ou Storage de produção.

## Evidências novas e reaproveitadas
61 cadeias por família em **final/CHAINS.json**, com controle, consumidor, linha de rota, guard, gate e indicação de evidência browser reaproveitada. Nos consumidores sem gate de papel local, a cadeia qualifica a leitura/controle já montado; não autoriza mutação. Gates de salvar/aprovar não foram transferidos para filtros/diálogos de consulta.

**142 cenários browser novos: 140 positivos, dois negativos do superadmin na rota tenant fiscal.** Esses dois eram perfis indevidamente atribuídos, não defeito visual. **270 comparações** dos quinze perfis em 390×844/1440×900 nos guards/consumidores originais; resultados inconclusivos são registrados como indisponíveis, nunca como acesso negado. Fixtures sem contexto técnico fresco explicam quatro indisponibilidades do guard técnico; B2B tem três indisponibilidades e negação explícita para staff. Isto é evidência sintética, não produção.

- #17: confirmação com OS/reserva contextualizadas, oito perfis leitores × duas larguras, sem gravar entrega.
- #52: cinco perfis de visita, tabs reais/registro existente.
- #73: seis perfis leitores, foto sintética ampliada; bytes interceptados localmente, sem Storage real.
- #75: oito perfis leitores, trigger Evidências da entrega.
- #80/#83: admin/gestor; leitores não podem abrir criação.
- #97: admin/gestor. O mount anterior de gestor comercial é descartado como prova de entrada: **Clientes.tsx:17,49** não monta Produtores para esse papel. Teste consumidor com quinze perfis registra isso.
- #100: cartão mobile de pedido clicado, tabela desktop separada, admin/gestor comercial.
- #101: admin/gestor/financeiro; superadmin não acessa essa rota tenant; contexto plataforma não é equivalente.
- #88: botão **Voltar**, não aprovação; geometria isolada aproveitada, contexto técnico ainda condicionado ao guard original.
- #84/#85: **Entr. → Saldo a entregar (estoque reservado)**; digitar/limpar cada filtro, leitura positiva de produto/cliente reservados após limpar, sete perfis × duas larguras: **28 PASS**. Não era código morto.

## Correção #116
Único seletor “Ver como” deixou de ser `hidden sm:flex`: visível e compacto em 390px, rótulo acessível, nome completo nas opções com quebra e no estado selecionado abaixo. Seleção dos dois parceiros com razões sociais extensas comprovada para admin e gestor comercial em celular/desktop. Quatro cenários positivos em final/gap-116.json. Captura mobile revisada visualmente. `isStaff`, consulta habilitada apenas staff e `setSimulatedId` preservados.

**Limite real encontrado:** rota externa `/portal-parceiro/*` passa por B2BRouteGuard, que exige escopo externo exclusivo parceiro. Staff não atravessa essa guarda no código atual. Não modificar permissão para fazer teste passar; geometria isolada identificada como tal no MATRIX.

## Testes e publicação
Regressão de portal/navegação: **35/35 em quatro arquivos** (`final/regression.log/.exit`). Bateria ampliada: **238/238 em 16 arquivos** (`final/regression-expanded.log/.exit`). Último sinal automático consultado: build OK às **15:16:38Z**. Typecheck independente não executado, não certificado separadamente. Sem SQL, dados reais, mudanças de papéis, capacidades, gates ou publicação. Auditoria exclusivamente em scripts.

## Reprodução
- `python3 scripts/responsive-layout-116/final/priority.py 0|1|2`
- `python3 scripts/responsive-layout-116/final/filters.py 0|1|2`
- `python3 scripts/responsive-layout-116/final/cadastros.py 0|1|2`
- `python3 scripts/responsive-layout-116/final/guards.py 0|1|2`
- `python3 scripts/responsive-layout-116/final/partner_pdf.py 0`
- `python3 scripts/responsive-layout-116/final/trace_chains.py`
- `python3 scripts/responsive-layout-116/final/consolidate.py`

Requer harness local previamente preparado em /tmp/browser/responsive-116; `closure/prepare-exact.cjs` recompõe marcadores estritos a partir do Vite, sem editar JSX do produto. Drivers usam componentes originais/props contextualizadas e interceptação local; toda rede externa abortada, salvo bytes técnicos sintéticos interceptados. Registros iniciais inconclusivos preservados com prefixo initial. Logs de regressão contêm comandos/suites e saída. MATRIX registra artefatos por cenário, perfis excluídos e cadeia; sem evidência inline extensa.
