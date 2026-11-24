import { Button } from "@/components/ui/button";

export function ErroAcessoPainel({
  nome,
  tentando,
  onTentar,
}: {
  nome: string;
  tentando: boolean;
  onTentar: () => void;
}) {
  return (
    <div className="space-y-3 p-6">
      <p role="alert" className="text-destructive">Não foi possível verificar o acesso a {nome}.</p>
      <Button disabled={tentando} onClick={onTentar}>Tentar novamente</Button>
    </div>
  );
}
