param($Cluster,$State)
$ErrorActionPreference='Stop'
function Sql([string]$q){(Invoke-NeiaLocalPg $Cluster 'psql' @('-X','-w','-q','-A','-t','-d','lfl_partial','-v','ON_ERROR_STOP=1','-c',$q)).Trim()}
function Check([bool]$ok,[string]$name){if(-not $ok){throw ('Concorrencia: '+$name)};Write-Output ('OK '+$name)}
if($Cluster.Host -ne '127.0.0.1' -or -not $Cluster.Verified -or (Sql 'SHOW data_directory').Replace('/','\') -ne $Cluster.Data){throw 'Cluster nao verificado'}
function Start-Session([string]$name,[string]$call,[bool]$hold){
 $file=Join-Path $Cluster.Root ('session-'+$name+'.sql')
 $sql="BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';`nSELECT $call;`n"
 if($hold){$sql+='SELECT pg_sleep(3);'};$sql+='COMMIT;'
 [IO.File]::WriteAllText($file,$sql,[Text.UTF8Encoding]::new($false))
 $psi=[Diagnostics.ProcessStartInfo]::new();$psi.FileName=Join-Path $Cluster.PgBin 'psql.exe';$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true
 foreach($arg in @('-X','-w','-q','-A','-t','-v','ON_ERROR_STOP=1','-d','lfl_partial','-f',$file)){$psi.ArgumentList.Add($arg)}
 foreach($n in @('PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGSSLCERT','PGSSLKEY')){$psi.Environment.Remove($n)|Out-Null}
 $psi.Environment['PGHOST']='127.0.0.1';$psi.Environment['PGHOSTADDR']='127.0.0.1';$psi.Environment['PGPORT']=[string]$Cluster.Port
 $psi.Environment['PGUSER']=$Cluster.User;$psi.Environment['PGPASSWORD']=$Cluster.LocalPassword;$psi.Environment['PGPASSFILE']=Join-Path $Cluster.Root 'no-password-file'
 $psi.Environment['PGSSLMODE']='disable';$psi.Environment['PGCLIENTENCODING']='UTF8';$psi.Environment['PGCONNECT_TIMEOUT']='5';$psi.Environment['PGOPTIONS']='-c lock_timeout=8000';$psi.Environment['PGAPPNAME']='neia_delta_'+$name
 $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
 $p=[Diagnostics.Process]::Start($psi)
 [pscustomobject]@{Process=$p;Out=$p.StandardOutput.ReadToEndAsync();Err=$p.StandardError.ReadToEndAsync();Name=$name}
}
function Finish-Session($s){
 try{
  if(-not $s.Process.WaitForExit(15000)){throw 'Sessao local excedeu o limite; nao ampliar lock timeout'}
  [IO.File]::WriteAllText((Join-Path $Cluster.Root ('session-'+$s.Name+'.private.log')),$s.Out.GetAwaiter().GetResult()+$s.Err.GetAwaiter().GetResult(),[Text.UTF8Encoding]::new($false))
  if($s.Process.ExitCode){throw 'Sessao de concorrencia falhou; consultar somente log privado'}
 }finally{$s.Process.Dispose()}
}
function Dispute([string]$prefix,[string]$callA,[string]$callB){
 $a=$null;$b=$null
 try{
  $a=Start-Session ($prefix+'A') $callA $true
  $ready=$false
  for($i=0;$i -lt 40;$i++){
   if((Sql "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='neia_delta_${prefix}A' AND wait_event='PgSleep')") -eq 't'){$ready=$true;break}
   Start-Sleep -Milliseconds 50
  }
  if(-not $ready){throw 'A primeira sessao nao reteve o lock esperado'}
  $b=Start-Session ($prefix+'B') $callB $false
  $blocked=$false
  for($i=0;$i -lt 25;$i++){
   if((Sql "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='neia_delta_${prefix}B' AND cardinality(pg_blocking_pids(pid))>0)") -eq 't'){$blocked=$true;break}
   Start-Sleep -Milliseconds 30
  }
  Check $blocked ($prefix+': segunda sessao esperou lock real')
 }finally{if($a){Finish-Session $a};if($b){Finish-Session $b}}
}
Sql @'
INSERT INTO public.contas(id,tipo,valor) VALUES('22000000-0000-4000-8000-000000000099','pagar',100);
INSERT INTO public.categorias(id,nome,slug) VALUES('33000000-0000-4000-8000-000000000099','Categoria sintetica','delta-concorrencia');
INSERT INTO public.produtos(id,categoria_id,nome,preco,estoque) VALUES('44000000-0000-4000-8000-000000000099','33000000-0000-4000-8000-000000000099','Produto sintetico',10,10);
INSERT INTO auth.users(id,email) VALUES('11000000-0000-4000-8000-000000000098','delta-a@example.invalid'),('11000000-0000-4000-8000-000000000099','delta-b@example.invalid');
UPDATE public.user_roles SET role='motoboy' WHERE user_id IN ('11000000-0000-4000-8000-000000000098','11000000-0000-4000-8000-000000000099');
INSERT INTO public.motoboys(id,user_id,nome) VALUES('66000000-0000-4000-8000-000000000098','11000000-0000-4000-8000-000000000098','Sintetico disputa A'),('66000000-0000-4000-8000-000000000099','11000000-0000-4000-8000-000000000099','Sintetico disputa B');
INSERT INTO public.pedidos(id,cliente_nome,telefone,endereco,bairro,cidade,tipo_entrega,status) VALUES('77000000-0000-4000-8000-000000000099','Ficticio','','Rua','Bairro','Cidade','entrega','pronto');
'@|Out-Null
$pay="public.registrar_pagamento_conta('22000000-0000-4000-8000-000000000099',6000,'delta-concorrente')"
Dispute 'pagamento' $pay $pay
Check ((Sql "SELECT valor_pago=60 AND status='pendente' FROM public.contas WHERE id='22000000-0000-4000-8000-000000000099'") -eq 't' -and (Sql "SELECT count(*) FROM public.conta_pagamento_eventos WHERE conta_id='22000000-0000-4000-8000-000000000099'") -eq '1') 'pagamento repetido simultaneo gera apenas um evento e preserva saldo restante'
$stock="public.movimentar_estoque_manual_atomico('44000000-0000-4000-8000-000000000099','saida',6,'delta','55000000-0000-4000-8000-000000000099',10)"
Dispute 'estoque' $stock $stock
Check ((Sql "SELECT estoque FROM public.produtos WHERE id='44000000-0000-4000-8000-000000000099'") -eq '4' -and (Sql "SELECT count(*) FROM public.estoque_mov_operacoes WHERE chave_idempotencia='55000000-0000-4000-8000-000000000099'") -eq '1') 'baixa simultanea repetida nao duplica consumo nem ledger'
$routeA="public.criar_rota_entrega_atomica(ARRAY['77000000-0000-4000-8000-000000000099']::uuid[],'66000000-0000-4000-8000-000000000098')"
$routeB=$routeA.Replace('000000000098','000000000099')
Dispute 'rota' $routeA $routeB
Check ((Sql "SELECT count(*) FROM public.rota_pedidos WHERE pedido_id='77000000-0000-4000-8000-000000000099'") -eq '1' -and (Sql "SELECT count(*) FROM public.rotas_entrega WHERE motoboy_id IN ('66000000-0000-4000-8000-000000000098','66000000-0000-4000-8000-000000000099')") -eq '1') 'operadores simultaneos nao duplicam pedido ou deixam rota orfa'

# Checkout: duas sessoes disputam as ultimas 50 unidades; sem extensoes.
Sql @'
INSERT INTO public.loja_config(id,nome,pix_chave,endereco,bairro,cidade) VALUES(true,'LOJA TESTE','SIMULADO','Rua','Bairro','Cidade');
INSERT INTO public.reserva_proveniencia_config(id,controlado,observacao) VALUES(true,true,'Teste concorrente sintetico');
INSERT INTO public.produtos(id,categoria_id,nome,preco,estoque,tipo_venda,disponivel) VALUES
('c2000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000099','Concorrente A',1,50,'combo_50',true),
('c2000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000099','Concorrente B',1,50,'combo_50',true);
INSERT INTO public.lotes(produto_id,codigo,quantidade,restante,validade) VALUES
('c2000000-0000-4000-8000-000000000001','CONC-A',50,50,current_date+1),
('c2000000-0000-4000-8000-000000000002','CONC-B',50,50,current_date+1);
'@|Out-Null
$dados='{"cliente_nome":"Teste","telefone":"11000000000","tipo_entrega":"retirada","forma_pagamento":"dinheiro"}'
$itens='[{"produto_id":"c2000000-0000-4000-8000-000000000001","quantidade":50}]'
$a="public.criar_pedido_com_reserva('c4000000-0000-4000-8000-000000000001','checkout','$dados','$itens')"
$b=$a.Replace('c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')
Dispute 'checkout-saldo' $a $b
Check ((Sql "SELECT estoque=0 FROM public.produtos WHERE id='c2000000-0000-4000-8000-000000000001'") -eq 't' -and (Sql "SELECT count(*) FROM public.pedidos WHERE id IN ('c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002')") -eq '1') 'checkout concorrente reserva somente saldo disponivel'
$a=$a.Replace('c4000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000003').Replace('c2000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000002')
Dispute 'checkout-idem' $a $a
Check ((Sql "SELECT count(*) FROM public.reservas_estoque WHERE pedido_id='c4000000-0000-4000-8000-000000000003'") -eq '1' -and (Sql "SELECT estoque FROM public.produtos WHERE id='c2000000-0000-4000-8000-000000000002'") -eq '0') 'checkout repetido simultaneo gera unica reserva/debito'
$rid=Sql "SELECT id FROM public.reservas_estoque WHERE pedido_id='c4000000-0000-4000-8000-000000000001'"
$a="public.registrar_consumo_reserva('$rid',50,'c5000000-0000-4000-8000-000000000001')"
Dispute 'consumo-idem' $a $a
Check ((Sql "SELECT restante FROM public.lotes WHERE codigo='CONC-A'") -eq '0' -and (Sql "SELECT count(*) FROM public.reserva_consumos WHERE reserva_id='$rid'") -eq '1') 'retirada simultanea repetida nao duplica baixa fisica'
$rid=Sql "SELECT id FROM public.reservas_estoque WHERE pedido_id='c4000000-0000-4000-8000-000000000003'"
$a="public.registrar_consumo_reserva('$rid',25,'c5000000-0000-4000-8000-000000000002')"
$b="public.cancelar_pedido_atomico('c4000000-0000-4000-8000-000000000003','Disputa sintetica')"
Dispute 'consumo-cancelamento' $a $b
Check ((Sql "SELECT restante FROM public.lotes WHERE codigo='CONC-B'") -eq '25' -and (Sql "SELECT estoque FROM public.produtos WHERE id='c2000000-0000-4000-8000-000000000002'") -eq '25' -and (Sql "SELECT status FROM public.pedidos WHERE id='c4000000-0000-4000-8000-000000000003'") -eq 'cancelado') 'cancelamento concorrente devolve somente restante nao retirado'
@{status='LOCAL_TWO_SESSION_CONCURRENCY_PASSED';checks=14;components=@('pagamento','estoque','rota','checkout-saldo','checkout-idem','consumo-idem','consumo-cancelamento');newExtensions=0;authServicesTested=$false}|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $State.path 'concurrency-final11-result.json') -Encoding utf8
