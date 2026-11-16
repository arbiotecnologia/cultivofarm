import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { looseLabelSchema, provisionalFormat } from './etiquetaAvulsa';
import { validatedLabelLogo } from './etiquetaLogo';
import { LABEL_FORMATS, type LabelFormat, type RecipientLabel, snapshotFields, snapshotTemplate, secureTraceUrl, safeSnapshotLogo, validateRecipientV2, outputFormat, record, text, approvedDate } from './etiquetasRecipientes';

interface TextBlock { lines: string[]; x: number; y: number; size: number; step: number; bold: boolean }
export interface LabelLayout { lines: string[]; fontSize: number; lineHeight: number; qr: number; qrX: number; qrY: number; width: number; height: number; blocks: TextBlock[]; rules: number[]; logo?: { x: number; y: number; width: number; height: number }; toxicityY?: number }
export function labelLayout(label: RecipientLabel, format: LabelFormat): LabelLayout {
  snapshotTemplate(label);
  const provisional = provisionalFormat(label);
  if (provisional) {
    if (format !== provisional) throw new Error('Formato divergente da etiqueta provisória.');
    const raw = label.snapshot.provisional_data as Record<string, unknown>;
    const v = looseLabelSchema.parse({ ...raw, volume: String(raw.volume) });
    const { width, height } = LABEL_FORMATS[format];
    const pdf = new jsPDF({ unit: 'mm', format: [width, height] });
    const blocks: TextBlock[] = []; const rules: number[] = [];
    const size = height === 50 ? 's' : height === 100 ? 'm' : 'l';
    const S = { s: { pad: 2.2, company: 7, product: 10.5, volume: 10, key: 5.6, value: 6, footer: 5, gap: .5, section: 1, maxGap: 1.2, keyCol: 17 },
      m: { pad: 3.5, company: 10, product: 16, volume: 14, key: 7, value: 8.5, footer: 6.5, gap: .9, section: 1.8, maxGap: 2.4, keyCol: 25 },
      l: { pad: 4, company: 11, product: 20, volume: 17, key: 8, value: 10, footer: 7.5, gap: 1.2, section: 2.5, maxGap: 3.2, keyCol: 28 } }[size];
    const pad = S.pad; const inner = width - pad * 2;
    const wrap = (value: string, available: number, pt: number, bold = false) => { pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(pt); return pdf.splitTextToSize(value, available) as string[]; };
    const stepOf = (pt: number, lh = 1.22) => pt * .352778 * lh;
    const push = (lines: string[], x: number, top: number, pt: number, bold: boolean, lh?: number) => { const step = stepOf(pt, lh); blocks.push({ lines, x, y: top, size: pt, step, bold }); return lines.length * step; };
    const image = validatedLabelLogo(label.snapshot.provisional_logo);
    let y = pad;
    // Header: logo box + company, same hierarchy as the official recipient label.
    const logo = image ? { x: pad, y: pad, width: size === 's' ? 10 : size === 'm' ? 20 : 24, height: size === 's' ? 4.2 : size === 'm' ? 9 : 11 } : undefined;
    const companyX = logo ? pad + logo.width + (size === 's' ? 1.5 : 2.5) : pad;
    const companyLines = wrap(v.company, width - pad - companyX, S.company, true);
    const companyH = companyLines.length * stepOf(S.company);
    const headerH = Math.max(companyH, logo?.height ?? 0);
    push(companyLines, companyX, y + (headerH - companyH) / 2, S.company, true);
    y += headerH + S.section * .6; rules.push(y); y += S.section * .8;
    // Product highlight + volume.
    const volumeText = `${v.volume.toLocaleString('pt-BR')} ${v.unit}`;
    if (size === 's') {
      const volLines = wrap(volumeText, 20, S.volume, true);
      const prodLines = wrap(v.product, inner - 22, S.product, true);
      const ph = push(prodLines, pad, y, S.product, true, 1.12);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(S.volume);
      const vw = Math.max(...volLines.map(l => pdf.getTextWidth(l)));
      const vh = push(volLines, width - pad - vw, y, S.volume, true, 1.12);
      y += Math.max(ph, vh);
    } else {
      y += push(wrap(v.product, inner, S.product, true), pad, y, S.product, true, 1.12) + S.gap;
      y += push(wrap(volumeText, inner, S.volume, true), pad, y, S.volume, true, 1.12);
    }
    y += S.section * .6; rules.push(y); y += S.section * .8;
    const r = record(label.snapshot.recipiente);
    if (!Number.isInteger(r.seq) || Number(r.seq) < v.first || Number(r.seq) >= v.first + v.quantity || r.total !== v.total) throw new Error('Sequência provisória inválida.');
    const rows: [string, string][] = ([
      ['Lote (ref.)', v.lot], ['Fabricação', v.manufactured], ['Envase', v.bottled], ['Validade', v.expiry || 'não informada'],
      ['Cliente', v.client], ['Fazenda', v.farm], ['Pedido (ref.)', v.order], ['Composição', v.composition], ['Toxicidade', v.toxicity || 'não informada — consultar ficha técnica'],
      ['Conservação', v.conservation], ['Observações', v.notes],
    ] as [string, string][]).filter(([, value]) => !!value);
    const valueX = pad + S.keyCol; const valueW = width - pad - valueX;
    const techStart = rows.findIndex(([key]) => ['Composição', 'Toxicidade', 'Conservação', 'Observações'].includes(key));
    const measured = rows.map(([key, value]) => {
      const k = wrap(key.toUpperCase(), S.keyCol - 1, S.key, true); const val = wrap(value, valueW, S.value);
      return { k, val, h: Math.max(k.length * stepOf(S.key), val.length * stepOf(S.value)) };
    });
    // Footer anchored at the bottom: recipient, origin and legal notice.
    const recipient = `RECIPIENTE ${String(r.seq).padStart(2, '0')}/${String(r.total).padStart(2, '0')}`;
    const originText = v.origin === 'manual' ? 'AVULSA · NÃO VINCULADA À PRODUÇÃO' : `AVULSA · PRODUÇÃO ${v.productionKey}`;
    const recipientLines = wrap(recipient, inner, S.value + 1, true);
    const originLines = wrap(originText, inner, S.key, true);
    const legalLines = wrap('ETIQUETA OPERACIONAL PROVISÓRIA — NÃO SUBSTITUI ROTULAGEM LEGAL OBRIGATÓRIA.', inner, S.footer, true);
    const footerH = recipientLines.length * stepOf(S.value + 1) + S.gap + originLines.length * stepOf(S.key) + S.section * .8 + legalLines.length * stepOf(S.footer);
    const footerTop = height - pad - footerH;
    const bodyH = measured.reduce((sum, m) => sum + m.h, 0) + S.gap * Math.max(0, measured.length - 1) + (techStart > 0 ? S.gap * 2 : 0);
    const free = footerTop - S.section - y - bodyH;
    if (free < 0) throw new Error(`Conteúdo excede ${format} mm. Escolha um formato maior; nenhum texto será cortado.`);
    const gap = S.gap + Math.min(S.maxGap - S.gap, measured.length > 1 ? free / (measured.length - 1) : 0);
    y += Math.max(0, Math.min(S.section, free - (gap - S.gap) * Math.max(0, measured.length - 1)) / 2);
    measured.forEach((m, i) => { if (i === techStart && i > 0) { rules.push(y - gap / 2 + S.gap); y += S.gap * 2; } push(m.k, pad, y + (S.value - S.key) * .352778 * .5, S.key, true); push(m.val, valueX, y, S.value, false); y += m.h + gap; });
    let f = footerTop; rules.push(f - S.section * .5);
    f += push(recipientLines, pad, f, S.value + 1, true) + S.gap;
    f += push(originLines, pad, f, S.key, true) + S.section * .4; rules.push(f); f += S.section * .4;
    f += push(legalLines, pad, f, S.footer, true);
    if (f > height - pad + .01) throw new Error(`Conteúdo excede ${format} mm. Escolha um formato maior; nenhum texto será cortado.`);
    return { lines: blocks.flatMap(b => b.lines), fontSize: S.value, lineHeight: stepOf(S.value), qr: 0, qrX: 0, qrY: 0, width, height, blocks, rules, logo };
  }
  const { width, height } = LABEL_FORMATS[format];
  const pdf = new jsPDF({ unit: 'mm', format: [width, height] });
  const operational = label.tipo_etiqueta === 'interna' || label.snapshot.layout_versao === 'recipiente-v2';
  const blocks: TextBlock[] = []; const rules: number[] = [];
  const compact = height === 50;
  const pad = compact ? 2 : 3;
  const bodySize = compact ? 7 : height === 100 ? 9 : 11;
  const qr = compact ? 20 : height === 100 ? 26 : 30;
  const qrX = width - pad - qr;
  let y = pad;
  const wrap = (value: string, available: number, size: number, bold = false) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(size);
    return pdf.splitTextToSize(value, available) as string[];
  };
  const add = (value: string, x: number, top: number, available: number, size: number, bold = false) => {
    const lines = wrap(value, available, size, bold); const step = size * 0.352778 * 1.18;
    blocks.push({ lines, x, y: top, size, step, bold });
    return lines.length * step;
  };
  if (!operational) {
    const fontSize = height <= 50 ? 6 : 8;
    const lines = [label.codigo_etiqueta, `OFICIAL · ${label.tipo_etiqueta}`, ...snapshotFields(label).map(([k,v]) => `${k}: ${v}`)];
    const used = add(lines.join('\n'), pad, y, width - pad * 2, fontSize);
    if (used + qr + pad * 3 > height) throw new Error(`Conteúdo excede ${format} mm. Nenhum dado será cortado.`);
    return { lines: blocks.flatMap(b => b.lines), fontSize, lineHeight: fontSize * .352778 * 1.18, qr, qrX, qrY: height - qr - pad, width, height, blocks, rules };
  }
  const approved = validateRecipientV2(label, format);
  const s = label.snapshot;
  const logoSource = safeSnapshotLogo(label);
  const logo = logoSource ? { x: pad, y: pad, width: compact ? 10 : 16, height: compact ? 5 : 8 } : undefined;
  const logoWidth = logo ? logo.width + 2 : 0;
  y += Math.max(add(text(record(s.empresa).nome), pad + logoWidth, y, width - pad * 2 - logoWidth, compact ? 7 : 10, true), logo?.height ?? 0) + (compact ? .6 : 2);
  const productHeight = add(text(s.produto_nome), pad, y, compact ? width - pad * 2 - 16 : width - pad * 2, compact ? 11 : height === 100 ? 20 : 26, true);
  if (!compact) y += productHeight + 2;
  const volumeHeight = add(approved.volume, compact ? width - pad - 15 : pad, y, compact ? 15 : width - pad * 2, compact ? 14 : height === 100 ? 23 : 30, true);
  y += (compact ? Math.max(productHeight, volumeHeight) : volumeHeight) + (compact ? .7 : 2);
  rules.push(y); y += compact ? 1 : 2;
  const qrY = y;
  const available = width - pad * 3 - qr;
  const core = [`Lote: ${text(s.lote_codigo)}`, `Validade: ${approved.validity}`, `${label.codigo_etiqueta} · ${approved.sequence}`, label.tipo_etiqueta === 'interna' ? 'OPERACIONAL · INTERNA' : `OFICIAL · ${label.tipo_etiqueta.toUpperCase()}`];
  const excluded = new Set(['Empresa','Produto','Lote','Volume','Validade','Toxicidade']);
  const details = snapshotFields(label).filter(([key]) => !excluded.has(key)).map(([key, value]) => {
    if (key === 'Envase' || key === 'Fabricação') {
      try { return `${key}: ${approvedDate(value)}`; } catch { return `${key}: ${value}`; }
    }
    return `${key}: ${value}`;
  });
  const contentHeight = add([...core, ...details].join('\n'), pad, y, available, bodySize);
  const bodyEnd = y + Math.max(contentHeight, qr);
  const toxicitySize = compact ? 7.5 : height === 100 ? 10 : 12;
  const toxicityLines = wrap(approved.toxicity, width - pad * 2, toxicitySize);
  const toxicityHeight = (toxicityLines.length + 1) * toxicitySize * .352778 * 1.18 + 2;
  const toxicityY = height - pad - toxicityHeight;
  if (bodyEnd + (compact ? 1 : 3) > toxicityY) throw new Error(`Conteúdo excede ${format} mm. Regularize o conteúdo aprovado; nenhum texto será truncado ou removido.`);
  // Distribute available space through body rows rather than a central empty desert.
  const bodyBlock = blocks[blocks.length - 1];
  if (bodyBlock && bodyBlock.lines.length > 1) bodyBlock.step += Math.max(0, toxicityY - (compact ? 1 : 3) - (y + contentHeight)) / bodyBlock.lines.length;
  rules.push(toxicityY);
  add('TOXICIDADE', pad, toxicityY + 1, width - pad * 2, toxicitySize, true);
  add(approved.toxicity, pad, toxicityY + 1 + toxicitySize * .352778 * 1.18, width - pad * 2, toxicitySize);
  return { lines: blocks.flatMap(b => b.lines), fontSize: bodySize, lineHeight: bodySize * .352778 * 1.18, qr, qrX, qrY, width, height, blocks, rules, logo, toxicityY };
}
export function LabelScene({ label, format, origin, logoOverride }: { label: RecipientLabel; format: LabelFormat; origin: string; logoOverride?: string }) {
  const layout = labelLayout(label, format);
  const logo = provisionalFormat(label) ? validatedLabelLogo(label.snapshot.provisional_logo)?.dataUrl : logoOverride ?? safeSnapshotLogo(label);
  return <svg xmlns="http://www.w3.org/2000/svg" width={`${layout.width}mm`} height={`${layout.height}mm`} viewBox={`0 0 ${layout.width} ${layout.height}`} className="recipient-label-scene" role="img" aria-label={`Etiqueta ${label.codigo_etiqueta}`}>
    <rect width={layout.width} height={layout.height} className="label-paper" />
    <rect x=".2" y=".2" width={layout.width - .4} height={layout.height - .4} fill="none" className="label-rule" strokeWidth=".25" />
    {layout.rules.map((y,i) => <line key={i} x1="0" y1={y} x2={layout.width} y2={y} className="label-rule" strokeWidth=".25" />)}
    {layout.logo && logo && <image href={logo} {...layout.logo} preserveAspectRatio="xMidYMid meet" />}
    {layout.blocks.map((b,i) => <text key={i} x={b.x} y={b.y} fontFamily="Arial, Helvetica, sans-serif" fontSize={b.size * .352778} fontWeight={b.bold ? 700 : 400} className="label-text" dominantBaseline="text-before-edge">{b.lines.map((line,j) => <tspan key={j} x={b.x} y={b.y + j * b.step}>{line}</tspan>)}</text>)}
    {layout.qr > 0 && <svg x={layout.qrX} y={layout.qrY} width={layout.qr} height={layout.qr} viewBox="0 0 400 400" className="recipient-label-qr"><QRCodeSVG value={secureTraceUrl(label.trace_token, origin)} size={400} level="M" marginSize={4} /></svg>}
  </svg>;
}
async function bitmap(source: string, width?: number, height?: number): Promise<string> {
  const image = new Image(); image.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Imagem da etiqueta indisponível. Saída bloqueada.')); image.src = source; });
  const canvas = document.createElement('canvas'); canvas.width = width ?? (image.naturalWidth || 400); canvas.height = height ?? (image.naturalHeight || 400);
  const context = canvas.getContext('2d'); if (!context) throw new Error('Conversão de imagem indisponível.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}
export async function createRecipientLabelsPdf(labels: RecipientLabel[], format: LabelFormat, media: 'termica' | 'convencional', origin: string) {
  if (!labels.length) throw new Error('Selecione etiquetas para a saída.');
  labels.forEach(label => { if (!provisionalFormat(label) && label.snapshot.layout_versao !== 'recipiente-v2') throw new Error('Etiqueta legada: regularização para recipiente-v2 obrigatória antes da saída de recipientes.'); });
  const formats = labels.map(label => provisionalFormat(label) ?? outputFormat(label, format));
  const layouts = labels.map((label,i) => labelLayout(label, formats[i] ?? format));
  const first = layouts[0]; if (!first) throw new Error('Seleção inválida.');
  const pdf = new jsPDF({ unit: 'mm', format: media === 'termica' ? [first.width, first.height] : 'a4', orientation: media === 'termica' && first.width > first.height ? 'landscape' : 'portrait', compress: true });
  let x = 5; let y = 5; let rowHeight = 0;
  for (let index = 0; index < labels.length; index++) {
    const label = labels[index]; const layout = layouts[index]; if (!label || !layout) continue;
    if (media === 'termica') {
      x = 0; y = 0;
      if (index) pdf.addPage([layout.width, layout.height], layout.width > layout.height ? 'landscape' : 'portrait');
    } else {
      if (x + layout.width > 205) { x = 5; y += rowHeight; rowHeight = 0; }
      if (y + layout.height > 292) { pdf.addPage('a4','portrait'); x = 5; y = 5; rowHeight = 0; }
    }
    const logo = provisionalFormat(label) ? validatedLabelLogo(label.snapshot.provisional_logo)?.dataUrl : safeSnapshotLogo(label);
    const logoOverride = logo ? await bitmap(logo) : undefined;
    let svg = renderToStaticMarkup(<LabelScene label={label} format={formats[index] ?? format} origin={origin} logoOverride={logoOverride} />);
    // Standalone SVG exports carry the same semantic ink/paper roles as the CSS scene.
    svg = svg.replace('<svg ', '<svg ').replace('><rect', '><style>.label-paper{fill:white}.label-text{fill:black}.label-rule{stroke:black}</style><rect');
    const image = await bitmap(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, Math.ceil(layout.width / 25.4 * 406), Math.ceil(layout.height / 25.4 * 406));
    pdf.addImage(image, 'PNG', x, y, layout.width, layout.height, undefined, 'FAST');
    if (media === 'convencional') { x += layout.width; rowHeight = Math.max(rowHeight, layout.height); }
  }
  return pdf;
}
