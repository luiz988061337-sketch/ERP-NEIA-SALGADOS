# ERP NÉIA SALGADOS — PRONTO PARA HOMOLOGAÇÃO CONTROLADA

Data: 2026-11-22  
Branch: `homologacao-finalizacao`  
HEAD: `39ee43b` — `checkpoint: FASE K testes e seguranca validados`

## 1. Situação geral

O projeto foi avançado localmente até a FASE K com checkpoints curtos e sem acesso a produção. O estado atual é adequado para iniciar homologação em **staging autorizado e isolado**. Não está pronto para publicação, deploy, produção ou uso com credenciais reais sem as validações externas listadas neste documento.

Nenhuma migration foi aplicada em banco remoto nesta continuidade. Nenhum push, deploy, Vercel, merge em `main`, pagamento real, WhatsApp real, emissão fiscal real ou acesso ao Supabase hospedado foi executado.

## 2. Checkpoints locais

| Commit | Fase | Resumo |
|---|---|---|
| `1dc0e0d` | anterior | correções HOMO-13B e HOMO-15 cliente |
| `0044673` | M24 | ACL segura, migration `0124`, teste e documentação |
| `10e48e1` | FASE B | build, rotas e navegação |
| `6df1dbf` | FASE C | redirect de auth seguro |
| `2424ab1` | FASE D | cliente e checkout validados |
| `ba40cc5` | FASE E | atendente e PDV isolados |
| `ec7138d` | FASE F | produção e estoque validados |
| `ef45f5d` | FASE G | central de entregas validada |
| `ffc4ad4` | FASE H | app motoboy validado |
| `56bb50d` | FASE I | financeiro premium validado |
| `1aaba41` | FASE J | integrações externas revisadas |
| `39ee43b` | FASE K | testes completos e segurança validados |

## 3. Status por fase

| Item | Status local | Observação |
|---|---|---|
| M24 — migration `0124` | IMPLEMENTADO, AGUARDANDO TESTE INTEGRADO | assinaturas, ACL, owner, `SECURITY DEFINER`, pré/pós-condições e atomicidade validadas estaticamente |
| M24 — aplicação em banco | BLOQUEADO POR DEPENDÊNCIA EXTERNA | exige laboratório isolado, autorização e `psql --single-transaction` com `ON_ERROR_STOP=1` |
| FASE B — build, rotas e navegação | VALIDADA LOCALMENTE | 89 rotas inventariadas; 0 links literais quebrados |
| FASE C — auth e autorização | IMPLEMENTADA, AGUARDANDO TESTE INTEGRADO | `destinoInternoSeguro` cobre redirects externos; Auth/RLS remoto pendente |
| FASE D — cliente e checkout | VALIDADA LOCALMENTE | carrinho, frete, PIX local, criação atômica e reembolsos revisados |
| FASE E — atendente e PDV | VALIDADA LOCALMENTE | preview isolado; ficha e finalização protegidas |
| FASE F — produção e estoque | VALIDADA LOCALMENTE | remessas, reservas, impressão, insumos e filtros demo revisados |
| FASE G — central de entregas | VALIDADA LOCALMENTE | atribuição e filtros corrigidos; suítes E4/E8/preview passaram |
| FASE H — app motoboy | VALIDADA LOCALMENTE | painel RPC fora da demo; travas, GPS com consentimento e mensagem offline honesta |
| FASE I — financeiro premium | VALIDADA LOCALMENTE | invalidação do fluxo, falhas explícitas e vencidas por saldo restante |
| FASE J — integrações externas | VALIDADA LOCALMENTE | inventário completo; guards de chamador; vocabulário PIX unificado; `pix-confirm` prova linha afetada |
| FASE K — testes e segurança | VALIDADA LOCALMENTE | suíte npm local completa e auditoria de segredos passaram |
| FASE L — homologação visual/funcional | PENDENTE | depende de staging autorizado, dados sintéticos e validação presencial |
| FASE M — preparação de publicação | PENDENTE | depende de aprovação final e ambiente de deploy autorizado |

