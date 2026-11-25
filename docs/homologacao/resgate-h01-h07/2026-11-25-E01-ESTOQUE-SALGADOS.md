# E01 — Recuperação definitiva do layout do Estoque de Salgados

Data: 2026-11-25  
Branch: `resgate-visual-h01-h07-codex`  
Referência aprovada: commit `1dc0e0d0c0ddd7c008628f473d33799136d689e2`, deployment `dpl_2wgqFWijouXrgqcfuLDAVsVEqExZ`  
Base operacional: commit `3307c87`  
Endereço fixo de homologação: `https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app`

## Comparação antes / aprovado / depois

Capturas locais em `docs/homologacao/resgate-h01-h07/validacao-lote-estoque-catalogo/`:

- `antes-estoque-salgados-desktop.png`, `antes-estoque-salgados-celular.png`
- `aprovado-estoque-salgados-desktop.png`, `aprovado-estoque-salgados-celular.png`
- `depois-estoque-salgados-desktop.png`, `depois-estoque-salgados-celular.png`
- `comparativo-estoque-salgados-desktop.png`, `comparativo-estoque-salgados-celular.png`
- `comparativo-preview-estoque-salgados-desktop.png`, `comparativo-preview-estoque-salgados-celular.png`

As capturas usam builds estáticos locais em modo demonstração, sem Supabase e sem requisições externas. O build publicado não usa esse modo.

## Funcionalidades recuperadas

1. Cabeçalho exato: título, subtítulo, busca, alertas e ajuda.
2. Cinco KPIs: Total físico, Total reservado, Total disponível, Abaixo do mínimo (`N sabores`) e Lotes ativos.
3. Físico real: soma de `lotes.restante` com status ativo e saldo positivo.
4. Reservado real: pendências ativas de `reservas_estoque` menos `reserva_consumos`.
5. Disponível: `físico − reservado`, sem dupla contagem de modalidades.
6. Fotos dos sabores do cadastro real (`imagem_url`), com fallback de ícone.
7. Sabor físico único por linha; o total reservado exibido é o total único do sabor.
8. Filtros de categoria, status e fornecedor.
9. Filtro “Apenas abaixo do mínimo”.
10. Botões “Movimentação” e “Registrar entrada de estoque”.
11. Colunas da referência: produto/sabor, físico, reservado, disponível, mínimo, reservas, lotes, próxima validade e ações.
12. Alertas “Abaixo do mínimo” e “Vence em até 7 dias”.
13. Ações de visualizar lotes e ajustar realçadas.
14. Painel inferior do sabor com saldos e ações.
15. Reservar, Liberar reserva e Registrar perda conectados às RPCs existentes.
16. Lotes FEFO com quantidade, validade e prioridade “Usar 1º/2º…”.
17. Últimas movimentações, histórico em modal, menu/navegação preservados, fontes legíveis e destaques críticos.

## Regras e ações reais

- Entrada: insert real em `lotes` + `registrar_mov_estoque(entrada_manual)`.
- Reserva: `reservar_estoque_atomica` com pedido em produção.
- Liberação: `liberar_reserva_atomica`, apenas pendências não consumidas.
- Retirada com vínculo: `registrar_consumo_reserva`; sem vínculo: `registrar_mov_estoque(venda)`.
- Perda: `registrar_mov_estoque(perda)`.
- Ajuste: conferência do lote + `registrar_mov_estoque(ajuste)`.
- Nenhuma movimentação real foi executada nos testes.

## Testes executados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | OK |
| `npm run build` (`NITRO_PRESET=node-server`) | OK |
| `node scripts/estoques-preview.test.mjs` | OK |
| `node scripts/estoques-preview-visual.mjs` | OK |
| `node scripts/cadastros-estoques-visual.mjs` | OK |
| `node scripts/resgate-capturas-lote.mjs` | 18 capturas, zero erro de página |
| `node scripts/e01-verificacao-visual.mjs` | 17/17 elementos, zero requisição externa, zero movimentação real |

Evidência detalhada: `docs/homologacao/resgate-h01-h07/validacao-e01/resultado.json`.

## Publicação

- Commit local: `02ce53f` (`resgate-visual-h01-h07-codex`), sem push.
- Build publicado: `VITE_DEMO_PREVIEW=0`, `NEIA_AMBIENTE=homologacao`.
- Deployment: `dpl_AuRDHK9rsrLVKktJGHVS7QRar5Qa`, `READY`, protegido por `vercel_authentication`.
- URL própria: `https://erp-neia-salgados-8l0q4sx0u-luiz988061337-3147s-projects.vercel.app`
- Alias fixo reposicionado: `https://erp-neia-salgados-git-resga-dcaca5-luiz988061337-3147s-projects.vercel.app`
- Conferência final no alias: HTML sem banner/dados fictícios visíveis e chunk `admin-Y8solXOk.js` com “Registrar entrada”, “Lotes (FEFO)” e “Ver histórico”.
- Durante a conferência foi detectado um deployment posterior (`dpl_3QawQZKWiSVtHFJUNUmnd4MN9xGc`) assinado ao alias por processo externo; o alias foi reposicionado ao deployment E01 acima e confirmado por `vercel inspect`.
- O texto “MODO DEMONSTRAÇÃO” existe apenas dentro da condição `ehModoDemo()` do bundle compartilhado; com `VITE_DEMO_PREVIEW=0` ele não é renderizado (confirmado no HTML servido).
- Production não foi promovida nem alterada.

## Pendências operacionais

1. **Fornecedor por produto:** o schema atual não possui vínculo fornecedor × produto. O filtro usa a origem real interna “Produção Néia” como único valor. Para múltiplos fornecedores é necessária alteração de banco, não executada.
2. **Validação autenticada no Preview:** não havia sessão real de homologação disponível no agente. A validação visual foi feita em build local sem Supabase; a confirmação final com dados reais depende do proprietário.
3. **Movimentação manual atômica:** entrada/ajuste usam as operações existentes confirmadas; uma RPC única para entrada e ajuste atômicos de lote + estoque pode ser evoluída futuramente (referência `0107_movimento_estoque_manual_atomico.sql`). Nenhuma migration foi executada.
4. **Aprovação:** a etapa só poderá ser declarada aprovada após confirmação do proprietário.

## Segurança

- Production, Supabase real, migrations, RLS e credenciais não alterados.
- `VITE_DEMO_PREVIEW=0` e `NEIA_AMBIENTE=homologacao` no build publicado.
- Autenticação da Vercel e endereço fixo de homologação preservados.
- `main` e o worktree original não foram alterados; nenhum push automático.
