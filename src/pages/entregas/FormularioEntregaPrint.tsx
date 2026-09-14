import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeComprovante } from "@/components/entregas/QRCodeComprovante";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateDisplay, formatDateTimeDisplay } from "@/lib/date-utils";
import { labelModalidade, labelResponsavel } from "@/lib/entregas/modalidade";

const TERMO = `Declaro, para os devidos fins, que recebi da AR Bio os produtos/bioinsumos descritos neste formulário, conferi as quantidades, identificação dos produtos, lotes, volumes e condições aparentes das embalagens no ato do recebimento. Declaro estar ciente de que o armazenamento, manuseio e aplicação devem seguir as orientações técnicas fornecidas pela AR Bio, respeitando as condições adequadas de conservação e utilização. Eventuais divergências identificadas no recebimento deverão ser registradas neste documento no campo de observações/ressalvas.`;

const NAO_INFORMADA = "Não informada";

/** Colunas reais do banco: clientes.cpf_cnpj/endereco_municipio/endereco_estado,
 *  fazendas.municipio/estado, lotes.data_producao (não existe data_validade). */
const SELECT_ENTREGA =
  "*, clientes(nome,cpf_cnpj,endereco_municipio,endereco_estado), produtos(nome), lotes(codigo_lote,data_producao), ordens_servico(id,numero_os, fazendas(nome,municipio,estado))";

