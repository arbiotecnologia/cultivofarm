import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  BarChart, Bar, XAxis, YAxis, LineChart, Line,
  ResponsiveContainer, CartesianGrid, Legend, Tooltip as RTooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { 
  FileDown, FileSpreadsheet, Truck, FlaskConical, 
  Sprout, ClipboardList, MapPin, Package,
  ChevronLeft, ChevronRight, Search, Info
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { PageHeader, ResponsiveTable, MobileCard } from "@/components/ResponsiveHelpers";
import { useIsMobile } from "@/hooks/use-mobile";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { formatOS } from "@/lib/osLabel";
import { formatDateDisplay } from "@/lib/date-utils";


const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 200 80% 45%))",
  "hsl(var(--chart-3, 28 85% 55%))",
  "hsl(var(--chart-4, 280 70% 55%))",
  "hsl(var(--chart-5, 340 75% 55%))",
  "hsl(var(--chart-6, 160 60% 45%))",
];

function isoWeek(dateStr: string) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-S${String(week).padStart(2, "0")}`;
}

function getMonthRange(startDate: string, endDate: string) {
  return { start: startDate, end: endDate };
}

function exportPDF(title: string, headers: string[], rows: string[][]) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Cultivo Farm — ${title}`, 14, 20);
  doc.setFontSize(9);
  doc.text(`Gerado em: ${formatDateDisplay(new Date())}`, 14, 28);
  autoTable(doc, { head: [headers], body: rows, startY: 34, styles: { fontSize: 8 } });
  doc.save(`${title.toLowerCase().replace(/\s/g, "_")}.pdf`);
}

function exportExcel(title: string, headers: string[], rows: string[][]) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title);
  XLSX.writeFile(wb, `${title.toLowerCase().replace(/\s/g, "_")}.xlsx`);
}

const chartConfig = { value: { label: "Valor", color: "hsl(var(--primary))" } };

