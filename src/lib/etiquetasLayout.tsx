import { jsPDF } from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LABEL_FORMATS, type LabelFormat, type RecipientLabel, snapshotFields, snapshotTemplate, secureTraceUrl, safeSnapshotLogo, validateRecipientV2, outputFormat, record, text, approvedDate } from './etiquetasRecipientes';

interface TextBlock { lines: string[]; x: number; y: number; size: number; step: number; bold: boolean }
export interface LabelLayout { lines: string[]; fontSize: number; lineHeight: number; qr: number; qrX: number; qrY: number; width: number; height: number; blocks: TextBlock[]; rules: number[]; logo?: { x: number; y: number; width: number; height: number }; toxicityY?: number }
export function labelLayout(label: RecipientLabel, format: LabelFormat): LabelLayout {
  snapshotTemplate(label);
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
  const logo = logoOverride ?? safeSnapshotLogo(label);
  return <svg xmlns="http://www.w3.org/2000/svg" width={`${layout.width}mm`} height={`${layout.height}mm`} viewBox={`0 0 ${layout.width} ${layout.height}`} className="recipient-label-scene" role="img" aria-label={`Etiqueta ${label.codigo_etiqueta}`}>
    <rect width={layout.width} height={layout.height} className="label-paper" />
    <rect x=".2" y=".2" width={layout.width - .4} height={layout.height - .4} fill="none" className="label-rule" strokeWidth=".25" />
    {layout.rules.map((y,i) => <line key={i} x1="0" y1={y} x2={layout.width} y2={y} className="label-rule" strokeWidth=".25" />)}
    {layout.logo && logo && <image href={logo} {...layout.logo} preserveAspectRatio="xMidYMid meet" />}
    {layout.blocks.map((b,i) => <text key={i} x={b.x} y={b.y} fontFamily="Arial, Helvetica, sans-serif" fontSize={b.size * .352778} fontWeight={b.bold ? 700 : 400} className="label-text" dominantBaseline="text-before-edge">{b.lines.map((line,j) => <tspan key={j} x={b.x} y={b.y + j * b.step}>{line}</tspan>)}</text>)}
    <svg x={layout.qrX} y={layout.qrY} width={layout.qr} height={layout.qr} viewBox="0 0 400 400" className="recipient-label-qr"><QRCodeSVG value={secureTraceUrl(label.trace_token, origin)} size={400} level="M" marginSize={4} /></svg>
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
  labels.forEach(label => { if (label.snapshot.layout_versao !== 'recipiente-v2') throw new Error('Etiqueta legada: regularização para recipiente-v2 obrigatória antes da saída de recipientes.'); });
  const formats = labels.map(label => outputFormat(label, format));
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
    const logo = safeSnapshotLogo(label);
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
