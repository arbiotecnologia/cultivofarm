import imageCompression from 'browser-image-compression';

export type ImageQuality = 'standard' | 'hd' | 'original';

export async function compressImage(file: File, quality: ImageQuality = 'standard'): Promise<File> {
  // Se não for imagem, não comprime
  if (!file.type.startsWith('image/')) return file;
  
  // Se for original, apenas retorna o arquivo
  if (quality === 'original') return file;

  // Se for GIF, melhor não comprimir pois pode perder animação ou estragar o arquivo dependendo da lib
  if (file.type === 'image/gif') return file;

  const options = quality === 'hd' ? {
    maxSizeMB: 5, // Limite de 5MB para HD
    maxWidthOrHeight: 3840, // 4K resolution
    useWebWorker: true,
    initialQuality: 0.92,
  } : {
    maxSizeMB: 1, // Limite de 1MB para upload em 3G/4G
    maxWidthOrHeight: 1920, // Resolução Full HD
    useWebWorker: true,
    initialQuality: 0.8,
  };

  try {
    const compressedFile = await imageCompression(file, options);
    // Preserva o nome original
    return new File([compressedFile], file.name, {
      type: compressedFile.type,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.error('Erro na compressão:', error);
    return file; // Fallback para o original em caso de erro
  }
}


export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
