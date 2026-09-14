import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  FileText, Printer, PenLine, Upload, CheckCircle2, ShieldAlert, AlertTriangle, Copy, Loader2, ExternalLink,
} from "lucide-react";
import { AssinaturaDigitalCanvas } from "./AssinaturaDigitalCanvas";
import { QRCodeComprovante, buildValidationUrl } from "./QRCodeComprovante";
import { copiarTexto, MSG_COPIA_INDISPONIVEL } from "@/lib/entregas/copiarLink";
import { EntregaChecklistPanel } from "./EntregaChecklistPanel";
import { EntregaOcorrenciasPanel } from "./EntregaOcorrenciasPanel";
import {
  ACCEPT_ANEXO,
  formatarTamanho,
  normalizarMimeAnexo,
  pendenteReusavelPara,
  validarAnexoComprovante,
  type PathPendente,
} from "@/lib/entregas/anexoComprovante";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-muted text-muted-foreground" },
  formulario_gerado: { label: "Formulário gerado", cls: "bg-blue-100 text-blue-700" },
  aguardando_assinatura: { label: "Aguardando assinatura", cls: "bg-amber-100 text-amber-700" },
  assinatura_digital_coletada: { label: "Assinatura digital coletada", cls: "bg-indigo-100 text-indigo-700" },
  anexado: { label: "Anexado", cls: "bg-violet-100 text-violet-700" },
  confirmado: { label: "Confirmado", cls: "bg-emerald-100 text-emerald-700" },
  dispensado: { label: "Dispensado", cls: "bg-slate-200 text-slate-700" },
  rejeitado: { label: "Rejeitado", cls: "bg-rose-100 text-rose-700" },
};

interface Props {
  entrega: any;
}

const MSG_ERRO_GENERICA = "Não foi possível concluir a ação. Tente novamente.";
const MSG_FALHA_ENVIO = "Não foi possível enviar o arquivo. Verifique a conexão e tente novamente.";
const MSG_FALHA_VINCULO =
  "O arquivo foi enviado, mas não foi possível vinculá-lo à entrega. Tente novamente — o arquivo não será enviado de novo.";
const MSG_FALHA_ASSINATURA_ENVIO =
  "Não foi possível enviar a imagem da assinatura. Verifique a conexão e tente novamente.";
const MSG_FALHA_ASSINATURA_VINCULO =
  "A assinatura foi enviada, mas não foi possível registrá-la. Tente novamente — a imagem não será enviada de novo.";

/**
 * Assinatura já armazenada cuja vinculação falhou.
 * Identidade = entrega + traço exato + recebedor informado no envio original.
 * Guarda também o hash e o payload do recebedor ORIGINAIS, para que a nova
 * tentativa registre exatamente a mesma assinatura já armazenada.
 */
type RecebedorPayload = { nome: string; documento: string; cargo: string; telefone: string };
type AssinaturaPendente = {
  entregaId: string;
  traco: string;
  path: string;
  hash: string;
  recebedor: RecebedorPayload;
};

function mesmoRecebedor(a: RecebedorPayload, b: RecebedorPayload) {
  return (
    a.nome.trim() === b.nome.trim() &&
    (a.documento || "").trim() === (b.documento || "").trim() &&
    (a.cargo || "").trim() === (b.cargo || "").trim() &&
    (a.telefone || "").trim() === (b.telefone || "").trim()
  );
}

