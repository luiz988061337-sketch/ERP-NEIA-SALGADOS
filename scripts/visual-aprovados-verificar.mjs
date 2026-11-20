/** Verificação LOCAL da versão visual. Não inicia servidor, não aplica SQL e não publica. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const pasta = resolve(process.env.NEIA_VISUAL_RESULTADOS || 'homo-base-03.local/resultados');
mkdirSync(pasta, { recursive: true });
const env = {
  ...process.env,
  VITE_DEMO_PREVIEW: '1',
  NEIA_AMBIENTE: 'teste',
  VITE_NEIA_AMBIENTE: 'teste',
  SUPABASE_URL: 'https://visual-demo.invalid',
  VITE_SUPABASE_URL: 'https://visual-demo.invalid',
  SUPABASE_PROJECT_ID: 'visual-demo',
  VITE_SUPABASE_PROJECT_ID: 'visual-demo',
  SUPABASE_PUBLISHABLE_KEY: 'demo-nao-e-credencial',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'demo-nao-e-credencial',
  VITE_FF_CRIACAO_ATOMICA: 'off',
  VITE_FF_CONSUMO_RESERVA: 'off',
  VITE_FF_CANCELAMENTO_ATOMICO: 'off',
  VITE_FF_RESERVA_ATOMICA: 'off',
  VERCEL: '0',
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${new URL('./visual-aprovados-sem-rede.mjs', import.meta.url).href}`.trim(),
};
const testes = [
  'proteger-dev', 'isolamento-local', 'aceite-atendente-local', 'estoques-preview', 'cadastros-estoques', 'combos-preview',
  'comercial-preview', 'comercial-campanhas', 'comercial-pesquisas',
  'comercial-sugestoes', 'comercial-resultados',
  'financeiro-premium', 'financeiro-m', 'financeiro-conciliacao',
  'financeiro-operacoes-atomicas', 'financeiro-parciais-modelo',
  'precificacao', 'central-pedidos', 'producao-liberacao', 'producao-remessas-local',
  'preview-producao', 'preview-pedidos-atendente', 'preview-central-v2',
  'estoque-operacao-atomica', 'estoque-movimento',
  'reserva-integracao', 'criacao-atomica', 'criacao-atomica-wrapper',
  'insumos', 'ofx', 'pix-reader', 'checkout-taxa', 'competencia',
];
const checks = [
  ['typecheck', ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false', '--pretty', 'false']],
  ...testes.map(t => [t, ['--experimental-transform-types', `scripts/${t}.test.mjs`]]),
  ['build', ['node_modules/vite/bin/vite.js', 'build']],
];
const resultados = [];
for (const [nome, args] of checks) {
  const inicio = Date.now();
  const r = spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 600000, maxBuffer: 32 * 1024 * 1024 });
  writeFileSync(resolve(pasta, `${nome}.log`), `${r.stdout || ''}\n${r.stderr || ''}${r.error ? '\n' + r.error.message : ''}`);
  resultados.push({ nome, exitCode: r.status, sinal: r.signal, duracaoMs: Date.now() - inicio });
  writeFileSync(resolve(pasta, 'resultado.json'), JSON.stringify({ modo: 'demo-local-sem-rede', verificacoes: resultados }, null, 2));
  console.log(`${nome}: ${r.status === 0 ? 'PASSOU' : 'FALHOU'}`);
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log(`${testes.length} suites, typecheck e build passaram. Sem homologacao funcional.`);
