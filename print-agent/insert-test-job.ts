import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.SUPABASE_ANON_KEY!;
const STAFF_EMAIL = process.env.STAFF_EMAIL!;
const STAFF_PASSWORD = process.env.STAFF_PASSWORD!;

const sb = createClient(URL, ANON);

async function testPrint() {
  // Sign in as staff (like the agent does)
  const { error: authError } = await sb.auth.signInWithPassword({ email: STAFF_EMAIL, password: STAFF_PASSWORD });
  if (authError) {
    console.error('Auth falhou:', authError.message);
    return;
  }
  console.log('Autenticado como', STAFF_EMAIL);

  const uuid = `teste:${Date.now()}`;
  const texto = `NÉIA SALGADOS\nTESTE INTEGRAÇÃO\nTANCA TP-550\n${new Date().toLocaleString('pt-BR')}\n\nSistema OK ✅`;

  const { error } = await sb.from('fila_impressao').insert({
    trabalho_uuid: uuid,
    tipo: 'teste',
    payload: texto,
    impressora: 'TANCA TP-550',
  });

  if (error) {
    console.error('Erro:', error.message);
  } else {
    console.log('Job inserido:', uuid);
    console.log('Aguardando agente processar (poll 5s)...');
  }
}

testPrint();