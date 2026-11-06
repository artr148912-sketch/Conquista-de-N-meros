# Ilhas em Guerra — Multiplayer

Jogo de navegador para até 3 pessoas, com salas privadas e estado sincronizado via Socket.IO.

## Executar localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Publicar no Render

- Root Directory: `ilhas_em_guerra_multiplayer` (se o repositório contém esta pasta)
- Build Command: `npm install`
- Start Command: `npm start`

## Regras implementadas nesta versão

- Ilhas com 100 de vida, 6 soldados e $10 no início.
- Turno sem ação para compras; a partir do segundo ciclo, cada jogador recebe $2.
- Curandeiro: $5 por 10 de vida; com $10 ou mais, compra dois e gasta todo o dinheiro disponível.
- Forte: $6, permanente, acrescenta 4 de dano aos ataques de soldados.
- Ataque: 2 de dano por soldado, mais o bônus do Forte; o atacante precisa responder à questão matemática preparada pelo alvo (ou uma questão automática).
- Ataques recíprocos causam confronto de tropas depois do dano às ilhas.
- Exploração: resultado aleatório de 1 a 4 (Pomar, Bomba, 2 Recrutas ou Moeda Rosa).
- Pomar: +10 de vida máxima e atual; bloqueia até 5 de dano por ataque recebido.
- Bomba: destrói até 2 pomares; se o alvo não tiver pomar, causa 10 de dano.
- Loja rosa: 3 Pomares por 2 moedas (uma vez), Submarino por 3, Comandante por 5.
- Submarino: ataca um alvo escolhido por 10 de dano por turno; cada melhoria custa 1 moeda e acrescenta 10 de dano.
- Comandante: custa 6 soldados e 5 moedas, dá +25 de vida e causa 30 de dano a cada adversário por turno.

Observação: algumas interações foram interpretadas para tornar o jogo jogável (por exemplo, o submarino exige escolher um alvo na fase de compras). Salas e partidas ficam na memória do servidor e são apagadas se o serviço reiniciar ou adormecer.