export default function Relatorios() {
  const isMobile = useIsMobile();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const lastDay = today.toISOString().split("T")[0];

  const [dateRange, setDateRange] = useState({ start: firstDay, end: lastDay });
  const [estoqueFilter, setEstoqueFilter] = useState({ produto: "", cliente: "" });
  const [estoquePage, setEstoquePage] = useState(1);
  const itemsPerPage = 10;

  // Production data
  const { data: lotes = [] } = useQuery({
    queryKey: ["rel-lotes", dateRange],
    queryFn: async () => {
      const { data } = await supabase.from("lotes")
        .select("id, data_producao, codigo_lote, volume_produzido, status, produto_id, produtos(nome)")
        .gte("data_producao", dateRange.start)
        .lte("data_producao", dateRange.end)
        .order("data_producao", { ascending: false })
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Deliveries — filtra por data_saida (fallback created_at quando nulo)
  const { data: entregas = [] } = useQuery({
    queryKey: ["rel-entregas", dateRange],
    queryFn: async () => {
      const { data } = await supabase.from("entregas")
        .select("id, status, created_at, data_saida, volume_entregue_ml, motorista, veiculo, cliente_id, clientes(nome), produto_id, produtos(nome), ordens_servico(id, numero_os, produtos(nome))")
        .or(`and(data_saida.gte.${dateRange.start},data_saida.lte.${dateRange.end}),and(data_saida.is.null,created_at.gte.${dateRange.start},created_at.lte.${dateRange.end}T23:59:59)`)
        .order("created_at", { ascending: false })
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Envase — exclui envases de lotes reprovados
  const { data: envases = [] } = useQuery({
    queryKey: ["rel-envases", dateRange],
    queryFn: async () => {
      const { data } = await supabase.from("envase")
        .select("id, data_envase, quantidade, volume_por_unidade, lotes!inner(status)")
        .neq("lotes.status", "reprovado")
        .gte("data_envase", dateRange.start)
        .lte("data_envase", dateRange.end)
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Estoque reservado — saldo a entregar (snapshot atual, independe do período)
  const { data: estoqueReservado = [] } = useQuery({
    queryKey: ["rel-estoque-reservado"],
    queryFn: async () => {
      const { data } = await supabase.from("estoque_produto")
        .select("id, volume_total, produto_id, produtos(nome), reservado_para_cliente_id, clientes:reservado_para_cliente_id(nome)")
        .eq("status", "reservado")
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // OS for area data
  const { data: ordens = [] } = useQuery({
    queryKey: ["rel-ordens", dateRange],
    queryFn: async () => {
      const { data } = await supabase.from("ordens_servico_onfarm")
        .select("id, numero_os, area_hectares, status, created_at, volume_total_ml, cliente_id, clientes(nome), fazenda_id, fazendas(nome), produto_id, produtos(nome)")
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Vistorias (registros do consultor)
  const { data: vistorias = [] } = useQuery({
    queryKey: ["rel-vistorias", dateRange],
    queryFn: async () => {
      const { data } = await supabase.from("registros_consultor")
        .select("id, data_vistoria, status, problema_principal, nivel_pressao, latitude, longitude, cliente_id, clientes(nome), fazenda_id, fazendas(nome), talhao_id, talhoes(nome), cultura_id, culturas(nome)")
        .gte("data_vistoria", dateRange.start)
        .lte("data_vistoria", dateRange.end)
        .order("data_vistoria", { ascending: false })
        .limit(1000);
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  // Aggregations
  const PRODUZIDO_STATUS = new Set(["aprovado", "aguardando_cq"]);
  const lotesProduzidos = lotes.filter((l: any) => PRODUZIDO_STATUS.has(l.status));
  const totalVolume = lotesProduzidos.reduce((s: number, l: any) => s + (Number(l.volume_produzido) || 0), 0);
  const totalArea = ordens.reduce((s: number, o: any) => s + (o.area_hectares || 0), 0);
  const totalEnvasadoMl = envases.reduce(
    (s: number, e: any) => s + (Number(e.quantidade) || 0) * (Number(e.volume_por_unidade) || 0),
    0
  );
  const entreguesList = entregas.filter((e: any) => e.status === "entregue");
  const expedidosList = entregas.filter((e: any) => e.status === "em_rota" || e.status === "entregue");
  const totalEntregas = entreguesList.length;
  const volumeEntregueMl = entreguesList.reduce(
    (s: number, e: any) => s + (Number(e.volume_entregue_ml) || 0),
    0
  );
  const volumeExpedidoMl = expedidosList.reduce(
    (s: number, e: any) => s + (Number(e.volume_entregue_ml) || 0),
    0
  );
  const volumeSaldoReservadoMl = estoqueReservado.reduce(
    (s: number, r: any) => s + (Number(r.volume_total) || 0),
    0
  );

  const nomeProdutoEntrega = (e: any) => e.produtos?.nome || e.ordens_servico?.produtos?.nome || "—";
  const volumeEntregaL = (e: any) => (Number(e.volume_entregue_ml) || 0) / 1000;

  // Chart: production by product (apenas lotes aprovados/aguardando CQ)
  const prodByProduct: Record<string, number> = {};
  lotesProduzidos.forEach((l: any) => {
    const name = l.produtos?.nome || "Sem produto";
    prodByProduct[name] = (prodByProduct[name] || 0) + (Number(l.volume_produzido) || 0);
  });
  const prodChartData = Object.entries(prodByProduct).map(([name, value]) => ({ name, value: Number((value / 1000).toFixed(1)) }));

  // Chart: area by client
  const areaByClient: Record<string, number> = {};
  ordens.forEach((o: any) => {
    const name = o.clientes?.nome || "—";
    areaByClient[name] = (areaByClient[name] || 0) + (o.area_hectares || 0);
  });
  const areaChartData = Object.entries(areaByClient).map(([name, value]) => ({ name, value }));

  // Série temporal semanal: Produzido / Expedido / Entregue (L)
  const serieTemporal = (() => {
    const map = new Map<string, { semana: string; Produzido: number; Expedido: number; Entregue: number }>();
    const ensure = (k: string) => {
      if (!map.has(k)) map.set(k, { semana: k, Produzido: 0, Expedido: 0, Entregue: 0 });
      return map.get(k)!;
    };
    lotesProduzidos.forEach((l: any) => {
      if (!l.data_producao) return;
      ensure(isoWeek(l.data_producao)).Produzido += (Number(l.volume_produzido) || 0) / 1000;
    });
    entregas.forEach((e: any) => {
      const ref = e.data_saida || (e.created_at || "").slice(0, 10);
      if (!ref) return;
      const volL = volumeEntregaL(e);
      if (e.status === "em_rota" || e.status === "entregue") ensure(isoWeek(ref)).Expedido += volL;
      if (e.status === "entregue") ensure(isoWeek(ref)).Entregue += volL;
    });
    return Array.from(map.values()).sort((a, b) => a.semana.localeCompare(b.semana));
  })();

  // Top produtos: Produzido vs Expedido vs Entregue
  const topProdutos = (() => {
    const map = new Map<string, { produto: string; Produzido: number; Expedido: number; Entregue: number }>();
    const ensure = (n: string) => {
      if (!map.has(n)) map.set(n, { produto: n, Produzido: 0, Expedido: 0, Entregue: 0 });
      return map.get(n)!;
    };
    lotesProduzidos.forEach((l: any) => {
      ensure(l.produtos?.nome || "—").Produzido += (Number(l.volume_produzido) || 0) / 1000;
    });
    entregas.forEach((e: any) => {
      const nome = nomeProdutoEntrega(e);
      const v = volumeEntregaL(e);
      if (e.status === "em_rota" || e.status === "entregue") ensure(nome).Expedido += v;
      if (e.status === "entregue") ensure(nome).Entregue += v;
    });
    return Array.from(map.values())
      .sort((a, b) => (b.Produzido + b.Expedido) - (a.Produzido + a.Expedido))
      .slice(0, 10);
  })();

  // Top clientes: Expedido vs Entregue
  const topClientes = (() => {
    const map = new Map<string, { cliente: string; Expedido: number; Entregue: number }>();
    const ensure = (n: string) => {
      if (!map.has(n)) map.set(n, { cliente: n, Expedido: 0, Entregue: 0 });
      return map.get(n)!;
    };
    entregas.forEach((e: any) => {
      const nome = e.clientes?.nome || "—";
      const v = volumeEntregaL(e);
      if (e.status === "em_rota" || e.status === "entregue") ensure(nome).Expedido += v;
      if (e.status === "entregue") ensure(nome).Entregue += v;
    });
    return Array.from(map.values()).sort((a, b) => b.Entregue - a.Entregue).slice(0, 10);
  })();

  // Pizza: entregas por produto
  const pizzaProdutos = (() => {
    const map = new Map<string, number>();
    entreguesList.forEach((e: any) => {
      const nome = nomeProdutoEntrega(e);
      map.set(nome, (map.get(nome) || 0) + volumeEntregaL(e));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  // Matriz Produto × Cliente
  const matrizProdutoCliente = (() => {
    const map = new Map<string, { produto: string; cliente: string; Expedido: number; Entregue: number }>();
    entregas.forEach((e: any) => {
      const produto = nomeProdutoEntrega(e);
      const cliente = e.clientes?.nome || "—";
      const key = `${produto}|${cliente}`;
      if (!map.has(key)) map.set(key, { produto, cliente, Expedido: 0, Entregue: 0 });
      const r = map.get(key)!;
      const v = volumeEntregaL(e);
      if (e.status === "em_rota" || e.status === "entregue") r.Expedido += v;
      if (e.status === "entregue") r.Entregue += v;
    });
    return Array.from(map.values()).sort((a, b) => b.Entregue - a.Entregue);
  })();

  // Filtering and pagination for Estoque Reservado
  const filteredEstoque = estoqueReservado.filter((r: any) => {
    const matchesProduto = !estoqueFilter.produto || 
      (r.produtos?.nome || "").toLowerCase().includes(estoqueFilter.produto.toLowerCase());
    const matchesCliente = !estoqueFilter.cliente || 
      (r.clientes?.nome || "").toLowerCase().includes(estoqueFilter.cliente.toLowerCase());
    return matchesProduto && matchesCliente;
  });

  const totalEstoquePages = Math.ceil(filteredEstoque.length / itemsPerPage);
  const paginatedEstoque = filteredEstoque.slice((estoquePage - 1) * itemsPerPage, estoquePage * itemsPerPage);

  // Aggregação: entregues por produto (alimenta BI de utilização) — mantido p/ compat com export Excel
  const entreguesByProduct: Record<string, { count: number; volumeMl: number }> = {};
  entreguesList.forEach((e: any) => {
    const name = nomeProdutoEntrega(e);
    if (!entreguesByProduct[name]) entreguesByProduct[name] = { count: 0, volumeMl: 0 };
    entreguesByProduct[name].count += 1;
    entreguesByProduct[name].volumeMl += Number(e.volume_entregue_ml) || 0;
  });
  const entreguesProdutoRows = Object.entries(entreguesByProduct).map(([name, v]) => ({
    name, count: v.count, volumeL: (v.volumeMl / 1000).toFixed(1),
  }));

  // Export handlers
  const exportProducao = (format: "pdf" | "excel") => {
    const headers = ["Data", "Código Lote", "Produto", "Volume (L)", "Status"];
    const rows = lotes.map((l: any) => [
      l.data_producao, l.codigo_lote, l.produtos?.nome || "—",
      l.volume_produzido ? (l.volume_produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "0", l.status,
    ]);
    format === "pdf" ? exportPDF("Relatório de Produção", headers, rows) : exportExcel("Produção", headers, rows);
  };

  const exportEntregas = (format: "pdf" | "excel") => {
    const headers = ["Nº OS", "Cliente", "Produto", "Volume Entregue (L)", "Motorista", "Veículo", "Data Saída", "Status"];
    const rows = entregas.map((e: any) => [
      formatOS(e.ordens_servico),
      e.clientes?.nome || "—",
      nomeProdutoEntrega(e),
      e.volume_entregue_ml ? (Number(e.volume_entregue_ml) / 1000).toFixed(1) : "—",
      e.motorista || "—", e.veiculo || "—", e.data_saida || "—", e.status,
    ]);
    if (format === "pdf") {
      exportPDF("Relatório de Entregas", headers, rows);
    } else {
      // Excel com duas abas: detalhe + agregação por produto
      const ws1 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const aggHeaders = ["Produto", "Nº de Entregas", "Volume Entregue (L)"];
      const aggRows = entreguesProdutoRows.map(r => [r.name, String(r.count), r.volumeL]);
      const ws2 = XLSX.utils.aoa_to_sheet([aggHeaders, ...aggRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, "Entregas");
      XLSX.utils.book_append_sheet(wb, ws2, "Por Produto");
      XLSX.writeFile(wb, "entregas.xlsx");
    }
  };

  const exportArea = (format: "pdf" | "excel") => {
    const headers = ["Nº OS", "Cliente", "Fazenda", "Produto", "Área (ha)", "Volume (mL)", "Status"];
    const rows = ordens.map((o: any) => [
      formatOS(o),
      o.clientes?.nome || "—", o.fazendas?.nome || "—", o.produtos?.nome || "—",
      String(o.area_hectares || 0), String(o.volume_total_ml || 0), o.status,
    ]);
    format === "pdf" ? exportPDF("Relatório de Área Atendida", headers, rows) : exportExcel("Área Atendida", headers, rows);
  };

  const exportVistorias = (format: "pdf" | "excel") => {
    const headers = ["Data", "Cliente", "Fazenda", "Talhão", "Cultura", "Problema", "Pressão", "Lat", "Long", "Status"];
    const rows = vistorias.map((v: any) => [
      v.data_vistoria || "—",
      v.clientes?.nome || "—",
      v.fazendas?.nome || "—",
      v.talhoes?.nome || "—",
      v.culturas?.nome || "—",
      v.problema_principal || "—",
      v.nivel_pressao || "—",
      v.latitude ? String(v.latitude) : "—",
      v.longitude ? String(v.longitude) : "—",
      v.status || "—",
    ]);
    format === "pdf" ? exportPDF("Relatório de Vistorias", headers, rows) : exportExcel("Vistorias", headers, rows);
  };

  const exportMatrizCSV = () => {
    const headers = ["Produto", "Cliente", "Expedido (L)", "Entregue (L)", "Em trânsito (L)"];
    const rows = matrizProdutoCliente.map(r => [
      r.produto, r.cliente,
      r.Expedido.toFixed(2), r.Entregue.toFixed(2),
      Math.max(0, r.Expedido - r.Entregue).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `produto-x-cliente-${dateRange.start}-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title="Relatórios"
        description="BI agrícola e exportação de dados"
        action={
          <div className="flex items-center gap-2 justify-between w-full sm:w-auto">
            <div className="flex-1 sm:flex-initial">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">De</Label>
              <Input type="date" value={dateRange.start} onChange={e => setDateRange(r => ({ ...r, start: e.target.value }))} className="h-9 text-sm" />
            </div>
            <div className="flex-1 sm:flex-initial">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Até</Label>
              <Input type="date" value={dateRange.end} onChange={e => setDateRange(r => ({ ...r, end: e.target.value }))} className="h-9 text-sm" />
            </div>
          </div>
        }
      />

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {([
          {
            label: "Produzido",
            value: totalVolume,
            icon: <FlaskConical className="h-4 w-4 text-primary" />,
            tip: {
              tabela: "lotes",
              status: "aprovado, aguardando_cq",
              campo: "Σ volume_produzido",
              conv: "mL ÷ 1000 → L",
            },
          },
          {
            label: "Envasado",
            value: totalEnvasadoMl,
            icon: <Package className="h-4 w-4 text-primary" />,
            tip: {
              tabela: "envase (lotes ≠ reprovado)",
              status: "qualquer (exceto lote reprovado)",
              campo: "Σ (quantidade × volume_por_unidade)",
              conv: "mL ÷ 1000 → L",
            },
          },
          {
            label: "Expedido",
            value: volumeExpedidoMl,
            icon: <Truck className="h-4 w-4 text-[hsl(var(--status-entrega))]" />,
            tip: {
              tabela: "entregas",
              status: "em_rota, entregue",
              campo: "Σ volume_entregue_ml",
              conv: "mL ÷ 1000 → L",
            },
          },
          {
            label: "Entregue",
            value: volumeEntregueMl,
            icon: <Truck className="h-4 w-4 text-emerald-600" />,
            tip: {
              tabela: "entregas",
              status: "entregue",
              campo: "Σ volume_entregue_ml",
              conv: "mL ÷ 1000 → L",
            },
          },
          {
            label: "Saldo a entregar",
            value: volumeSaldoReservadoMl,
            icon: <Package className="h-4 w-4 text-amber-600" />,
            tip: {
              tabela: "estoque_produto",
              status: "reservado",
              campo: "Σ volume_total",
              conv: "mL ÷ 1000 → L",
            },
          },
        ] as const).map((k) => (
          <Card key={k.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`Como ${k.label} é calculado`} className="text-muted-foreground/70 hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
                    <div className="font-semibold text-sm">{k.label}</div>
                    <div><span className="text-muted-foreground">Tabela:</span> <span className="font-mono-data">{k.tip.tabela}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <span className="font-mono-data">{k.tip.status}</span></div>
                    <div><span className="text-muted-foreground">Campo:</span> <span className="font-mono-data">{k.tip.campo}</span></div>
                    <div><span className="text-muted-foreground">Conversão:</span> {k.tip.conv}</div>
                  </TooltipContent>
                </Tooltip>
              </div>
              {k.icon}
            </CardHeader>
            <CardContent><div className="text-2xl font-bold font-mono-data">{(k.value / 1000).toFixed(1)} L</div></CardContent>
          </Card>
        ))}
      </div>


      <Tabs defaultValue="producao">
        <TabsList className="w-full sm:w-auto overflow-x-auto flex justify-start sm:justify-center h-auto p-1 bg-muted/50 rounded-lg mb-4">
          <TabsTrigger value="producao" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3"><FlaskConical className="h-3 w-3 sm:h-4 sm:w-4" />Prod.</TabsTrigger>
          <TabsTrigger value="entregas" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3"><Truck className="h-3 w-3 sm:h-4 sm:w-4" />Entr.</TabsTrigger>
          <TabsTrigger value="area" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3"><Sprout className="h-3 w-3 sm:h-4 sm:w-4" />Área</TabsTrigger>
          <TabsTrigger value="vistorias" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-[10px] sm:text-sm py-2 px-3"><ClipboardList className="h-3 w-3 sm:h-4 sm:w-4" />Vist.</TabsTrigger>
        </TabsList>

        {/* Production Tab */}
        <TabsContent value="producao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Evolução semanal (L)</CardTitle>
              <CardDescription>Produzido, Expedido e Entregue por semana</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {serieTemporal.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serieTemporal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="semana" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <RTooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(v: any) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Produzido" stroke={CHART_COLORS[0]} strokeWidth={2} />
                    <Line type="monotone" dataKey="Expedido" stroke={CHART_COLORS[1]} strokeWidth={2} />
                    <Line type="monotone" dataKey="Entregue" stroke={CHART_COLORS[2]} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 10 produtos — Produzido vs Expedido vs Entregue (L)</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {topProdutos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topProdutos} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="produto" stroke="hsl(var(--muted-foreground))" fontSize={12} width={140} />
                    <RTooltip formatter={(v: any) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
                    <Legend />
                    <Bar dataKey="Produzido" fill={CHART_COLORS[0]} />
                    <Bar dataKey="Expedido" fill={CHART_COLORS[1]} />
                    <Bar dataKey="Entregue" fill={CHART_COLORS[2]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Produção por Produto</CardTitle>
                <CardDescription>Volume produzido no período (litros)</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportProducao("pdf")}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                <Button variant="outline" size="sm" onClick={() => exportProducao("excel")}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
              </div>
            </CardHeader>
            <CardContent>
              {prodChartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <BarChart data={prodChartData}>
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ChartContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de produção no período</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className={isMobile ? "p-4" : "pt-6"}>
              <ResponsiveTable
                mobileCards={
                  lotes.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem dados de produção</div>
                  ) : (
                    lotes.map((l: any) => (
                      <MobileCard
                        key={l.id}
                        title={l.produtos?.nome}
                        subtitle={l.codigo_lote}
                        status={<Badge variant="outline" className="text-[10px]">{l.status}</Badge>}
                        content={[
                          { label: "Data", value: l.data_producao },
                          { label: "Volume", value: l.volume_produzido ? `${(l.volume_produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` : "—" },
                        ]}
                      />
                    ))
                  )
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead><TableHead>Lote</TableHead><TableHead>Produto</TableHead><TableHead>Volume (L)</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotes.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                    ) : lotes.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.data_producao}</TableCell>
                        <TableCell className="font-mono-data text-xs">{l.codigo_lote}</TableCell>
                        <TableCell>{l.produtos?.nome}</TableCell>
                        <TableCell className="font-mono-data">{l.volume_produzido ? (l.volume_produzido / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</TableCell>
                        <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Deliveries Tab */}
        <TabsContent value="entregas" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Entregas por Cliente</CardTitle>
                <CardDescription>Entregas realizadas no período</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportEntregas("pdf")}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                <Button variant="outline" size="sm" onClick={() => exportEntregas("excel")}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
              </div>
            </CardHeader>
            <CardContent className={isMobile ? "p-4" : "p-0 sm:p-6 sm:pt-0"}>
              <ResponsiveTable
                mobileCards={
                  entregas.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">Sem entregas no período</div>
                  ) : (
                    entregas.map((e: any) => (
                      <MobileCard
                        key={e.id}
                        title={e.clientes?.nome || "—"}
                        subtitle={`Motorista: ${e.motorista || "—"}`}
                        status={<Badge variant="outline" className="text-[10px]">{e.status}</Badge>}
                        content={[
                          { label: "Veículo", value: e.veiculo || "—" },
                          { label: "Saída", value: e.data_saida || "—" },
                          { label: "Ref", value: e.ordem_servico_id?.slice(0, 8) || "—" },
                        ]}
                      />
                    ))
                  )
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead><TableHead>Motorista</TableHead><TableHead>Veículo</TableHead><TableHead>Data Saída</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entregas.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem entregas no período</TableCell></TableRow>
                    ) : entregas.map((e: any) => (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium">{e.clientes?.nome}</TableCell>
                        <TableCell>{e.motorista || "—"}</TableCell>
                        <TableCell>{e.veiculo || "—"}</TableCell>
                        <TableCell>{e.data_saida || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{e.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>

          {/* Entregues por Produto — BI de utilização */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Entregues por Produto</CardTitle>
              <CardDescription>Utilização dos produtos fabricados (apenas entregas concluídas)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Nº de Entregas</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entreguesProdutoRows.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhuma entrega concluída no período</TableCell></TableRow>
                  ) : entreguesProdutoRows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right font-mono-data">{r.count}</TableCell>
                      <TableCell className="text-right font-mono-data">{r.volumeL}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Top 10 clientes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Top 10 clientes — Expedido vs Entregue (L)</CardTitle>
            </CardHeader>
            <CardContent className="h-96">
              {topClientes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem entregas no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topClientes} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="cliente" stroke="hsl(var(--muted-foreground))" fontSize={12} width={140} />
                    <RTooltip formatter={(v: any) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
                    <Legend />
                    <Bar dataKey="Expedido" fill={CHART_COLORS[1]} />
                    <Bar dataKey="Entregue" fill={CHART_COLORS[2]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Pizza: distribuição por produto */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Distribuição de entregas por produto</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {pizzaProdutos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sem entregas no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pizzaProdutos} dataKey="value" nameKey="name" outerRadius={110} label={(d: any) => d.name}>
                      {pizzaProdutos.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RTooltip formatter={(v: any) => `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Matriz Produto × Cliente */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Detalhamento Produto × Cliente</CardTitle>
                <CardDescription>Volume expedido, entregue e em trânsito (expedido sem confirmação de entrega)</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportMatrizCSV}>
                <FileDown className="h-4 w-4 mr-1" />CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Expedido (L)</TableHead>
                    <TableHead className="text-right">Entregue (L)</TableHead>
                    <TableHead className="text-right">Em trânsito (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrizProdutoCliente.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                  ) : matrizProdutoCliente.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.produto}</TableCell>
                      <TableCell>{r.cliente}</TableCell>
                      <TableCell className="text-right font-mono-data">{r.Expedido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-right font-mono-data">{r.Entregue.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                      <TableCell className="text-right font-mono-data">{Math.max(0, r.Expedido - r.Entregue).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Saldo a entregar — estoque reservado */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-lg">Saldo a entregar (estoque reservado)</CardTitle>
                <CardDescription>Produtos reservados para OS ainda não expedidos</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar produto..."
                    className="pl-8 h-9 text-sm w-full sm:w-[180px]"
                    value={estoqueFilter.produto}
                    onChange={(e) => {
                      setEstoqueFilter(prev => ({ ...prev, produto: e.target.value }));
                      setEstoquePage(1);
                    }}
                  />
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Filtrar cliente..."
                    className="pl-8 h-9 text-sm w-full sm:w-[180px]"
                    value={estoqueFilter.cliente}
                    onChange={(e) => {
                      setEstoqueFilter(prev => ({ ...prev, cliente: e.target.value }));
                      setEstoquePage(1);
                    }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 sm:pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Cliente reservado</TableHead>
                    <TableHead className="text-right">Volume (L)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEstoque.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        {estoqueFilter.produto || estoqueFilter.cliente ? "Nenhum resultado para os filtros" : "Nenhum item reservado"}
                      </TableCell>
                    </TableRow>
                  ) : paginatedEstoque.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.produtos?.nome || "—"}</TableCell>
                      <TableCell>{r.clientes?.nome || "—"}</TableCell>
                      <TableCell className="text-right font-mono-data">
                        {((Number(r.volume_total) || 0) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalEstoquePages > 1 && (
                <div className="flex items-center justify-between px-4 py-4 sm:px-0">
                  <div className="text-xs text-muted-foreground">
                    Página {estoquePage} de {totalEstoquePages} ({filteredEstoque.length} itens)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEstoquePage(p => Math.max(1, p - 1))}
                      disabled={estoquePage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEstoquePage(p => Math.min(totalEstoquePages, p + 1))}
                      disabled={estoquePage === totalEstoquePages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vistorias Tab */}
        <TabsContent value="vistorias" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Relatório de Vistorias de Campo</CardTitle>
                <CardDescription>Detalhamento de vistorias e geolocalização no período</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportVistorias("pdf")}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                <Button variant="outline" size="sm" onClick={() => exportVistorias("excel")}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
              </div>
            </CardHeader>
            <CardContent className={isMobile ? "p-3" : "pt-6"}>
              <ResponsiveTable
                mobileCards={
                  vistorias.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 italic border border-dashed rounded-lg">Sem vistorias no período</div>
                  ) : (
                    vistorias.map((v: any) => (
                      <MobileCard
                        key={v.id}
                        title={v.clientes?.nome || "Cliente —"}
                        subtitle={`${v.fazendas?.nome || ""} • ${v.talhoes?.nome || ""}`}
                        status={<Badge variant="outline" className="text-[10px]">{v.status}</Badge>}
                        content={[
                          { label: "Problema", value: v.problema_principal || "—" },
                          { label: "Pressão", value: v.nivel_pressao || "—" },
                          { label: "Data", value: v.data_vistoria || "—" },
                        ]}
                      />
                    ))
                  )
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente/Fazenda</TableHead>
                      <TableHead>Talhão</TableHead>
                      <TableHead>Problema</TableHead>
                      <TableHead>Pressão</TableHead>
                      <TableHead>Coordenadas (GPS)</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vistorias.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem vistorias no período</TableCell></TableRow>
                    ) : vistorias.map((v: any) => (
                      <TableRow key={v.id}>
                        <TableCell className="text-sm whitespace-nowrap">{v.data_vistoria || "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{v.clientes?.nome || "—"}</div>
                          <div className="text-xs text-muted-foreground">{v.fazendas?.nome || "—"}</div>
                        </TableCell>
                        <TableCell>{v.talhoes?.nome || "—"}</TableCell>
                        <TableCell>{v.problema_principal || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{v.nivel_pressao || "—"}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10px]">
                          {v.latitude && v.longitude ? (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-primary" />
                              <span>{Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                        <TableCell><Badge variant="secondary">{v.status || "—"}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Area Tab */}
        <TabsContent value="area" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">Área Atendida por Cliente</CardTitle>
                <CardDescription>Hectares atendidos no período</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => exportArea("pdf")}><FileDown className="h-4 w-4 mr-1" />PDF</Button>
                <Button variant="outline" size="sm" onClick={() => exportArea("excel")}><FileSpreadsheet className="h-4 w-4 mr-1" />Excel</Button>
              </div>
            </CardHeader>
            <CardContent>
              {areaChartData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[220px] w-full">
                  <BarChart data={areaChartData}>
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis />
                    <Bar dataKey="value" fill="hsl(var(--status-aprovado))" radius={[4, 4, 0, 0]} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ChartContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>}
            </CardContent>
          </Card>
          <Card>
            <CardContent className={isMobile ? "p-3" : "pt-6"}>
              <ResponsiveTable
                mobileCards={
                  ordens.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 italic border border-dashed rounded-lg">Sem dados de área atendida</div>
                  ) : (
                    ordens.map((o: any) => (
                      <MobileCard
                        key={o.id}
                        title={o.clientes?.nome || "—"}
                        subtitle={o.fazendas?.nome || "—"}
                        status={<Badge variant="outline" className="text-[10px]">{o.status}</Badge>}
                        content={[
                          { label: "Produto", value: o.produtos?.nome || "—" },
                          { label: "Área", value: `${o.area_hectares || 0} ha` },
                          { label: "Volume", value: `${o.volume_total_ml || 0} mL` },
                        ]}
                      />
                    ))
                  )
                }
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead><TableHead>Fazenda</TableHead><TableHead>Produto</TableHead><TableHead>Área (ha)</TableHead><TableHead>Volume (mL)</TableHead><TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordens.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem dados</TableCell></TableRow>
                    ) : ordens.map((o: any) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.clientes?.nome}</TableCell>
                        <TableCell>{o.fazendas?.nome}</TableCell>
                        <TableCell>{o.produtos?.nome}</TableCell>
                        <TableCell className="font-mono-data">{o.area_hectares || "—"}</TableCell>
                        <TableCell className="font-mono-data">{o.volume_total_ml || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ResponsiveTable>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
