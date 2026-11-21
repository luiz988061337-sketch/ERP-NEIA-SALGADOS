# Homologação PostgreSQL 17

O manifesto de instalação limpa aplica os arquivos numerados com as substituições históricas explícitas. A 0077 consolida a impressão e cria os objetos Pix. Ela substitui 0058–0063, 0073 e 0074. A lista não pressupõe a existência das migrations 0099–0102.

A carga 0038 usa UUIDs de categorias fixos que o banco novo não tem. Ela não cria estruturas e fica fora do ensaio de esquema. O catálogo-base de 0000 e as regras de 0039 são mantidos. Para importar os itens adicionais de 0038 em uma instalação nova, valide o mapeamento por slug e os preços com o responsável antes de executar uma carga separada. As duas migrations Drizzle geradas (0001 e 0002) entram depois da reserva e do CRM, dos quais suas funções e policies dependem.

Em PowerShell, na raiz do ERP, execute com uma pasta de trabalho existente fora do projeto e uma porta local livre.

```powershell
.\scripts\homologacao-pg17\executar.ps1 -Scratch 'C:\Users\User\Documents\Codex' -Port 55436
```

O runner cria um cluster novo e usa senha aleatória, loopback e `ON_ERROR_STOP`. O servidor para ao final. Os dados sintéticos e os logs permanecem no diretório novo para inspeção. As funções de autenticação e as tabelas de Storage são substitutos locais. Os testes exercitam o PostgreSQL e suas policies com `SET ROLE authenticated`. A validação do token, dos papéis da API e do Storage exige Supabase representativo.

Para atualizar um banco existente, inventarie as migrations e rode `preflight-impressao.sql` em staging. Compare a definição dos triggers com a versão consolidada e uma instalação limpa. Se a 0077 já estiver instalada, preserve-a e teste apenas as incrementais pendentes. Se o banco tiver as tabelas Pix de 0059/0060 e ainda não tiver a 0077, teste `compat-pix-0059-0060.sql` e a 0077 na mesma transação, nessa ordem. A ponte adiciona as colunas ausentes e retira policies legadas permissivas antes que a 0077 instale as novas. Ela preserva o status das linhas antigas. Se as tabelas Pix ainda não existirem, a 0077 as cria. As quatro migrations históricas defeituosas não entram nessa sequência. Aplique a 0109 junto à troca do fluxo legado de criação de rotas pelo motoboy, após validar a atribuição pela Central e as permissões na API de staging.
