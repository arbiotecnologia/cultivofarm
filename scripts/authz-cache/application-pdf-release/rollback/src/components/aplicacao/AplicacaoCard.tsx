import { formatDateDisplay, formatTimeDisplay } from "@/lib/date-utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Sprout, FlaskConical, Cloud, User, Gauge, Droplets, History, Edit, AlertCircle, FileDown, Loader2, Mail, Send } from "lucide-react";
import { EvidenciasGallery } from "./EvidenciasGallery";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AplicacaoFormDialog } from "./AplicacaoFormDialog";
import { useAuth } from "@/hooks/useAuth";
import { generateAplicacaoPdf } from "@/lib/pdfAplicacao";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  aplicacao: any;
  doseRecomendada?: number;
  showActions?: boolean;
}

export function AplicacaoCard({ aplicacao: a, doseRecomendada, showActions = true }: Props) {
  const { role, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState(a.email_envio || "");
  const [nomeDestinatario, setNomeDestinatario] = useState("");
  const [emailSubject, setEmailSubject] = useState(`Relatório de Aplicação - ${a.os?.fazendas?.nome || "Fazenda"} - ${formatDateDisplay(a.data_aplicacao)}`);
  const [emailMessage, setEmailMessage] = useState(`Olá,\n\nSegue em anexo o relatório detalhado da aplicação realizada em ${formatDateDisplay(a.data_aplicacao)} no talhão ${a.os?.talhoes?.nome || "—"}.\n\nProduto: ${a.os?.produtos?.nome || "—"}\nResponsável: ${a.responsavel || "—"}\n\nQualquer dúvida, estamos à disposição.`);

  const emailTemplates = [
    {
      id: "padrao",
      label: "Padrão",
      subject: `Relatório de Aplicação - ${a.os?.fazendas?.nome || "Fazenda"} - ${formatDateDisplay(a.data_aplicacao)}`,
      message: `Olá,\n\nSegue em anexo o relatório detalhado da aplicação realizada em ${formatDateDisplay(a.data_aplicacao)} no talhão ${a.os?.talhoes?.nome || "—"}.\n\nProduto: ${a.os?.produtos?.nome || "—"}\nResponsável: ${a.responsavel || "—"}\n\nQualquer dúvida, estamos à disposição.`
    },
    {
      id: "completo",
      label: "Informativo Detalhado",
      subject: `[INFORMATIVO] Registro de Manejo Agrícola - ${a.os?.fazendas?.nome || "Fazenda"}`,
      message: `Prezados,\n\nInformamos que a aplicação planejada para o talhão ${a.os?.talhoes?.nome || "—"} foi concluída com sucesso.\n\nDetalhes do registro:\n- Data: ${formatDateDisplay(a.data_aplicacao)}\n- Produto: ${a.os?.produtos?.nome || "—"}\n- Dose Aplicada: ${a.dose_aplicada} mL/ha\n\nO prontuário completo com fotos das evidências e condições climáticas está disponível no PDF anexo.\n\nAtenciosamente.`
    },
    {
      id: "urgente",
      label: "Urgente / Alerta",
      subject: `⚠️ ALERTA DE APLICAÇÃO - ${a.os?.fazendas?.nome || "Fazenda"}`,
      message: `Atenção,\n\nSegue o registro da aplicação crítica realizada hoje (${formatDateDisplay(a.data_aplicacao)}) no talhão ${a.os?.talhoes?.nome || "—"}.\n\nÉ fundamental a conferência dos dados de dose e condições climáticas registrados no documento anexo para o acompanhamento do manejo.\n\nEquipe Técnica.`
    }
  ];

  const handleTemplateChange = (templateId: string) => {
    const template = emailTemplates.find(t => t.id === templateId);
    if (template) {
      setEmailSubject(template.subject);
      setEmailMessage(template.message);
    }
  };


  const handleSendEmail = async () => {
    if (!emailDestinatario) {
      toast.error("Por favor, informe o e-mail do destinatário.");
      return;
    }

    try {
      setSendingEmail(true);
      
      const { data: config } = await supabase
        .from("configuracoes_sistema")
        .select("nome_empresa, logo_url")
        .maybeSingle();

      const doc = await generateAplicacaoPdf({
        empresa: {
          nome: config?.nome_empresa || "PULSE AGRÍCOLA",
          logoUrl: config?.logo_url
        },
        aplicacao: a,
        doseRecomendada
      });

      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const filename = `aplicacao_${a.os?.fazendas?.nome || "registro"}_${a.data_aplicacao}.pdf`.replace(/\s+/g, "_");

      const { data, error } = await supabase.functions.invoke("enviar-pdf-aplicacao", {
        body: {
          pdfBase64,
          fileName: filename,
          destinatarioEmail: emailDestinatario,
          destinatarioNome: nomeDestinatario,
          registroId: a.id,
          empresaNome: config?.nome_empresa || "PULSE AGRÍCOLA",
          fazendaNome: a.os?.fazendas?.nome,
          talhaoNome: a.os?.talhoes?.nome,
          produtoNome: a.os?.produtos?.nome,
          dataAplicacao: a.data_aplicacao,
          customSubject: emailSubject,
          customMessage: emailMessage
        }
      });

      if (error) throw error;

      // Registro em aplicacao_emails e em aplicacoes.email_envio é feito
      // server-side pela Edge Function enviar-pdf-aplicacao. Nenhum update
      // redundante aqui: o servidor é a autoridade sobre o status do envio.




      toast.success(data.emailSent ? "Relatório enviado por e-mail!" : "Link gerado! (E-mail não pôde ser disparado no momento)");
      setEmailDialogOpen(false);
    } catch (error) {
      console.error("Error sending PDF by email:", error);
      toast.error("Erro ao enviar e-mail.");
    } finally {
      setSendingEmail(false);
    }
  };

  const handleDownloadPdf = async () => {

    try {
      setDownloading(true);
      
      // Get company config
      const { data: config } = await supabase
        .from("configuracoes_sistema")
        .select("nome_empresa, logo_url")
        .maybeSingle();

      const doc = await generateAplicacaoPdf({
        empresa: {
          nome: config?.nome_empresa || "PULSE AGRÍCOLA",
          logoUrl: config?.logo_url
        },
        aplicacao: a,
        doseRecomendada
      });

      const filename = `aplicacao_${a.os?.fazendas?.nome}_${a.os?.talhoes?.nome}_${a.data_aplicacao}.pdf`.replace(/\s+/g, "_");
      doc.save(filename);
      toast.success("PDF gerado com sucesso!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Erro ao gerar PDF.");
    } finally {
      setDownloading(false);
    }
  };
  
  const canEdit = role === "admin" || role === "staff" || role === "applicator" || role === "consultor";
  const isRetificada = !!a.parent_id;
  const versao = a.versao || 1;
  const doseAplicada = Number(a.dose_aplicada || 0);
  const desvio = doseRecomendada ? ((doseAplicada - doseRecomendada) / doseRecomendada) * 100 : 0;
  const desvioOK = Math.abs(desvio) <= 20;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Calendar className="h-4 w-4 text-primary" />
              {formatDateDisplay(a.data_aplicacao)}
              {a.hora_inicio && <span className="text-muted-foreground font-normal">· {formatTimeDisplay(a.hora_inicio)}</span>}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <MapPin className="h-3 w-3" />
              {a.os?.fazendas?.nome || "—"} › {a.os?.talhoes?.nome || "—"}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {versao > 1 && <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-200">v{versao}</Badge>}
            {!a.is_latest && <Badge variant="secondary" className="text-[10px] h-5">Anterior</Badge>}
            {a.os?.produtos?.nome && <Badge variant="outline" className="gap-1"><Sprout className="h-3 w-3" />{a.os.produtos.nome}</Badge>}
            {a.resultado_inicial && <Badge variant="secondary">{a.resultado_inicial.replace("_", " ")}</Badge>}
            
            {showActions && (
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                  onClick={() => setEmailDialogOpen(true)}
                  title="Enviar por E-mail"
                >
                  <Mail className="h-4 w-4" />
                </Button>

                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-muted-foreground hover:text-primary" 
                  onClick={handleDownloadPdf}
                  disabled={downloading}
                  title="Baixar PDF"
                >
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                </Button>


                {canEdit && a.is_latest && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditOpen(true)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <AplicacaoFormDialog open={editOpen} onOpenChange={setEditOpen} rectifyId={a.id} />

        <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar Relatório por E-mail</DialogTitle>
              <DialogDescription>
                O relatório de aplicação será enviado para o e-mail informado abaixo.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="nome">Nome do Destinatário</Label>
                  <Input 
                    id="nome" 
                    placeholder="Ex: João Silva" 
                    value={nomeDestinatario} 
                    onChange={(e) => setNomeDestinatario(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="email@exemplo.com" 
                    value={emailDestinatario} 
                    onChange={(e) => setEmailDestinatario(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Modelo de E-mail</Label>
                <Select onValueChange={handleTemplateChange} defaultValue="padrao">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="assunto">Assunto</Label>
                <Input 
                  id="assunto" 
                  value={emailSubject} 
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="mensagem">Mensagem</Label>
                <Textarea 
                  id="mensagem" 
                  rows={6}
                  value={emailMessage} 
                  onChange={(e) => setEmailMessage(e.target.value)}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancelar</Button>
              <Button 
                onClick={handleSendEmail} 
                disabled={sendingEmail}
                className="gap-2"
              >
                {sendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingEmail ? "Enviando..." : "Enviar Agora"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comparativo dose */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/40 rounded-lg p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Recomendada</p>
            <p className="font-bold text-sm">{doseRecomendada || "—"} <span className="text-xs font-normal">mL/ha</span></p>
          </div>
          <div className={`rounded-lg p-2 ${desvioOK ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"}`}>
            <p className="text-[10px] uppercase text-muted-foreground">Aplicada</p>
            <p className="font-bold text-sm">{doseAplicada || "—"} <span className="text-xs font-normal">mL/ha</span></p>
          </div>
          <div className="bg-muted/40 rounded-lg p-2">
            <p className="text-[10px] uppercase text-muted-foreground">Área</p>
            <p className="font-bold text-sm">{a.area_aplicada_ha || "—"} <span className="text-xs font-normal">ha</span></p>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
            <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
            {open ? "Ocultar" : "Ver"} detalhes técnicos e evidências
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Detail icon={FlaskConical} label="Modo" value={a.modo_aplicacao} />
              <Detail icon={Gauge} label="Equipamento" value={[a.equipamento, a.equipamento_modelo].filter(Boolean).join(" ")} />
              <Detail icon={Droplets} label="Calda" value={a.volume_calda_l_ha ? `${a.volume_calda_l_ha} L/ha` : null} />
              <Detail icon={Cloud} label="Clima" value={[a.temperatura_c && `${a.temperatura_c}°C`, a.umidade_pct && `${a.umidade_pct}% UR`, a.vento_kmh && `${a.vento_kmh} km/h`].filter(Boolean).join(" · ") || a.condicoes_climaticas} />
              <Detail icon={User} label="Responsável" value={a.responsavel} />
              <Detail icon={MapPin} label="GPS" value={a.latitude ? `${Number(a.latitude).toFixed(4)}, ${Number(a.longitude).toFixed(4)}` : null} />
            </div>
            {a.motivo_retificacao && (
              <div className="bg-amber-50 dark:bg-amber-950/20 p-2 rounded border border-amber-100 dark:border-amber-900/30 text-xs">
                <p className="text-amber-800 dark:text-amber-400 font-semibold flex items-center gap-1 mb-1 uppercase text-[9px]">
                  <AlertCircle className="h-3 w-3" /> Justificativa da Retificação
                </p>
                <p className="italic text-amber-900/80 dark:text-amber-300/80">"{a.motivo_retificacao}"</p>
              </div>
            )}
            {a.observacoes && (
              <div className="text-xs">
                <p className="text-muted-foreground uppercase text-[10px] mb-1">Observações</p>
                <p className="whitespace-pre-wrap">{a.observacoes}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground uppercase text-[10px] mb-2">Evidências</p>
              <EvidenciasGallery aplicacaoId={a.id} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value: any }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