export default function FormularioEntregaPrint() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const viasParam = Number.parseInt(searchParams.get("vias") ?? "", 10);
  const vias = viasParam === 2 ? 2 : 1;

  useEffect(() => { document.title = "Formulário de Entrega — AR Bio"; }, []);

  const entregaQuery = useQuery({
    queryKey: ["entrega-full", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entregas")
        .select(SELECT_ENTREGA)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const comprovanteQuery = useQuery({
    queryKey: ["entrega-comprovante-print", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_comprovantes" as any)
        .select("*")
        .eq("entrega_id", id!)
        .order("gerado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  const embalagensQuery = useQuery({
    queryKey: ["entrega-embalagens-print", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estoque_embalagens")
        .select("id, codigo_embalagem, volume, unidade, validade_em, status, etiqueta_id, lote_id, produto_id, lotes(codigo_lote), produtos(nome), produto_etiquetas:etiqueta_id(codigo_etiqueta)")
        .eq("entrega_id", id!)
        .order("codigo_embalagem", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  // Aberto em nova aba não há histórico: sempre volta para a lista de entregas.
  const voltar = () => navigate("/entregas");

  const Moldura = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="max-w-[800px] mx-auto p-4">
        <div className="mb-3 print:hidden">
          <Button variant="outline" size="sm" onClick={voltar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>
        <div className="bg-white p-8 shadow text-sm text-slate-900">{children}</div>
      </div>
    </div>
  );

  if (!id) {
    return <Moldura><p data-testid="formulario-ausente">Entrega não informada.</p></Moldura>;
  }

  const carregando = entregaQuery.isLoading || comprovanteQuery.isLoading || embalagensQuery.isLoading;
  const falhou = entregaQuery.isError || comprovanteQuery.isError || embalagensQuery.isError;

  if (carregando) {
    return (
      <Moldura>
        <p data-testid="formulario-carregando" className="text-muted-foreground">Carregando…</p>
      </Moldura>
    );
  }

  if (falhou) {
    return (
      <Moldura>
        <div data-testid="formulario-erro" className="space-y-3">
          <p className="font-semibold">Não foi possível carregar o formulário desta entrega.</p>
          <p className="text-muted-foreground text-xs">
            A impressão fica bloqueada até que os dados sejam carregados por completo.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void entregaQuery.refetch();
              void comprovanteQuery.refetch();
              void embalagensQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </Moldura>
    );
  }

  const entrega = entregaQuery.data;
  const comprovante = comprovanteQuery.data;
  const embalagens = embalagensQuery.data ?? [];

  if (!entrega) {
    return (
      <Moldura>
        <p data-testid="formulario-entrega-ausente">
          Entrega não encontrada ou sem permissão de acesso.
        </p>
      </Moldura>
    );
  }

  if (!comprovante) {
    return (
      <Moldura>
        <p data-testid="formulario-nao-gerado">
          O formulário de entrega ainda não foi gerado. Gere o formulário na tela de entregas para poder imprimi-lo.
        </p>
      </Moldura>
    );
  }

  const cliente = entrega.clientes;
  const fazenda = entrega.ordens_servico?.fazendas;

  const viasArr = Array.from({ length: vias }, (_, i) => i);
  const labelVia = (i: number) => {
    if (vias === 1) return null;
    return i === 0 ? "1ª Via — Cliente / Recebedor" : "2ª Via — AR Bio (cópia interna)";
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="max-w-[800px] mx-auto p-4 print:p-0">
        <div className="flex flex-wrap gap-2 mb-3 print:hidden">
          <Button variant="outline" size="sm" onClick={voltar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          <Button
            size="sm"
            variant={vias === 2 ? "default" : "outline"}
            onClick={() => {
              const next = vias === 2 ? "1" : "2";
              setSearchParams((sp) => {
                sp.set("vias", next);
                return sp;
              });
            }}
            title="Alternar entre 1 e 2 vias (cliente + AR Bio)"
            data-testid="formulario-vias"
          >
            <Copy className="h-4 w-4 mr-1" /> {vias === 2 ? "2 vias" : "1 via"}
          </Button>
        </div>

        {viasArr.map((idx) => (
        <div
          key={idx}
          className={`bg-white p-8 print:p-6 shadow print:shadow-none text-[12px] leading-relaxed text-slate-900 ${idx > 0 ? "mt-4 print:mt-0 print:break-before-page" : ""}`}
        >
          {labelVia(idx) && (
            <div className="mb-3 inline-block bg-slate-900 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              {labelVia(idx)}
            </div>
          )}
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3">
            <div>
              <div className="text-xl font-bold">AR Bio</div>
              <div className="text-[10px] text-slate-600">Bioinsumos com rastreabilidade</div>
              <div className="mt-2 text-[14px] font-bold uppercase">Formulário de Entrega e Termo de Recebimento de Bioinsumos</div>
              <div className="text-[10px] mt-1">Nº <span className="font-mono">{comprovante.numero_formulario}</span> · Emitido em {formatDateTimeDisplay(comprovante.gerado_em)}</div>
            </div>
            <QRCodeComprovante validationToken={comprovante.validation_token} size={90} showActions={false} />
          </div>

          {/* Destinatário */}
          {(() => {
            const nome = entrega.destinatario_nome || cliente?.nome || "—";
            const tel = entrega.destinatario_telefone;
            const wa = entrega.destinatario_whatsapp;
            const enderecoLinhas = [
              [entrega.endereco_logradouro, entrega.endereco_numero].filter(Boolean).join(", "),
              entrega.endereco_complemento,
              entrega.endereco_bairro,
              [entrega.endereco_cidade, entrega.endereco_uf].filter(Boolean).join("/"),
              entrega.endereco_cep,
            ].filter(Boolean).join(" · ");
            const municipio = fazenda?.municipio || cliente?.endereco_municipio || "—";
            const estado = fazenda?.estado || cliente?.endereco_estado || "—";
            const enderecoFallback = `${fazenda?.nome ? fazenda.nome + " · " : ""}${municipio}/${estado}`;
            const enderecoOverride = entrega.endereco_origem === "personalizado";
            return (
              <>
                <section className="mt-4">
                  <h2 className="font-bold text-[13px] mb-1">Destinatário</h2>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><b>Nome:</b> {nome}</div>
                    <div><b>CPF/CNPJ:</b> {cliente?.cpf_cnpj || "—"}</div>
                    <div><b>Telefone:</b> {tel || "—"}</div>
                    <div><b>WhatsApp:</b> {wa || "—"}</div>
                  </div>
                </section>

                <section className="mt-3">
                  <h2 className="font-bold text-[13px] mb-1">
                    Endereço de entrega
                    {enderecoOverride && (
                      <span className="ml-2 inline-block text-[9px] font-semibold uppercase tracking-wider text-amber-700 border border-amber-500 rounded px-1.5 py-0.5">
                        Específico desta entrega
                      </span>
                    )}
                  </h2>
                  <div>{enderecoLinhas || enderecoFallback}</div>
                  {entrega.endereco_referencia && (
                    <div className="mt-1"><b>Referência:</b> {entrega.endereco_referencia}</div>
                  )}
                </section>
              </>
            );
          })()}

          {/* Entrega */}
          <section className="mt-3">
            <h2 className="font-bold text-[13px] mb-1">Dados da Entrega</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <div><b>OS:</b> {entrega.ordens_servico?.numero_os || "—"}</div>
              <div><b>Modalidade:</b> {labelModalidade(entrega.tipo_entrega)}</div>
              <div><b>Data prevista:</b> {entrega.data_saida ? formatDateDisplay(entrega.data_saida) : "—"}
                {entrega.hora_saida_prevista ? ` às ${entrega.hora_saida_prevista}` : ""}
              </div>
              <div><b>Chegada prevista:</b> {entrega.data_chegada_prevista ? formatDateDisplay(entrega.data_chegada_prevista) : (entrega.data_saida ? formatDateDisplay(entrega.data_saida) : "—")}
                {entrega.hora_chegada_prevista ? ` às ${entrega.hora_chegada_prevista}` : ""}
              </div>
              <div><b>{labelResponsavel(entrega.tipo_entrega)}:</b> {entrega.motorista || "—"}
                {entrega.motorista_telefone ? ` · ${entrega.motorista_telefone}` : ""}
                {entrega.motorista_documento ? ` · Doc ${entrega.motorista_documento}` : ""}
              </div>
              <div><b>Veículo:</b> {entrega.veiculo || "—"}
                {entrega.veiculo_placa ? ` · ${entrega.veiculo_placa}` : ""}
                {entrega.veiculo_tipo ? ` · ${entrega.veiculo_tipo}` : ""}
              </div>
            </div>
          </section>

          {/* Itens */}
          <section className="mt-3">
            <h2 className="font-bold text-[13px] mb-1">Itens Entregues</h2>
            <table className="w-full border border-slate-400 text-[11px]">
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-400 p-1 text-left">Produto</th>
                  <th className="border border-slate-400 p-1 text-left">Lote</th>
                  <th className="border border-slate-400 p-1 text-right">Quantidade</th>
                  <th className="border border-slate-400 p-1 text-right">Volume (mL)</th>
                  <th className="border border-slate-400 p-1 text-left">Produção</th>
                  <th className="border border-slate-400 p-1 text-left">Validade</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-400 p-1">{entrega.produtos?.nome || "—"}</td>
                  <td className="border border-slate-400 p-1 font-mono">{entrega.lotes?.codigo_lote || "—"}</td>
                  <td className="border border-slate-400 p-1 text-right">{entrega.quantidade_entregue ?? "—"}</td>
                  <td className="border border-slate-400 p-1 text-right">{entrega.volume_entregue_ml ?? "—"}</td>
                  <td className="border border-slate-400 p-1">{entrega.lotes?.data_producao ? formatDateDisplay(entrega.lotes.data_producao) : "—"}</td>
                  {/* Não há validade no lote: só é impressa quando vem da embalagem rastreada. */}
                  <td className="border border-slate-400 p-1">{NAO_INFORMADA}</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Embalagens vinculadas */}
          {embalagens.length > 0 && (
            <section className="mt-3">
              <h2 className="font-bold text-[13px] mb-1">Embalagens vinculadas ({embalagens.length})</h2>
              <table className="w-full border border-slate-400 text-[11px]">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-400 p-1 text-left">Código embalagem</th>
                    <th className="border border-slate-400 p-1 text-left">Etiqueta</th>
                    <th className="border border-slate-400 p-1 text-left">Lote</th>
                    <th className="border border-slate-400 p-1 text-left">Produto</th>
                    <th className="border border-slate-400 p-1 text-right">Volume</th>
                    <th className="border border-slate-400 p-1 text-left">Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {embalagens.map((emb: any) => (
                    <tr key={emb.id}>
                      <td className="border border-slate-400 p-1 font-mono">{emb.codigo_embalagem}</td>
                      <td className="border border-slate-400 p-1 font-mono">{emb.produto_etiquetas?.codigo_etiqueta || "—"}</td>
                      <td className="border border-slate-400 p-1 font-mono">{emb.lotes?.codigo_lote || "—"}</td>
                      <td className="border border-slate-400 p-1">{emb.produtos?.nome || "—"}</td>
                      <td className="border border-slate-400 p-1 text-right">{emb.volume} {emb.unidade}</td>
                      <td className="border border-slate-400 p-1">{emb.validade_em ? formatDateDisplay(emb.validade_em) : NAO_INFORMADA}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}


          {/* Condições */}
          <section className="mt-3">
            <h2 className="font-bold text-[13px] mb-1">Condições de Recebimento</h2>
            <ul className="text-[11px] list-disc pl-5 space-y-0.5">
              <li>Produto entregue em conformidade com o pedido.</li>
              <li>Volumes e identificação dos lotes conferidos.</li>
              <li>Validade conferida e embalagem íntegra.</li>
              <li>Orientação de armazenamento recebida.</li>
            </ul>
          </section>

          {/* Termo */}
          <section className="mt-3 border border-slate-400 p-3 bg-slate-50">
            <h2 className="font-bold text-[12px] mb-1">Termo de Recebimento</h2>
            <p className="text-[11px] text-justify">{TERMO}</p>
            {comprovante.assinatura_tipo === "digital_tela" && (
              <p className="text-[10px] mt-2 italic">
                A assinatura digital coletada nesta tela registra a ciência e confirmação operacional do
                recebimento, com data, hora, usuário responsável pela coleta e hash de validação do comprovante.
              </p>
            )}
          </section>

          {/* Ressalvas */}
          <section className="mt-3">
            <h2 className="font-bold text-[13px] mb-1">Observações / Ressalvas</h2>
            <div className="border border-slate-400 p-2 min-h-[60px] text-[11px] whitespace-pre-wrap">
              {comprovante.ressalvas || "( ) Sem ressalvas    ( ) Com ressalvas: ____________________________________________"}
            </div>
          </section>

          {/* Assinaturas */}
          <section className="mt-6 grid grid-cols-2 gap-6 text-[11px]">
            <div>
              <div className="border-b border-slate-700 h-12 mb-1" />
              <div className="text-center">
                <div><b>{comprovante.recebedor_nome || "_______________________"}</b></div>
                <div>Recebedor</div>
                {comprovante.recebedor_documento && <div>Doc: {comprovante.recebedor_documento}</div>}
                {comprovante.recebedor_cargo && <div>{comprovante.recebedor_cargo}</div>}
                {comprovante.data_assinatura && <div className="text-[10px] text-slate-600">{formatDateTimeDisplay(comprovante.data_assinatura)}</div>}
              </div>
            </div>
            <div>
              <div className="border-b border-slate-700 h-12 mb-1" />
              <div className="text-center">
                <div><b>{entrega.motorista || "_______________________"}</b></div>
                <div>Entregador AR Bio</div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="mt-6 pt-3 border-t text-[9px] text-slate-600 space-y-0.5">
            <div>Documento interno de comprovação de entrega e recebimento.</div>
            <div>Este documento não substitui documento fiscal quando aplicável.</div>
            <div>A emissão de nota fiscal/recibo seguirá o fluxo financeiro/fiscal do sistema.</div>
            <div>A validação por QR Code confirma o registro do comprovante no sistema AR Bio, sem substituir análise documental quando necessária.</div>
            {comprovante.validation_hash && (
              <div className="font-mono break-all mt-1">Hash: {comprovante.validation_hash}</div>
            )}
          </footer>
        </div>
        ))}
      </div>
    </div>
  );
}
