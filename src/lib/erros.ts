/**
 * Traduz erro técnico em frase que o cliente entende (§19 da auditoria).
 * Erros de negócio que já vêm prontos ("Produto X indisponível", "combos são
 * vendidos em múltiplos de 50") passam intactos; o resto vira uma mensagem
 * simples, sem "constraint", "uuid", "undefined" ou "database error".
 */
export function mensagemDeErro(err: unknown, padrao = "Não foi possível concluir agora. Tente novamente."): string {
  if (!(err instanceof Error)) return padrao;
  const msg = err.message || "";

  // Erros de negócio: já escritos para o cliente.
  const deNegocio = [
    "indisponível no momento",
    "múltiplos de 50",
    "múltiplos de",
    " combos são vendidos",
    "preço",
    "Estoque",
  ];
  if (deNegocio.some((m) => msg.includes(m))) return msg;

  // Sinais de erro técnico do Supabase/Postgres.
  const tecnico =
    /duplicate key|violates|constraint|foreign key|not-null|null value|undefined|NaN|uuid|relation |column |schema|PGRST|fetch failed|Failed to fetch|NetworkError|Load failed|detabase|database/i;
  if (tecnico.test(msg)) return padrao;

  // Qualquer coisa muito longa ou sem espaço costuma ser código, não frase.
  if (msg.length > 140 || !/\s/.test(msg)) return padrao;

  return msg;
}