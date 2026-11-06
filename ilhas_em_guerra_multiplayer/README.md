# Ilhas em Guerra — Multiplayer (lobby)

Esta versão implementa salas online com códigos, até 3 jogadores, lista de participantes em tempo real, anfitrião e início sincronizado do lobby.

## Requisitos
- Node.js 18 ou mais recente
- Internet para instalar as dependências e para os jogadores se conectarem ao servidor

## Executar no computador
1. Extraia o ZIP.
2. Abra um terminal dentro da pasta `ilhas_em_guerra_multiplayer`.
3. Execute `npm install`.
4. Execute `npm start`.
5. Abra `http://localhost:3000` no navegador.

Para testar com amigos pela internet, o servidor precisa ser publicado em um serviço de hospedagem que aceite aplicações Node.js e WebSocket (por exemplo, Render, Railway ou VPS). Depois, compartilhe o endereço público do site.

## O que está funcionando
- Criar sala com 2 ou 3 vagas.
- Código de sala aleatório.
- Entrar por código.
- Atualização em tempo real da lista de jogadores.
- Limite de vagas e mensagens de erro.
- Anfitrião pode iniciar quando houver pelo menos 2 jogadores.
- Troca de anfitrião quando ele sai.

## Ainda não implementado
O início da partida atualmente abre uma tela de confirmação sincronizada. O tabuleiro, turnos, ataques, dados, loja, saúde e regras econômicas ainda precisam ser conectados ao multiplayer em uma próxima etapa.

## Observação
As salas ficam na memória do servidor: se o servidor reiniciar, as salas abertas são encerradas. Esta é uma primeira versão para jogar com amigos, não um sistema de contas persistentes.
