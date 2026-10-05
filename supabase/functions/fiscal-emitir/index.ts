import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmitirRequest {
  pedido_id: string;
  forcar?: boolean; // para reemitir se já existir
}

interface ProvedorConfig {
  provedor: string;
  ambiente: "homologacao" | "producao";
  url_base: string;
  token: string;
  timeout_segundos: number;
  homologacao_url?: string;
  producao_url?: string;
  homologacao_token?: string;
  producao_token?: string;
}

interface EmpresaFiscal {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  regime_tributario: string;
  serie: string;
  numero_inicial: number;
  modelo_padrao: "55" | "65";
  ambiente: "homologacao" | "producao";
  provedor: string;
  csc_id: string;
  info_adicionais: string;
}

interface PedidoCompleto {
  id: string;
  numero: number;
  cliente_nome: string;
  telefone: string;
  endereco: string;
  bairro: string;
  complemento: string;
  referencia: string;
  cidade: string;
  uf: string;
  cep: string;
  forma_pagamento: string;
  subtotal: number;
  taxa_entrega: number;
  desconto: number;
  total: number;
  tipo_entrega: "entrega" | "retirada";
  items: PedidoItem[];
  cpf_cnpj?: string;
  nome_fiscal?: string;
}

interface PedidoItem {
  id: string;
  produto_id: string | null;
  nome: string;
  preco_unitario: number;
  quantidade: number;
}

interface ProdutoFiscal {
  id: string;
  ncm: string;
  cest: string | null;
  cfop_padrao: string | null;
  cst: string | null;
  csosn: string | null;
  origem_mercadoria: string | null;
  gtin: string | null;
  descricao_fiscal: string | null;
}

async function getEmpresaFiscal(supabase: any): Promise<EmpresaFiscal> {
  const { data, error } = await supabase
    .from("empresa_fiscal")
    .select("*")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error("Empresa fiscal não configurada");
  }
  return data;
}

async function getProvedorConfig(supabase: any): Promise<ProvedorConfig> {
  const { data, error } = await supabase
    .from("fiscal_provedor_config")
    .select("*")
    .eq("id", true)
    .single();

  if (error || !data) {
    throw new Error("Provedor fiscal não configurado");
  }
  return data;
}

async function getPedidoCompleto(supabase: any, pedidoId: string): Promise<PedidoCompleto> {
  const { data: pedido, error } = await supabase
    .from("pedidos")
    .select("*, pedido_itens(*)")
    .eq("id", pedidoId)
    .single();

  if (error || !pedido) {
    throw new Error("Pedido não encontrado");
  }

  // Normaliza: o join vem como `pedido_itens`, o domínio usa `items`.
  const linhas = (pedido as any).pedido_itens ?? (pedido as any).items ?? [];
  return { ...(pedido as object), items: linhas } as PedidoCompleto;
}

async function getProdutosFiscais(supabase: any, produtoIds: string[]): Promise<Map<string, ProdutoFiscal>> {
  const map = new Map<string, ProdutoFiscal>();
  const ids = [...new Set((produtoIds ?? []).filter(Boolean))];
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("produtos")
    .select("id, ncm, cest, cfop_padrao, cst, csosn, origem_mercadoria, gtin, descricao_fiscal")
    .in("id", ids);

  if (error) {
    throw new Error("Erro ao buscar dados fiscais dos produtos");
  }

  for (const p of data ?? []) {
    map.set(p.id, p);
  }
  return map;
}

/** Escapa texto para XML (nunca quebrar o documento com & < >). */
function escXml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * PENDÊNCIA contador: cMun IBGE do emitente/destinatário.
 * Não temos tabela IBGE no banco, então enviamos 9999999 (inexistente) de
 * propósito: o provedor/SEFAZ REJEITA até o contador cadastrar o cMun real.
 * Fail-closed: nunca autorizamos com município inventado.
 */
const C_MUN_PENDENTE = "9999999";

