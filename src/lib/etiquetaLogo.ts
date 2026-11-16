// Prepared logos are document-local capabilities, never persisted or accepted from a URL.
export interface PreparedLabelLogo { readonly dataUrl: string; readonly width: number; readonly height: number; readonly scope: string }
const prepared = new WeakSet<object>();
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MAX_DIMENSION = 4096;
export function inspectLogoBytes(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > LOGO_MAX_BYTES) throw new Error('A imagem deve ter até 2 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  let width = 0; let height = 0; let type = '';
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v) && ascii(12,16) === 'IHDR') {
    type = 'image/png'; width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length > 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    type = 'image/jpeg';
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 255) { offset++; continue; }
      if (marker === 217 || marker === 218) break;
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([192,193,194].includes(marker ?? 0) && length >= 8) { height = view.getUint16(offset + 5); width = view.getUint16(offset + 7); break; }
      offset += 2 + length;
    }
  } else if (bytes.length >= 30 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP' && view.getUint32(4,true) + 8 === bytes.length) {
    type = 'image/webp'; const chunk = ascii(12,16);
    if (chunk === 'VP8X') { width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16); height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16); if ((bytes[20] ?? 0) & 2) throw new Error('Imagens animadas não são permitidas.'); }
    else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { width = view.getUint16(26,true) & 16383; height = view.getUint16(28,true) & 16383; }
    else if (chunk === 'VP8L' && bytes[20] === 47) { const bits = view.getUint32(21,true); width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; }
  }
  if (!type || type !== mime || !width || !height) throw new Error('Use PNG, JPEG ou WebP válido, com tipo e assinatura correspondentes.');
  if (width > LOGO_MAX_DIMENSION || height > LOGO_MAX_DIMENSION || width * height > 16000000) throw new Error('Dimensões máximas: 4096 px por lado e 16 megapixels.');
  return { width, height, type };
}
export async function prepareLabelLogo(file: File, scope: string): Promise<PreparedLabelLogo> {
  if (file.size > LOGO_MAX_BYTES) throw new Error('A imagem deve ter até 2 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const metadata = inspectLogoBytes(bytes, file.type);
  const url = URL.createObjectURL(new Blob([bytes], { type: metadata.type }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { image.src = ''; reject(new Error('Tempo de leitura da imagem excedido.')); }, 10000);
      image.onload = () => { clearTimeout(timeout); resolve(); };
      image.onerror = () => { clearTimeout(timeout); reject(new Error('Imagem corrompida ou não decodificável.')); };
      image.src = url;
    });
    if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) throw new Error('Dimensões da imagem divergentes.');
    const scale = Math.min(1, 1200 / Math.max(metadata.width, metadata.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(metadata.width * scale)); canvas.height = Math.max(1, Math.round(metadata.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Conversão segura da imagem indisponível.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) { const grey = Math.round(.299 * pixels.data[i] + .587 * pixels.data[i + 1] + .114 * pixels.data[i + 2]); pixels.data[i] = grey; pixels.data[i + 1] = grey; pixels.data[i + 2] = grey; }
    ctx.putImageData(pixels, 0, 0);
    const logo = Object.freeze({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, scope });
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logo.dataUrl)) throw new Error('Imagem convertida inválida.');
    prepared.add(logo); return logo;
  } finally { URL.revokeObjectURL(url); }
}
export function validatedLabelLogo(value: unknown, scope?: string): PreparedLabelLogo | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || !prepared.has(value)) throw new Error('Logomarca não validada para este documento.');
  const logo = value as PreparedLabelLogo;
  if (scope !== undefined && logo.scope !== scope) throw new Error('Logomarca pertence a outro contexto.');
  return logo;
}