## 4. Evidências locais

- 20 scripts npm locais executados: `teste:guard`, `teste:isolamento`, `teste:homo-cliente-02`, `teste:aceite-local`, comercial, produção, remessas, central, fases, RLS estático, PIX, insumos, OFX, precificação, integração e criação: **20/20 OK**.
- `node --experimental-transform-types scripts/auditoria.test.mjs`: **214 verificações, 0 falhas**.
- Suítes adicionais das fases: motoboy, E1–E10, financeiro, preview, estoque e isolamento passaram nas respectivas fases.
- `tsc --noEmit`: passou.
- `npm.cmd run build`: passou; warnings não fatais de chunks grandes, `vite-tsconfig-paths` e rota preview sem export `Route` permanecem conhecidos.
- `npm.cmd run lint`: falha por dívida pré-existente de 16127 problemas, principalmente `prettier/prettier`. Não houve reformatação em massa para preservar diffs e layouts aprovados.
- Auditoria de segredos: `.env` versionado contém apenas variáveis públicas; não há service role, senha, token privado ou chave VAPID privada versionada.
- `service_role` aparece apenas em código servidor (`client.server.ts` e Edge Functions) e em listas de bloqueio, nunca no cliente browser.

## 5. Dependências externas antes da homologação real

1. Autorização explícita para usar um projeto Supabase de staging separado. O identificador `lflzlcqinarrcgncafol` só deve ser usado após confirmação de identidade e acesso autorizado.
2. Aplicar migrations em laboratório isolado com backup e rollback. `0124` depende de transação explícita; não usar `psql -f` sem `--single-transaction` e `ON_ERROR_STOP=1`.
3. Não reaplicar `0098`; não usar `scripts/baseline/apply-baseline.ps1` para `0124`.
4. Configurar no ambiente correto, sem versionar valores reais: `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS`, `PIX_WEBHOOK_SECRET`, VAPID privado, chave do Google Maps e credenciais do provedor fiscal.
5. Manter WhatsApp automático desligado até explicitamente autorizado.
6. Reescrever o cliente Android do leitor PIX antes de uso real: ele ainda aponta para endpoint legado, usa token simulado, não deduplica localmente e possui placeholders de build; o APK não deve conter service role.
7. Validar Auth/PostgREST/RLS e concorrência em PostgreSQL isolado; `teste:rls` e testes PIX são estáticos e não substituem isso.
8. Validar fiscal em homologação com provedor real, NCM/CFOP/CST e regras de reemissão/cancelamento.
9. Validar impressão física, GPS consentido, push VAPID, maps e ViaCEP no ambiente de staging.
10. Executar `smoke`, `verificar:banco`, navegação em navegador e inspeção visual dos layouts aprovados.

## 6. Checklist de homologação controlada

1. Confirmar projeto de staging, usuários sintéticos, papéis e escopo de acesso.
2. Tirar backup e registrar plano de rollback antes de qualquer migration.
3. Aplicar baseline e `0124` com transação explícita; conferir assinaturas M24 e privilégios.
4. Preencher variáveis de ambiente no provedor de staging; nunca copiar `.env` de produção.
5. Rodar suíte local completa novamente contra o código final do checkpoint.
6. Rodar suíte de API/Auth/RLS e conferir que usuários não veem dados de outras roles.
7. Validar fluxos ponta a ponta: cliente, checkout, atendente, produção, central, motoboy, financeiro e admin.
8. Validar PIX apenas com o endpoint protegido `/api/public/pix/event` e aparelho cadastrado; nunca enviar service role do APK.
9. Validar emissão fiscal em homologação do provedor; não emitir documento em produção.
10. Registrar evidências, desvios e aprovação formal antes de qualquer deploy.

## 7. Conclusão

O repositório está **pronto para iniciar homologação controlada em staging**, com testes locais e segurança estática verificados.
 Não está pronto para produção: faltam validações externas de banco, Auth/RLS, integrações reais, smoke, homologação visual e correção do cliente Android do leitor PIX.