export function EntregaComprovantePanel({ entrega }: Props) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const [openSign, setOpenSign] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [openConfirm, setOpenConfirm] = useState(false);
  const [linkManual, setLinkManual] = useState<string | null>(null);
  const [openDispensa, setOpenDispensa] = useState(false);
  const [recebedor, setRecebedor] = useState({ nome: "", documento: "", cargo: "", telefone: "" });
  const [ressalvas, setRessalvas] = useState("");
  const [motivoDispensa, setMotivoDispensa] = useState("");

  // ---- Anexo de comprovante: seleção explícita + envio explícito ----
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  // Caminho já enviado ao armazenamento cujo vínculo (RPC) falhou.
  // Estruturado e associado à entrega + arquivo: só é reaproveitado se ambos coincidirem.
  const [pathPendente, setPathPendente] = useState<PathPendente | null>(null);
  // PNG de assinatura já armazenado cuja RPC falhou: reaproveitado na nova
  // tentativa da MESMA entrega, MESMO traço e MESMO recebedor, sem reenvio,
  // mantendo o hash e o payload originais associados àquele PNG.
  const [assinaturaPendente, setAssinaturaPendente] = useState<AssinaturaPendente | null>(null);
  const [gerando, setGerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [dispensando, setDispensando] = useState(false);
  const enviandoAnexoRef = useRef(false);
  // Trava síncrona COMPARTILHADA: assinatura, anexo, confirmação e dispensa
  // nunca correm em paralelo sobre a mesma comprovação.
  const acaoRef = useRef(false);
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false);
  const entregaAtivaRef = useRef<string | undefined>(entrega?.id);
  // Token monotônico de operação: invalidado na troca de entrega e no unmount.
  const opSeqRef = useRef(0);
  const opAtivaRef = useRef(0);
  // Sequência PRÓPRIA da cópia de link: nunca invalida o token de uma gravação.
  const copiaSeqRef = useRef(0);
  const copiaAtivaRef = useRef(0);

  // Reset seguro ao trocar de entrega: nenhum arquivo anterior pode ser associado.
  useEffect(() => {
    entregaAtivaRef.current = entrega?.id;
    opAtivaRef.current = ++opSeqRef.current;
    copiaAtivaRef.current = ++copiaSeqRef.current;
    enviandoAnexoRef.current = false;
    acaoRef.current = false;
    setAcaoEmAndamento(false);
    setArquivo(null);
    setErroArquivo(null);
    setEnviandoAnexo(false);
    // Uma operação antiga em voo nunca mantém o contexto novo bloqueado.
    setGerando(false);
    setConfirmando(false);
    setDispensando(false);
    setPathPendente(null);
    setAssinaturaPendente(null);
    setLinkManual(null);
    setOpenUpload(false);
    setOpenSign(false);
    setOpenConfirm(false);
    setOpenDispensa(false);
    setRessalvas("");
    setMotivoDispensa("");
    setRecebedor({ nome: "", documento: "", cargo: "", telefone: "" });
  }, [entrega?.id]);

  // Unmount: invalida qualquer operação em voo.
  useEffect(() => {
    return () => {
      opAtivaRef.current = ++opSeqRef.current;
      copiaAtivaRef.current = ++copiaSeqRef.current;
      entregaAtivaRef.current = undefined;
    };
  }, []);

  const pendenteReusavel = !!(
    arquivo && pendenteReusavelPara(pathPendente, entrega?.id, arquivo, normalizarMimeAnexo(arquivo.type))
  );



  // Estado fresco da entrega (o prop pode vir de um snapshot antigo da lista).
  const {
    data: entregaAtual,
    isLoading: entregaCarregando,
    isError: entregaErro,
    refetch: recarregarEntrega,
  } = useQuery({
    queryKey: ["entrega-comprovante-status", entrega?.id],
    enabled: !!entrega?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entregas")
        .select("id, comprovante_status, validation_token")
        .eq("id", entrega.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const {
    data: comprovante,
    isLoading: comprovanteCarregando,
    isError: comprovanteErro,
    refetch: recarregarComprovante,
  } = useQuery({
    queryKey: ["entrega-comprovante", entrega?.id],
    enabled: !!entrega?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entrega_comprovantes" as any)
        .select("*")
        .eq("entrega_id", entrega.id)
        .order("gerado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const isAdmin = role === "administrador" || role === "gestor" || role === "administrativo";
  const carregando = entregaCarregando || comprovanteCarregando;
  // Falha em qualquer uma das duas consultas invalida status e ações,
  // inclusive quando só o comprovante falha e a entrega carregou.
  const falhou = entregaErro || comprovanteErro;
  // Entrega inexistente ou sem acesso: não inferir "pendente".
  const entregaAusente = !entregaCarregando && !entregaErro && !entregaAtual;

  // Nunca inferir "confirmado" pela existência do formulário, nem usar
  // "pendente" como fallback de falha/ausência de consulta.
  const status: string | null =
    falhou || carregando || entregaAusente
      ? null
      : (entregaAtual?.comprovante_status ?? null);
  const meta = status ? STATUS_LABEL[status] || STATUS_LABEL.pendente : null;
  const validationToken = (!falhou && !carregando && entregaAtual?.validation_token) || null;

  const invalidate = (entregaId: string = entrega.id) => {
    qc.invalidateQueries({ queryKey: ["entregas"] });
    qc.invalidateQueries({ queryKey: ["entrega-comprovante", entregaId] });
    qc.invalidateQueries({ queryKey: ["entrega-comprovante-status", entregaId] });
  };

  /** Trava síncrona compartilhada entre assinatura, anexo e demais ações. */
  const iniciarAcao = () => {
    if (acaoRef.current) return false;
    acaoRef.current = true;
    setAcaoEmAndamento(true);
    return true;
  };
  const liberarAcao = () => {
    acaoRef.current = false;
    setAcaoEmAndamento(false);
  };

  /**
   * Runner das ações de comprovação (gerar/confirmar/dispensar).
   * Captura entrega, payload e token no início; após o await, uma resposta
   * de operação obsoleta não emite toast, não fecha diálogo, não limpa campos
   * e não libera a trava do contexto atual. A invalidação usa apenas a
   * entrega originalmente capturada.
   */
  const executarAcaoComprovacao = async (opts: {
    setPendente: (v: boolean) => void;
    executar: (entregaId: string) => Promise<void>;
    sucessoTitulo: string;
    aoConcluir?: () => void;
  }) => {
    if (!iniciarAcao()) return;
    const entregaIdEnvio: string = entrega.id;
    const token = ++opSeqRef.current;
    opAtivaRef.current = token;
    const atual = () => opAtivaRef.current === token && entregaAtivaRef.current === entregaIdEnvio;
    opts.setPendente(true);
    try {
      await opts.executar(entregaIdEnvio);
      if (!atual()) {
        // Conclusão tardia: atualiza somente os dados da entrega original.
        invalidate(entregaIdEnvio);
        return;
      }
      toast({ title: opts.sucessoTitulo });
      opts.aoConcluir?.();
      invalidate(entregaIdEnvio);
    } catch {
      if (!atual()) return;
      toast({ title: "Erro", description: MSG_ERRO_GENERICA, variant: "destructive" });
    } finally {
      if (atual()) {
        opts.setPendente(false);
        liberarAcao();
      }
    }
  };

  const gerarFormulario = () =>
    executarAcaoComprovacao({
      setPendente: setGerando,
      sucessoTitulo: "Formulário gerado",
      executar: async (entregaId) => {
        const { error } = await supabase.rpc("rpc_gerar_formulario_entrega" as any, {
          p_entrega_id: entregaId,
        });
        if (error) throw error;
      },
    });

  const confirmarRecebimento = () => {
    // Payload capturado no início: uma edição posterior não altera o envio.
    const ressalvasEnvio = ressalvas || null;
    return executarAcaoComprovacao({
      setPendente: setConfirmando,
      sucessoTitulo: "Recebimento confirmado",
      aoConcluir: () => {
        setOpenConfirm(false);
        setRessalvas("");
      },
      executar: async (entregaId) => {
        const { error } = await supabase.rpc("rpc_confirmar_recebimento_entrega" as any, {
          p_entrega_id: entregaId,
          p_payload: { ressalvas: ressalvasEnvio },
        });
        if (error) throw error;
      },
    });
  };

  const dispensarAssinatura = () => {
    const motivoEnvio = motivoDispensa;
    return executarAcaoComprovacao({
      setPendente: setDispensando,
      sucessoTitulo: "Assinatura dispensada",
      aoConcluir: () => {
        setOpenDispensa(false);
        setMotivoDispensa("");
      },
      executar: async (entregaId) => {
        const { error } = await supabase.rpc("rpc_dispensar_assinatura_entrega" as any, {
          p_entrega_id: entregaId,
          p_motivo: motivoEnvio,
        });
        if (error) throw error;
      },
    });
  };

  /**
   * Coleta da assinatura digital do comprovante.
   * Aguardada pelo canvas; captura entrega, recebedor e hash de forma imutável;
   * guarda monotônica após cada await (inclusive A→B→A).
   */
  const onConfirmSignature = async (data: { pngBlob: Blob; svgPath: string; hash: string }) => {
    if (!recebedor.nome.trim()) {
      toast({ title: "Informe o recebedor", variant: "destructive" });
      return;
    }
    // Trava compartilhada: não corre com anexo/confirmação/dispensa.
    if (!iniciarAcao()) return;

    // Snapshot imutável no início.
    const entregaIdEnvio: string = entrega.id;
    const recebedorAtualEnvio: RecebedorPayload = { ...recebedor };
    const svgPath = data.svgPath;
    const token = ++opSeqRef.current;
    opAtivaRef.current = token;
    const atual = () => opAtivaRef.current === token && entregaAtivaRef.current === entregaIdEnvio;

    // Reaproveita o PNG já armazenado quando só a vinculação falhou antes.
    // Exige MESMA entrega, MESMO traço e MESMO recebedor; nesse caso o hash e
    // o payload do recebedor originais (associados àquele PNG) são reutilizados,
    // pois o canvas gera um hash novo a cada confirmação.
    const pendenteAplicavel =
      assinaturaPendente &&
      assinaturaPendente.entregaId === entregaIdEnvio &&
      assinaturaPendente.traco === svgPath &&
      mesmoRecebedor(assinaturaPendente.recebedor, recebedorAtualEnvio)
        ? assinaturaPendente
        : null;

    const hash = pendenteAplicavel ? pendenteAplicavel.hash : data.hash;
    const recebedorEnvio = pendenteAplicavel ? pendenteAplicavel.recebedor : recebedorAtualEnvio;

    let path = pendenteAplicavel ? pendenteAplicavel.path : null;
    try {
      if (!path) {
        const novoPath = `entregas/${entregaIdEnvio}/assinaturas/${crypto.randomUUID()}.png`;
        const { error: upErr } = await supabase.storage
          .from("entrega-documentos")
          .upload(novoPath, data.pngBlob, { contentType: "image/png", upsert: false });
        if (upErr) {
          if (!atual()) return;
          toast({ title: "Erro", description: MSG_FALHA_ASSINATURA_ENVIO, variant: "destructive" });
          return;
        }
        path = novoPath;
      }

      // Operação obsoleta após o upload: não inicia a RPC e não apaga o objeto.
      if (!atual()) return;

      const { error } = await supabase.rpc("rpc_coletar_assinatura_digital_entrega" as any, {
        p_entrega_id: entregaIdEnvio,
        p_payload: {
          assinatura_digital_png_path: path,
          assinatura_digital_svg: svgPath.length < 8000 ? svgPath : null,
          assinatura_hash: hash,
          assinatura_user_agent: navigator.userAgent,
          recebedor_nome: recebedorEnvio.nome,
          recebedor_documento: recebedorEnvio.documento || null,
          recebedor_cargo: recebedorEnvio.cargo || null,
          recebedor_telefone: recebedorEnvio.telefone || null,
        },
      });

      if (error) {
        if (!atual()) return;
        // PNG já armazenado: a nova tentativa apenas vincula, sem reenviar
        // e sem apagar o objeto (resultado incerto).
        setAssinaturaPendente({ entregaId: entregaIdEnvio, traco: svgPath, path, hash, recebedor: recebedorEnvio });
        toast({ title: "Erro", description: MSG_FALHA_ASSINATURA_VINCULO, variant: "destructive" });
        return;
      }

      if (!atual()) {
        invalidate(entregaIdEnvio);
        return;
      }
      toast({ title: "Assinatura digital coletada" });
      setAssinaturaPendente(null);
      setOpenSign(false);
      invalidate(entregaIdEnvio);
    } catch {
      if (!atual()) return;
      if (path) {
        setAssinaturaPendente({ entregaId: entregaIdEnvio, traco: svgPath, path, hash, recebedor: recebedorEnvio });
        toast({ title: "Erro", description: MSG_FALHA_ASSINATURA_VINCULO, variant: "destructive" });
      } else {
        toast({ title: "Erro", description: MSG_FALHA_ASSINATURA_ENVIO, variant: "destructive" });
      }
    } finally {
      // Nunca destrava uma ação que já pertence a outra entrega/operação.
      if (atual()) liberarAcao();
    }
  };


  /** Seleção do arquivo: valida, mas NUNCA envia automaticamente. */
  const onSelecionarArquivo = (file: File | null) => {
    if (enviandoAnexoRef.current) return;
    setPathPendente(null);
    if (!file) {
      setArquivo(null);
      setErroArquivo(null);
      return;
    }
    const resultado = validarAnexoComprovante(file);
    if (resultado.ok === false) {
      setArquivo(null);
      setErroArquivo(resultado.motivo);
      return;
    }
    setArquivo(file);
    setErroArquivo(null);
  };

  /** Envio explícito: só acontece ao clicar em "Enviar comprovante". */
  const enviarAnexo = async () => {
    if (enviandoAnexoRef.current || acaoRef.current) return;
    const file = arquivo;
    if (!file) {
      setErroArquivo("Selecione um arquivo para enviar.");
      return;
    }
    const validacao = validarAnexoComprovante(file);
    if (validacao.ok === false) {
      setErroArquivo(validacao.motivo);
      return;
    }
    if (!recebedor.nome.trim()) {
      setErroArquivo("Informe o nome de quem recebeu a entrega.");
      return;
    }

    // Snapshot no início: mudanças posteriores não afetam este envio.
    const entregaIdEnvio: string = entrega.id;
    const recebedorEnvio = { ...recebedor };
    // Token monotônico: identifica ESTA operação. Trocar de entrega (mesmo A→B→A)
    // ou desmontar invalida o token e nenhuma alteração local é aplicada depois.
    const token = ++opSeqRef.current;
    opAtivaRef.current = token;
    const atual = () => opAtivaRef.current === token && entregaAtivaRef.current === entregaIdEnvio;
    // Só reaproveita o caminho pendente se for da MESMA entrega e do MESMO arquivo.
    const pathReaproveitado = pendenteReusavelPara(pathPendente, entregaIdEnvio, file, validacao.mime);

    if (!iniciarAcao()) return;
    enviandoAnexoRef.current = true;
    setEnviandoAnexo(true);
    setErroArquivo(null);

    let path = pathReaproveitado;
    let uploadFeitoAgora = false;
    try {
      if (!path) {
        const novoPath = `entregas/${entregaIdEnvio}/comprovantes/${crypto.randomUUID()}.${validacao.extensao}`;
        const { error: upErr } = await supabase.storage
          .from("entrega-documentos")
          .upload(novoPath, file, { contentType: validacao.mime, upsert: false });
        if (upErr) {
          if (!atual()) return;
          toast({ title: "Erro", description: MSG_FALHA_ENVIO, variant: "destructive" });
          setErroArquivo(MSG_FALHA_ENVIO);
          return;
        }
        path = novoPath;
        uploadFeitoAgora = true;
      }

      // Operação obsoleta após o upload: não inicia a RPC e não apaga o objeto
      // (o arquivo pertence à entrega antiga; nunca é atribuído à nova).
      if (!atual()) return;

      const { error } = await supabase.rpc("rpc_anexar_comprovante_entrega" as any, {
        p_entrega_id: entregaIdEnvio,
        p_payload: {
          arquivo_path: path,
          arquivo_nome: file.name,
          arquivo_mime: validacao.mime,
          recebedor_nome: recebedorEnvio.nome,
          recebedor_documento: recebedorEnvio.documento || null,
          recebedor_cargo: recebedorEnvio.cargo || null,
          recebedor_telefone: recebedorEnvio.telefone || null,
        },
      });

      if (error) {
        // O arquivo já está no armazenamento: não reenviar e não apagar
        // (uma falha de rede pode esconder um sucesso do servidor).
        if (!atual()) return;
        setPathPendente({
          entregaId: entregaIdEnvio,
          path,
          nome: file.name,
          tamanho: file.size,
          lastModified: file.lastModified,
          mime: validacao.mime,
        });
        setErroArquivo(MSG_FALHA_VINCULO);
        toast({ title: "Erro", description: MSG_FALHA_VINCULO, variant: "destructive" });
        return;
      }

      // Sucesso de uma operação obsoleta: atualiza os dados da entrega capturada,
      // sem mexer no estado nem fechar o modal da entrega atual.
      if (!atual()) {
        invalidate(entregaIdEnvio);
        return;
      }
      toast({ title: "Comprovante anexado" });
      setPathPendente(null);
      setArquivo(null);
      setOpenUpload(false);
      invalidate(entregaIdEnvio);
    } catch {
      if (!atual()) return;
      if (path) {
        setPathPendente({
          entregaId: entregaIdEnvio,
          path,
          nome: file.name,
          tamanho: file.size,
          lastModified: file.lastModified,
          mime: validacao.mime,
        });
        setErroArquivo(MSG_FALHA_VINCULO);
        toast({ title: "Erro", description: MSG_FALHA_VINCULO, variant: "destructive" });
      } else {
        setErroArquivo(uploadFeitoAgora ? MSG_FALHA_VINCULO : MSG_FALHA_ENVIO);
        toast({
          title: "Erro",
          description: uploadFeitoAgora ? MSG_FALHA_VINCULO : MSG_FALHA_ENVIO,
          variant: "destructive",
        });
      }
    } finally {
      // Nunca destrava um envio que já pertence a outra entrega/operação.
      if (atual()) {
        enviandoAnexoRef.current = false;
        setEnviandoAnexo(false);
        liberarAcao();
      }
    }
  };



  const copyLink = async () => {
    if (!validationToken) return;
    const url = buildValidationUrl(validationToken);
    const entregaIdCopia = entrega?.id;
    const tokenCopia = ++copiaSeqRef.current;
    copiaAtivaRef.current = tokenCopia;
    const atual = () => copiaAtivaRef.current === tokenCopia && entregaAtivaRef.current === entregaIdCopia;
    const ok = await copiarTexto(url);
    // Troca de entrega ou desmontagem durante a cópia: nada é escrito na tela atual.
    if (!atual()) return;
    if (ok) {
      setLinkManual(null);
      toast({ title: "Link de validação copiado" });
      return;
    }
    setLinkManual(url);
    toast({
      title: "Não foi possível copiar",
      description: MSG_COPIA_INDISPONIVEL,
      variant: "destructive",
    });
  };

  const abrirComprovanteArquivo = async () => {
    try {
      const { data, error } = await supabase.storage
        .from("entrega-documentos")
        .createSignedUrl(comprovante.arquivo_path, 300);
      if (error || !data?.signedUrl) throw new Error("sem-url");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast({
        title: "Não foi possível abrir o comprovante",
        description: "O link seguro do arquivo não pôde ser gerado. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Mesmo documento sempre: abre o formulário já existente, nunca gera outro.
  const openForm = () => window.open(`/entregas/${entrega.id}/formulario`, "_blank", "noopener,noreferrer");
  const openForm2Vias = () => window.open(`/entregas/${entrega.id}/formulario?vias=2`, "_blank", "noopener,noreferrer");

  const podeImprimir = !!status && status !== "pendente";

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Comprovação de entrega</h3>
        </div>
        {carregando && !falhou && (
          <span className="text-xs text-muted-foreground" data-testid="comprovante-carregando">Carregando…</span>
        )}
        {meta && !falhou && (
          <Badge className={meta.cls} variant="secondary">{meta.label}</Badge>
        )}
      </div>

      {falhou && (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm space-y-2"
          data-testid="comprovante-erro"
        >
          <p>Não foi possível carregar a situação da comprovação desta entrega.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void recarregarEntrega();
              void recarregarComprovante();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {entregaAusente && !falhou && (
        <p className="text-sm text-muted-foreground" data-testid="comprovante-entrega-ausente">
          Não foi possível localizar esta entrega ou você não tem acesso a ela.
        </p>
      )}

      {!falhou && !carregando && comprovante && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
          <div className="space-y-1 text-sm">
            <div><span className="text-muted-foreground">Formulário:</span> <span className="font-mono">{comprovante.numero_formulario}</span></div>
            {comprovante.recebedor_nome && (
              <div><span className="text-muted-foreground">Recebedor:</span> {comprovante.recebedor_nome}{comprovante.recebedor_cargo ? ` — ${comprovante.recebedor_cargo}` : ""}</div>
            )}
            {comprovante.assinatura_tipo && (
              <div><span className="text-muted-foreground">Assinatura:</span> {comprovante.assinatura_tipo}</div>
            )}
            {comprovante.data_assinatura && (
              <div><span className="text-muted-foreground">Data:</span> {new Date(comprovante.data_assinatura).toLocaleString("pt-BR")}</div>
            )}
            {comprovante.validation_hash && (
              <div className="text-xs"><span className="text-muted-foreground">Hash:</span> <span className="font-mono break-all">{comprovante.validation_hash.slice(0,32)}…</span></div>
            )}
          </div>
          {comprovante.validation_token && (
            <QRCodeComprovante validationToken={comprovante.validation_token} numeroFormulario={comprovante.numero_formulario} size={110} showActions={false} />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 print:hidden">
        {status === "pendente" && (
          <Button size="sm" onClick={() => { void gerarFormulario(); }} disabled={gerando || acaoEmAndamento}>
            {gerando && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            <FileText className="h-4 w-4 mr-1" /> Gerar formulário
          </Button>
        )}
        {podeImprimir && (
          <>
            <Button size="sm" variant="outline" onClick={openForm}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir formulário
            </Button>
            <Button size="sm" variant="outline" onClick={openForm2Vias} title="Imprime 2 vias: Cliente e AR Bio">
              <Copy className="h-4 w-4 mr-1" /> Imprimir 2 vias
            </Button>
            {status !== "confirmado" && status !== "dispensado" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenSign(true)}
                  disabled={acaoEmAndamento}
                  title={acaoEmAndamento ? "Aguarde a ação em andamento terminar." : undefined}
                >
                  <PenLine className="h-4 w-4 mr-1" /> Coletar assinatura digital
                </Button>
                <Button size="sm" variant="outline" onClick={() => setOpenUpload(true)} disabled={acaoEmAndamento} title={acaoEmAndamento ? "Aguarde a ação em andamento terminar." : undefined}>
                  <Upload className="h-4 w-4 mr-1" /> Anexar comprovante
                </Button>
              </>
            )}
            {(status === "anexado" || status === "assinatura_digital_coletada") && (
              <Button size="sm" onClick={() => setOpenConfirm(true)} disabled={acaoEmAndamento}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar recebimento
              </Button>
            )}
            {isAdmin && status !== "confirmado" && status !== "dispensado" && (
              <Button size="sm" variant="ghost" onClick={() => setOpenDispensa(true)} disabled={acaoEmAndamento}>
                <ShieldAlert className="h-4 w-4 mr-1" /> Dispensar assinatura
              </Button>
            )}
            {validationToken && (
              <Button size="sm" variant="ghost" onClick={() => void copyLink()}>
                <Copy className="h-4 w-4 mr-1" /> Copiar link de validação
              </Button>
            )}
            {linkManual && (
              <input
                readOnly
                aria-label="Link de validação para cópia manual"
                value={linkManual}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full text-xs font-mono border rounded px-2 py-1"
              />
            )}
            {comprovante?.arquivo_path && (
              <Button size="sm" variant="ghost" onClick={abrirComprovanteArquivo}>
                <ExternalLink className="h-4 w-4 mr-1" /> Visualizar comprovante
              </Button>
            )}
          </>
        )}
      </div>

      {podeImprimir && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <EntregaChecklistPanel entregaId={entrega.id} canEdit={status !== "confirmado" && status !== "dispensado"} />
          <EntregaOcorrenciasPanel entregaId={entrega.id} canAdd={status !== "confirmado" && status !== "dispensado"} />
        </div>
      )}

      {/* Dialog: Assinatura Digital */}
      <Dialog open={openSign} onOpenChange={(v) => (acaoEmAndamento ? undefined : setOpenSign(v))}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Coletar assinatura digital</DialogTitle><DialogDescription>Informe quem recebeu a entrega e colete a assinatura na área de desenho.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <RecebedorFields recebedor={recebedor} setRecebedor={setRecebedor} disabled={acaoEmAndamento} />
            {assinaturaPendente && assinaturaPendente.entregaId === entrega?.id && (
              <p className="text-xs text-muted-foreground" data-testid="assinatura-vinculo-pendente">
                A imagem da assinatura já está armazenada. A nova tentativa fará apenas o registro, sem enviá-la novamente.
              </p>
            )}
            <AssinaturaDigitalCanvas
              onConfirm={onConfirmSignature}
              onCancel={() => (acaoEmAndamento ? undefined : setOpenSign(false))}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Anexo de comprovante (seleção e envio explícitos) */}
      <Dialog open={openUpload} onOpenChange={(v) => (enviandoAnexo ? undefined : setOpenUpload(v))}>
        <DialogContent className="max-w-lg" onInteractOutside={(e) => enviandoAnexo && e.preventDefault()} onEscapeKeyDown={(e) => enviandoAnexo && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Anexar comprovante assinado</DialogTitle>
            <DialogDescription>
              Selecione o arquivo do formulário assinado, identifique quem recebeu e clique em “Enviar comprovante”.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <RecebedorFields recebedor={recebedor} setRecebedor={setRecebedor} disabled={enviandoAnexo} />
            <div className="space-y-1">
              <Label htmlFor="comprovante-arquivo">Arquivo do comprovante *</Label>
              <Input
                id="comprovante-arquivo"
                type="file"
                accept={ACCEPT_ANEXO}
                disabled={enviandoAnexo}
                aria-invalid={!!erroArquivo}
                aria-describedby={erroArquivo ? "comprovante-arquivo-erro" : "comprovante-arquivo-ajuda"}
                onChange={(e) => onSelecionarArquivo(e.target.files?.[0] ?? null)}
              />
              <p id="comprovante-arquivo-ajuda" className="text-xs text-muted-foreground">
                PDF, JPG, PNG ou WEBP — até 10 MB. O envio só acontece ao clicar no botão.
              </p>
              {arquivo && (
                <p className="text-xs text-muted-foreground" data-testid="comprovante-arquivo-selecionado">
                  Selecionado: {arquivo.name} ({formatarTamanho(arquivo.size)})
                </p>
              )}
              {erroArquivo && (
                <p id="comprovante-arquivo-erro" className="text-xs text-destructive" role="alert">
                  {erroArquivo}
                </p>
              )}
              {pendenteReusavel && (
                <p className="text-xs text-muted-foreground" data-testid="comprovante-vinculo-pendente">
                  O arquivo já está armazenado. A nova tentativa fará apenas a vinculação, sem enviá-lo novamente.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUpload(false)} disabled={enviandoAnexo}>
              Cancelar
            </Button>
            <Button onClick={() => void enviarAnexo()} disabled={enviandoAnexo || !arquivo}>
              {enviandoAnexo && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {enviandoAnexo ? "Enviando…" : pendenteReusavel ? "Tentar vincular novamente" : "Enviar comprovante"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog: Confirmar */}
      <Dialog open={openConfirm} onOpenChange={(v) => (acaoEmAndamento ? undefined : setOpenConfirm(v))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar recebimento</DialogTitle><DialogDescription>Registre a confirmação do recebimento desta entrega, com ressalvas se necessário.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label>Ressalvas (opcional)</Label>
            <Textarea rows={3} value={ressalvas} onChange={(e) => setRessalvas(e.target.value)} placeholder="Descreva ressalvas se houver" disabled={acaoEmAndamento} />
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5" />
              Confirmar com ressalvas mantém rastreabilidade. Esta ação é auditada.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenConfirm(false)} disabled={acaoEmAndamento}>Cancelar</Button>
            <Button onClick={() => { void confirmarRecebimento(); }} disabled={confirmando || acaoEmAndamento}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Dispensa */}
      <Dialog open={openDispensa} onOpenChange={(v) => (acaoEmAndamento ? undefined : setOpenDispensa(v))}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispensar assinatura</DialogTitle><DialogDescription>Informe o motivo da dispensa. A ação é registrada para auditoria.</DialogDescription></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Textarea rows={3} value={motivoDispensa} onChange={(e) => setMotivoDispensa(e.target.value)} placeholder="Mínimo 5 caracteres" disabled={acaoEmAndamento} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDispensa(false)} disabled={acaoEmAndamento}>Cancelar</Button>
            <Button onClick={() => { void dispensarAssinatura(); }} disabled={dispensando || acaoEmAndamento || motivoDispensa.trim().length < 5}>Dispensar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RecebedorFields({
  recebedor,
  setRecebedor,
  disabled = false,
}: {
  recebedor: any;
  setRecebedor: (v: any) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <Label htmlFor="recebedor-nome">Nome do recebedor *</Label>
        <Input
          id="recebedor-nome"
          value={recebedor.nome}
          maxLength={150}
          disabled={disabled}
          onChange={(e) => setRecebedor({ ...recebedor, nome: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="recebedor-documento">Documento</Label>
        <Input
          id="recebedor-documento"
          value={recebedor.documento}
          maxLength={50}
          disabled={disabled}
          onChange={(e) => setRecebedor({ ...recebedor, documento: e.target.value })}
        />
      </div>
      <div>
        <Label htmlFor="recebedor-cargo">Cargo</Label>
        <Input
          id="recebedor-cargo"
          value={recebedor.cargo}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => setRecebedor({ ...recebedor, cargo: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <Label htmlFor="recebedor-telefone">Telefone</Label>
        <MaskedInput
          id="recebedor-telefone"
          mask="telefone"
          placeholder="(00) 00000-0000"
          value={recebedor.telefone}
          disabled={disabled}
          onChange={(e) => setRecebedor({ ...recebedor, telefone: e.target.value })}
        />
      </div>
    </div>
  );
}

