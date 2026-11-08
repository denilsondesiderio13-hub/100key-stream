# 100Key Stream

Projeto inicial de compartilhamento de tela privado com WebRTC e Socket.IO.

## Requisitos
- Node.js 18 ou superior
- Navegador atualizado (Chrome ou Edge recomendado)

## Rodar no computador
1. Extraia o ZIP.
2. Abra a pasta `100key-stream` no terminal.
3. Execute `npm install`.
4. Execute `npm start`.
5. Abra `http://localhost:3000`.

## Como usar
- Clique em **Criar transmissão**.
- Clique em **Iniciar compartilhamento** e escolha a tela/janela.
- Copie o link e envie para quem vai assistir.
- O espectador abre o link `/watch/CODIGO-DA-SALA`.

## Publicar na internet
Hospede o Node.js em um serviço que aceite aplicações persistentes e configure um domínio com HTTPS. O navegador exige contexto seguro para `getDisplayMedia` (localhost funciona para testes). Para redes mais restritivas, configure um servidor TURN e adicione suas credenciais em `iceServers` no `public/app.js`.

## Observações
- Esta versão inclui senha opcional por sala, código personalizado, lista de espectadores, remoção pelo host, chat e botão de tela cheia.
- O servidor atual mantém as salas em memória; reiniciar o processo encerra as salas.
- A conexão usa STUN público para descoberta de rota. Uma implantação de produção deve configurar TURN, autenticação persistente, proteção contra abuso e limites de uso.
- A identidade visual é original 100Key, inspirada na referência enviada, sem copiar código proprietário da Crystal.
