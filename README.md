# Servidor — Ficha de Frota (com banco Postgres)

Esta versão salva tudo em um banco de dados Postgres de verdade — os dados
ficam garantidos mesmo que o servidor reinicie, e você pode acessar de
qualquer rede depois de hospedar no Railway.

## Deploy no Railway (recomendado)

1. Suba esta pasta para um repositório no GitHub (privado, se preferir).
2. No [Railway](https://railway.app), clique em **New Project → Deploy from GitHub repo** e escolha o repositório.
3. Ainda no mesmo projeto, clique em **New → Database → Add PostgreSQL**.
   Isso cria automaticamente a variável `DATABASE_URL` e conecta ao seu serviço — você não precisa configurar nada manualmente.
4. Aguarde o deploy terminar. O servidor cria as tabelas (`users` e `records`) sozinho na primeira vez que rodar.
5. Vá em **Settings → Networking → Generate Domain** no serviço do app (não no banco).
6. Acesse: `https://SEU-DOMINIO.up.railway.app/manutencao-frota.html`
7. Envie esse link para os funcionários — funciona de qualquer rede, qualquer celular.

## Rodando localmente (opcional, para testar antes)

1. Instale o [Node.js](https://nodejs.org) 18+.
2. Tenha um Postgres acessível (local, Docker, ou a URL pública do banco do Railway).
3. Copie `.env.example` para `.env` e preencha `DATABASE_URL` com a conexão do seu banco.
4. Instale as dependências e rode:
   ```
   npm install
   npm start
   ```
5. Acesse `http://localhost:3000/manutencao-frota.html`

## O que mudou em relação à versão anterior (arquivo JSON)

- Os dados agora ficam em duas tabelas no Postgres:
  - `users` — nome e PIN (guardado como hash, nunca em texto puro)
  - `records` — cada registro de manutenção, com o campo `usuario` indicando quem cadastrou
- A API (`/api/users`, `/api/login`, `/api/register`, `/api/records`) continua exatamente igual — só a forma de guardar os dados mudou. O arquivo HTML não precisou de nenhuma alteração.
- Não existe mais `data/db.json` — se você usava a versão anterior, os registros antigos não são migrados automaticamente. Se precisar migrar esses dados, me avise que eu preparo um script.

## Instalando no celular dos funcionários

O app agora é um PWA (Progressive Web App) — os funcionários instalam direto
pelo navegador, sem precisar de loja de aplicativos. Depois de hospedado no
Railway (endereço com `https://`, obrigatório para isso funcionar), é só
mandar o link do app e cada um instala assim:

**iPhone (Safari):**
1. Abra o link no Safari (precisa ser Safari, não funciona pelo Chrome no iPhone)
2. Toque no ícone de compartilhar (quadrado com seta para cima)
3. Toque em **"Adicionar à Tela de Início"**
4. Confirme — o ícone da Pont.Com aparece na tela do celular, abrindo em tela cheia, sem barra de navegador

**Android (Chrome):**
1. Abra o link no Chrome
2. Toque nos três pontinhos no canto superior direito
3. Toque em **"Instalar app"** (ou "Adicionar à tela inicial")
4. Confirme — o ícone aparece junto com os outros apps do celular

Depois de instalado, o app abre direto na tela de login, com o ícone e as
cores da Pont.Com, funcionando como um aplicativo normal.

## O que foi adicionado para isso funcionar

- `public/manifest.json` — descreve o app (nome, ícone, cores) para o sistema do celular
- `public/sw.js` — service worker: permite o "instalar" funcionar e guarda uma cópia do app em cache, para abrir mesmo com internet ruim (os dados em si sempre vêm do servidor)
- `public/assets/icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — ícones do app em diferentes tamanhos

## Conta de administrador (ver tudo por funcionário)

Existe uma aba extra, **"Funcionários"**, que só aparece pra contas marcadas
como admin. Nela dá pra digitar o nome de um funcionário e ver na hora um
resumo (quantos registros, quantos veículos atendeu, etc.) e a lista completa
de tudo que ele já cadastrou.

Por padrão, **nenhuma conta é admin** — toda conta criada pelo app é comum.
Para tornar alguém admin, defina uma chave secreta no Railway e use ela uma
vez para promover a conta:

1. No Railway, vá no serviço do app → **Variables** → adicione uma variável
   `ADMIN_SETUP_KEY` com um valor secreto à sua escolha (ex: uma senha forte
   qualquer). Salve — o Railway reinicia o serviço sozinho.
2. Peça pra pessoa criar a conta normal dela no app primeiro (tela de login → "Criar usuário").
3. Promova essa conta rodando este comando (troque `SEU-DOMINIO`, `NOME` e
   `SUA-CHAVE`), pode ser no terminal do seu computador ou em qualquer site
   de teste de API:
   ```
   curl -X POST https://SEU-DOMINIO.up.railway.app/api/admin/promote \
     -H "Content-Type: application/json" \
     -d '{"name":"NOME_DO_FUNCIONARIO","setupKey":"SUA-CHAVE"}'
   ```
4. Pronto — da próxima vez que essa pessoa entrar no app, a aba "Funcionários" aparece pra ela.

Você pode promover quantas contas quiser repetindo o passo 3. Recomendo
remover ou trocar a `ADMIN_SETUP_KEY` depois de promover todo mundo que
precisa, por segurança.




O Railway faz backup automático de bancos Postgres nos planos pagos. Se estiver
no plano gratuito, vale exportar os dados de vez em quando (`pg_dump`) — posso
te ajudar com isso quando quiser.