/** Código IBGE da UF a partir da sigla (para cUF da chave de acesso). */
function codigoUF(uf: string): string {
  const m: Record<string, string> = {
    AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53",
    ES: "32", GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15",
    PB: "25", PR: "41", PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43",
    RO: "11", RR: "14", SC: "42", SP: "35", SE: "28", TO: "17",
  };
  return m[String(uf ?? "").toUpperCase()] ?? "35";
}

function gerarChaveAcesso(
  ufEmitente: string,
  modelo: "55" | "65",
  serie: string,
  numero: number,
  ambiente: "homologacao" | "producao",
  cnpjEmitente: string,
  dhEmi: string
): string {
  // Chave de acesso NF-e/NFC-e (44 dígitos). A SEFAZ valida o DV (módulo 11);
  // a autorização real acontece no provedor — aqui só montamos o envelope.
  // dhEmi vem no padrão "AAAA-MM-DDTHH:MM:SS±HH:MM" (dhEmiNF).
  const cUF = codigoUF(ufEmitente);
  const AAMM = `${dhEmi.slice(2, 4)}${dhEmi.slice(5, 7)}`;
  const cNPJ = cnpjEmitente.replace(/\D/g, "").padStart(14, "0");
  const mod = modelo;
  const serieNum = serie.padStart(3, "0");
  const nNF = String(numero).padStart(9, "0");
  const tpEmis = "1"; // normal
  const cNF = Math.floor(Math.random() * 100000000).toString().padStart(8, "0");

  const base = `${cUF}${AAMM}${cNPJ}${mod}${serieNum}${nNF}${tpEmis}${cNF}`;
  // DV (módulo 11) - simplificado
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += parseInt(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  const dvFinal = dv >= 10 ? 0 : dv;

  return `${base}${dvFinal}`;
}

/** Número com 2 casas para o XML (aceita null/undefined). */
function num2(v: unknown): string {
  return (Number(v) || 0).toFixed(2);
}

/** CPF/CNPJ do destinatário (só emite a tag quando há documento válido). */
function docDestinatario(pedido: PedidoCompleto): string {
  const digitos = String((pedido as any).cpf_cnpj ?? "").replace(/\D/g, "");
  if (digitos.length === 11) return `<CPF>${digitos}</CPF>`;
  if (digitos.length === 14) return `<CNPJ>${digitos}</CNPJ>`;
  return "";
}

/** dhEmi no padrão NF-e: "2026-10-05T10:00:00-03:00". */
function dhEmiNF(data: Date): string {
  const tz = -data.getTimezoneOffset();
  const sinal = tz >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0");
  const mm = String(Math.abs(tz) % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}T${p(data.getHours())}:${p(data.getMinutes())}:${p(data.getSeconds())}${sinal}${hh}:${mm}`;
}

function gerarXMLNFE(
  empresa: EmpresaFiscal,
  pedido: PedidoCompleto,
  produtosFiscais: Map<string, any>,
  numero: number,
  chaveAcesso: string,
  dhEmi: string
): string {
  // Envelope NF-e 4.0 montado com os dados fiscais do cadastro (NCM/CFOP/CST
  // vêm do contador via migration 0033). NUNCA inventar tributo: item sem
  // produto vinculado (combo avulso) ou sem NCM bloqueia com mensagem clara.
  const itensXML = pedido.items.map((item, index) => {
    if (!item.produto_id) {
      throw new Error(
        `Item "${item.nome}" sem produto vinculado (combo avulso). ` +
        `Desmembre o combo em sabores com NCM/CFOP cadastrados ou cadastre um produto kit antes de emitir.`
      );
    }
    const fiscal = produtosFiscais.get(item.produto_id);
    if (!fiscal?.ncm) {
      throw new Error(`Produto "${item.nome}" sem NCM cadastrado. Complete na aba Fiscal/Produtos com o contador.`);
    }
    if (!fiscal.cfop_padrao) {
      throw new Error(`Produto "${item.nome}" sem CFOP padrão. Complete na aba Fiscal/Produtos com o contador.`);
    }
    if (!fiscal.cst && !fiscal.csosn) {
      throw new Error(`Produto "${item.nome}" sem CST/CSOSN. Complete na aba Fiscal/Produtos com o contador.`);
    }
    const ncm = String(fiscal.ncm).replace(/\D/g, "");
    const cfop = String(fiscal.cfop_padrao).replace(/\D/g, "");
    const origem = String(fiscal.origem_mercadoria ?? "0");
    const cest = fiscal.cest ? `<CEST>${escXml(String(fiscal.cest).replace(/\D/g, ""))}</CEST>` : "";
    const cst = fiscal.cst ? escXml(fiscal.cst) : null;
    const csosn = !cst && fiscal.csosn ? escXml(fiscal.csosn) : null;
    const icmsBloco = cst
      ? `<ICMS00><orig>${escXml(origem)}</orig><CST>${cst}</CST><modBC>3</modBC><vBC>0.00</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00>`
      : `<ICMSSN102><orig>${escXml(origem)}</orig><CSOSN>${csosn}</CSOSN></ICMSSN102>`;
    const gtin = fiscal.gtin ? escXml(fiscal.gtin) : "";
    const xProd = escXml(fiscal.descricao_fiscal || item.nome);
    return `
      <det nItem="${index + 1}">
        <prod>
          <cProd>${escXml(item.produto_id)}${index + 1}</cProd>
          <cEAN>${gtin}</cEAN>
          <xProd>${xProd}</xProd>
          <NCM>${escXml(ncm)}</NCM>
          ${cest}
          <CFOP>${escXml(cfop)}</CFOP>
          <uCom>UN</uCom>
          <qCom>${item.quantidade}</qCom>
          <vUnCom>${(Number(item.preco_unitario) || 0).toFixed(4)}</vUnCom>
          <vProd>${((Number(item.preco_unitario) || 0) * item.quantidade).toFixed(2)}</vProd>
          <cEANTrib>${gtin}</cEANTrib>
          <uTrib>UN</uTrib>
          <qTrib>${item.quantidade}</qTrib>
          <vUnTrib>${(Number(item.preco_unitario) || 0).toFixed(4)}</vUnTrib>
          <indTot>1</indTot>
        </prod>
        <imposto>
          <ICMS>
            ${icmsBloco}
          </ICMS>
          <IPI>
            <cEnq>999</cEnq>
            <IPINT>
              <CST>53</CST>
            </IPINT>
          </IPI>
          <PIS>
            <PISNT>
              <CST>08</CST>
            </PISNT>
          </PIS>
          <COFINS>
            <COFINSNT>
              <CST>08</CST>
            </COFINSNT>
          </COFINS>
        </imposto>
      </det>
    `;
  }).join("");

  // Envelope de PEDIDO de emissão (só <NFe>). O <protNFe> com protocolo e
  // autorização vem no RETORNO do provedor — nunca inventamos protocolo aqui.
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe versao="4.00" Id="NFe${chaveAcesso}">
      <ide>
        <cUF>${codigoUF(empresa.uf)}</cUF>
        <cNF>${chaveAcesso.slice(35, 43)}</cNF>
        <natOp>VENDA MERCADORIA</natOp>
        <mod>${empresa.modelo_padrao === "65" ? "65" : "55"}</mod>
        <serie>${empresa.serie}</serie>
        <nNF>${numero}</nNF>
        <dhEmi>${dhEmi}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>${C_MUN_PENDENTE}</cMunFG>
        <tpImp>4</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chaveAcesso.slice(-1)}</cDV>
        <tpAmb>${empresa.ambiente === "producao" ? "1" : "2"}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
        <verProc>1.0</verProc>
      </ide>
      <emit>
        <CNPJ>${escXml(empresa.cnpj.replace(/\D/g, "").padStart(14, "0"))}</CNPJ>
        <xNome>${escXml(empresa.razao_social)}</xNome>
        <xFant>${escXml(empresa.nome_fantasia)}</xFant>
        <enderEmit>
          <xLgr>${escXml(empresa.endereco)}</xLgr>
          <nro>${escXml(empresa.numero || "S/N")}</nro>
          <xCpl>${escXml(empresa.complemento)}</xCpl>
          <xBairro>${escXml(empresa.bairro)}</xBairro>
          <cMun>${C_MUN_PENDENTE}</cMun>
          <xMun>${escXml(empresa.cidade)}</xMun>
          <UF>${escXml(empresa.uf)}</UF>
          <CEP>${escXml(empresa.cep.replace(/\D/g, "").padStart(8, "0"))}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderEmit>
        <IE>${escXml(empresa.inscricao_estadual)}</IE>
        <CRT>${String(empresa.regime_tributario).toLowerCase().includes("simples") ? "1" : "3"}</CRT>
      </emit>
      <dest>
        ${docDestinatario(pedido)}
        <xNome>${escXml(pedido.nome_fiscal || pedido.cliente_nome)}</xNome>
        <enderDest>
          <xLgr>${escXml(String(pedido.endereco ?? "").split(",")[0] || pedido.endereco)}</xLgr>
          <nro>${escXml(String(pedido.endereco ?? "").split(",")[1]?.trim() || "S/N")}</nro>
          <xCpl>${escXml(pedido.complemento)}</xCpl>
          <xBairro>${escXml(pedido.bairro)}</xBairro>
          <cMun>${C_MUN_PENDENTE}</cMun>
          <xMun>${escXml(pedido.cidade)}</xMun>
          <UF>${escXml((pedido as any).uf ?? empresa.uf)}</UF>
          <CEP>${escXml(String((pedido as any).cep ?? "").replace(/\D/g, "").padStart(8, "0"))}</CEP>
          <cPais>1058</cPais>
          <xPais>BRASIL</xPais>
        </enderDest>
        <indIEDest>9</indIEDest>
      </dest>
      ${itensXML}
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vICMSDeson>0.00</vICMSDeson>
          <vFCP>0.00</vFCP>
          <vBCST>0.00</vBCST>
          <vST>0.00</vST>
          <vFCPST>0.00</vFCPST>
          <vFCPSTRet>0.00</vFCPSTRet>
          <vProd>${num2(pedido.subtotal)}</vProd>
          <vFrete>${num2(pedido.taxa_entrega)}</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>${num2(pedido.desconto)}</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vIPIDevol>0.00</vIPIDevol>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${num2(pedido.total)}</vNF>
          <vTotTrib>0.00</vTotTrib>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>1</modFrete>
        <transporta>
          <xNome>Néia Salgados</xNome>
        </transporta>
      </transp>
      <pag>
        <detPag>
          <tPag>${pedido.forma_pagamento === "pix" ? "17" : pedido.forma_pagamento === "dinheiro" ? "01" : pedido.forma_pagamento === "credito" ? "03" : pedido.forma_pagamento === "debito" ? "04" : "99"}</tPag>
          <vPag>${num2(pedido.total)}</vPag>
        </detPag>
      </pag>
      <infAdic>
        <infAdFisco>${escXml(empresa.info_adicionais)}</infAdFisco>
        <infCpl>${escXml(`Pedido ${pedido.numero} - ${pedido.tipo_entrega === "entrega" ? "Entrega" : "Retirada"}`)}</infCpl>
      </infAdic>
    </infNFe>
  </NFe>`;
}

async function chamarProvedorFocus(
  config: ProvedorConfig,
  xml: string,
  modelo: "55" | "65"
): Promise<{ sucesso: boolean; xmlRetorno?: string; chave?: string; protocolo?: string; erro?: string }> {
  const url = config.ambiente === "producao"
    ? (config.producao_url || config.url_base + "/nfe/emitir")
    : (config.homologacao_url || config.url_base + "/nfe/emitir/homologacao");

  const token = config.ambiente === "producao"
    ? (config.producao_token || config.token)
    : (config.homologacao_token || config.token);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout_segundos * 1000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/xml",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/xml",
      },
      body: xml,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const xmlRetorno = await response.text();

    if (!response.ok) {
      return { sucesso: false, xmlRetorno, erro: `HTTP ${response.status}: ${xmlRetorno.slice(0, 500)}` };
    }

    // Parse simples do retorno
    const chaveMatch = xmlRetorno.match(/<chNFe>([^<]+)<\/chNFe>/);
    const protocoloMatch = xmlRetorno.match(/<nProt>([^<]+)<\/nProt>/);
    const cStatMatch = xmlRetorno.match(/<cStat>([^<]+)<\/cStat>/);
    const xMotivoMatch = xmlRetorno.match(/<xMotivo>([^<]+)<\/xMotivo>/);

    const cStat = cStatMatch ? parseInt(cStatMatch[1]) : 0;
    const sucesso = cStat === 100 || cStat === 150; // 100=autorizado, 150=autorizado fora de prazo

    return {
      sucesso,
      xmlRetorno,
      chave: chaveMatch?.[1],
      protocolo: protocoloMatch?.[1],
      erro: sucesso ? undefined : (xMotivoMatch?.[1] || `cStat ${cStat}`),
    };
  } catch (e) {
    return { sucesso: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

async function registrarEvento(supabase: any, documentoId: string, evento: string, detalhe: string, userId?: string) {
  await supabase.from("documento_eventos").insert({
    documento_id: documentoId,
    evento,
    detalhe,
    actor: userId || null,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ erro: "Método não permitido" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { pedido_id, forcar } = await req.json() as EmitirRequest;

    if (!pedido_id) {
      return new Response(JSON.stringify({ erro: "pedido_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca documento fiscal existente ou cria novo
    const { data: docExistente } = await supabase
      .from("documentos_fiscais")
      .select("*")
      .eq("pedido_id", pedido_id)
      .maybeSingle();

    if (docExistente && !forcar) {
      return new Response(JSON.stringify({
        erro: "Documento fiscal já existe para este pedido. Use forcar=true para reemitir.",
        documento: docExistente,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca dados
    const [empresa, provedor, pedido] = await Promise.all([
      getEmpresaFiscal(supabase),
      getProvedorConfig(supabase),
      getPedidoCompleto(supabase, pedido_id),
    ]);

    // Verifica modelo
    const modelo = empresa.modelo_padrao as "55" | "65";
    if (!["55", "65"].includes(modelo)) {
      throw new Error("Modelo fiscal não definido (55=NF-e ou 65=NFC-e)");
    }

    // Busca produtos fiscais
    const produtoIds = pedido.items
      .map(i => i.produto_id)
      .filter((v): v is string => !!v);
    const produtosFiscais = await getProdutosFiscais(supabase, produtoIds);

    // Determina próximo número
    const { data: ultimoDoc } = await supabase
      .from("documentos_fiscais")
      .select("numero")
      .eq("modelo", modelo)
      .eq("serie", empresa.serie)
      .eq("ambiente", empresa.ambiente)
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();

    const proximoNumero = (ultimoDoc?.numero ?? empresa.numero_inicial - 1) + 1;

    // Gera chave de acesso + XML (gerarXMLNFE valida NCM/CFOP/CST e falha
    // rápido com mensagem clara — antes de tocar no banco).
    const agoraD = new Date();
    const dhEmi = dhEmiNF(agoraD);
    const chaveAcesso = gerarChaveAcesso(
      empresa.uf,
      modelo,
      empresa.serie,
      proximoNumero,
      empresa.ambiente,
      empresa.cnpj,
      dhEmi
    );

    // Gera XML (lança erro se faltar dado fiscal — fail-closed)
    const xml = gerarXMLNFE(empresa, pedido, produtosFiscais, proximoNumero, chaveAcesso, dhEmi);

    // Cria/atualiza documento fiscal como pendente e persiste os itens
    // fiscais (migration 0046) para auditoria do que foi enviado.
    const documentoId = docExistente?.id || crypto.randomUUID();
    const agora = agoraD.toISOString();

    const docPayload = {
      id: documentoId,
      pedido_id,
      modelo,
      serie: empresa.serie,
      numero: proximoNumero,
      ambiente: empresa.ambiente,
      status: "pendente",
      chave_acesso: chaveAcesso,
      xml,
      created_at: docExistente?.created_at || agora,
      updated_at: agora,
    };

    if (docExistente) {
      const { error: eUp } = await supabase.from("documentos_fiscais").update(docPayload).eq("id", documentoId);
      if (eUp) throw new Error(`Não foi possível atualizar o documento fiscal: ${eUp.message}`);
      await supabase.from("documento_fiscal_itens").delete().eq("documento_id", documentoId);
    } else {
      const { error: eIns } = await supabase.from("documentos_fiscais").insert(docPayload);
      if (eIns) throw new Error(`Não foi possível criar o documento fiscal: ${eIns.message}`);
    }

    const itensFiscais = pedido.items.map((item, idx) => {
      const f = (item.produto_id && produtosFiscais.get(item.produto_id)) || {};
      return {
        documento_id: documentoId,
        produto_id: item.produto_id ?? null,
        n_item: idx + 1,
        codigo_produto: String(item.produto_id ?? `AVULSO-${idx + 1}`),
        descricao: String((f as any).descricao_fiscal || item.nome),
        ncm: (f as any).ncm ?? null,
        cest: (f as any).cest ?? null,
        cfop: (f as any).cfop_padrao ?? null,
        unidade: "UN",
        quantidade: item.quantidade,
        valor_unitario: Number(item.preco_unitario) || 0,
        valor_total: (Number(item.preco_unitario) || 0) * item.quantidade,
        icms_origem: (f as any).origem_mercadoria ?? null,
        icms_cst: (f as any).cst ?? null,
        icms_csosn: (f as any).csosn ?? null,
      };
    });
    if (itensFiscais.length > 0) {
      const { error: eItens } = await supabase.from("documento_fiscal_itens").insert(itensFiscais);
      if (eItens) throw new Error(`Documento criado, mas itens fiscais falharam: ${eItens.message}`);
    }

    await registrarEvento(supabase, documentoId, "emissao_iniciada", `Tentativa de emissão ${modelo} #${proximoNumero}`);

    // Transição validada pelo trigger 0046 (empresa + NCM/CFOP por item).
    // Se o banco rejeitar aqui, o erro sobe com a mensagem do trigger.
    const { error: eProc } = await supabase
      .from("documentos_fiscais")
      .update({ status: "em_processamento", updated_at: new Date().toISOString() })
      .eq("id", documentoId);
    if (eProc) throw new Error(eProc.message);

    // Chama provedor (só marca autorizada com retorno fiscal válido)
    const resultado = await chamarProvedorFocus(provedor, xml, modelo);

    if (resultado.sucesso) {
      // Sucesso
      await supabase.from("documentos_fiscais").update({
        status: "autorizada",
        chave_acesso: resultado.chave || chaveAcesso,
        protocolo: resultado.protocolo,
        xml: resultado.xmlRetorno || xml,
        updated_at: new Date().toISOString(),
      }).eq("id", documentoId);

      await registrarEvento(supabase, documentoId, "autorizada", `Protocolo: ${resultado.protocolo}`);

      return new Response(JSON.stringify({
        sucesso: true,
        documento: { id: documentoId, numero: proximoNumero, chave: resultado.chave, protocolo: resultado.protocolo },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      // Falha
      await supabase.from("documentos_fiscais").update({
        status: "rejeitada",
        codigo_rejeicao: "ERRO_PROVEDOR",
        mensagem_rejeicao: resultado.erro,
        xml: resultado.xmlRetorno || xml,
        updated_at: new Date().toISOString(),
      }).eq("id", documentoId);

      await registrarEvento(supabase, documentoId, "rejeitada", resultado.erro || "Erro desconhecido");

      return new Response(JSON.stringify({
        sucesso: false,
        erro: resultado.erro,
        documento: { id: documentoId, status: "rejeitada" },
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("Erro em fiscal-emitir:", e);
    return new Response(JSON.stringify({ erro: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});