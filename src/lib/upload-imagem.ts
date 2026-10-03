/** Reduz a imagem antes do upload, preservando a proporção (sem corte). */
export type ImagemRedimensionada = {
  blob: Blob;
  nome: string;
  type: string;
  largura: number;
  altura: number;
};

const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function extensaoValida(file: File): boolean {
  return TIPOS_ACEITOS.includes(file.type);
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Se a imagem for maior que `maxLado`, redimensiona para caber (sem cortar).
 * PNG com transparência vira PNG; o resto vira JPEG para não inflar o banco.
 */
export async function redimensionarImagem(file: File, maxLado = 1920): Promise<ImagemRedimensionada> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  if (escala >= 1 && file.size <= 1_500_000) {
    bitmap.close();
    return { blob: file, nome: file.name, type: file.type, largura, altura };
  }

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, nome: file.name, type: file.type, largura, altura };
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem"))), outType, 0.9);
  });

  const base = file.name.replace(/\.[^.]+$/, "") || "hero";
  return { blob, nome: `${base}.${outType === "image/png" ? "png" : "jpg"}`, type: outType, largura, altura };
}