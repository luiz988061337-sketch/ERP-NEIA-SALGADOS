/** Consulta de CEP via ViaCEP (sem chave de API, com CORS liberado). */

export type EnderecoCep = {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export function soDigitos(cep: string): string {
  return cep.replace(/\D/g, "");
}

export function cepValido(cep: string): boolean {
  return soDigitos(cep).length === 8;
}

/** Máscara 00000-000 aplicada conforme o cliente digita. */
export function mascararCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

export async function buscarCep(cep: string): Promise<EnderecoCep> {
  const d = soDigitos(cep);
  if (d.length !== 8) throw new Error("CEP incompleto. Digite os 8 dígitos.");

  const resp = await fetch(`https://viacep.com.br/ws/${d}/json/`);
  if (!resp.ok) throw new Error("Não consegui consultar o CEP agora. Tente de novo.");
  const json = await resp.json();
  if (json?.erro) throw new Error("CEP não encontrado. Confira os números.");
  if (!json?.localidade) throw new Error("CEP sem endereço cadastrado na base do Correio.");

  return {
    cep: json.cep ?? d,
    logradouro: json.logradouro ?? "",
    complemento: json.complemento ?? "",
    bairro: json.bairro ?? "",
    localidade: json.localidade ?? "",
    uf: json.uf ?? "",
  };
}
