/**
 * Pix por BR Code (EMV 316 / ISO 20022) — QR Code e "Pix Copia e Cola" de verdade.
 *
 * Antes o app gerava um QR com texto solto ("NEIA-SALGADOS|CHAVE:...|VALOR:..."),
 * que nenhum app de banco lê. Aqui montamos o payload oficial, com CRC16.
 * Sem chave PIX cadastrado, devolve null — o checkout avisa em vez de
 * mostrar um QR que não funciona.
 */

/** Remove acentos,Espaços e caracteres que o BR Code não aceita. */
export function sanitizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/**
 * Chave Pix válida vai sempre no campo 01 do template do recebedor:
 * aleatória (32 hex), CPF, CNPJ, telefone, e-mail ou chave alfanumérica.
 * Sem esses formatos, devolve null — o checkout aventa em vez de gerar
 * um QR que o banco não consegue ler.
 */
export function chaveComoPayload(chave: string): { campo: string; valor: string } | null {
  const c = chave.trim();
  if (!c) return null;

  // Chave aleatória: UUID sem hífen, 32 hex
  const hex = c.replace(/-/g, "");
  if (/^[0-9a-f]{32}$/i.test(hex)) return { campo: "01", valor: hex.toUpperCase() };

  // CPF (11) ou CNPJ (14) só com dígitos
  if (/^\d{11}$/.test(c) || /^\d{14}$/.test(c)) return { campo: "01", valor: c };

  // Telefone: +55DDNNNNNNNNN ou 55DDNNNNNNNNN (10 a 13 dígitos)
  if (/^\+?\d{10,13}$/.test(c)) return { campo: "01", valor: c.replace(/\D/g, "") };

  // E-mail
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)) return { campo: "01", valor: c.toLowerCase() };

  // Chave alfanumérica (mínimo 5, sem espaços)
  if (/^[A-Za-z0-9._-]{5,}$/.test(c)) return { campo: "01", valor: c };

  return null;
}

function campo(id: string, valor: string): string {
  // Mantém @ (chave Pix por e-mail) e * (txid "***" = sem identificação, padrão oficial).
  const v = valor.replace(/[^A-Za-z0-9 @.\-_*]/g, "");
  return `${id}${String(v.length).padStart(2, "0")}${v}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixPayload = {
  /** String para "Pix Copia e Cola". */
  copiaECola: string;
  chave: string;
  valor: number;
  /** Descrição de uma linha, usada no comprovante. */
  descricao: string;
};

/**
 * Monta o BR Code estático com valor. Se o valor for 0, deixa sem valor
 * (o cliente preenche no app do banco).
 */
export function gerarPix(opts: {
  chave: string;
  valor: number;
  descricao?: string;
  nome?: string;
  cidade?: string;
  txid?: string;
}): PixPayload | null {
  const chaveInfo = chaveComoPayload(opts.chave);
  if (!chaveInfo) return null;
  const nome = sanitizarTexto(opts.nome || "Néia Salgados");
  const cidade = sanitizarTexto(opts.cidade || "Sao Paulo");
  const descricao = sanitizarTexto(opts.descricao || "Pedido Neia Salgados").slice(0, 40);
  const txid = sanitizarTexto(opts.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const valor = Number(opts.valor) > 0 ? Number(opts.valor) : null;

  const merchantAccount =
    campo("00", "BR.GOV.BCB.PIX") +
    campo(chaveInfo.campo, chaveInfo.valor) +
    campo("02", descricao);

  let payload =
    campo("00", "01") + // Payload Format Indicator
    campo("01", "11") + // Point of Initiation Method: "11" = estático
    campo("26", merchantAccount) +
    campo("52", "0000") + // Merchant Category Code
    campo("53", "986"); // BRL

  if (valor !== null) payload += campo("54", valor.toFixed(2));
  payload +=
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid)) +
    "6304"; // placeholder do CRC

  const copiaECola = payload + crc16(payload);

  return {
    copiaECola,
    chave: chaveInfo.valor,
    valor: valor ?? 0,
    descricao,
  };
}

/**
 * @deprecated Não usar — enviava chave+valor do Pix para terceiro (qrserver).
 * Mantido só para compatibilidade; o app agora gera o QR 100% local (qrcode).
 */
export function urlQrPix(copiaECola: string, tamanho = 220): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${tamanho}x${tamanho}&margin=2&data=${encodeURIComponent(copiaECola)}`;
}