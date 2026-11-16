# 🎁 Amigo Secreto

Sorteio de amigo secreto com **regras de família**, **senha individual de 4 dígitos** e **envio opcional por e-mail**. Node.js + Express no servidor e JavaScript puro (ES modules) no navegador — sem etapa de build.

## Como usar

```bash
npm install
npm start          # http://localhost:3000
```

No primeiro início o console mostra a **senha do organizador** (ou use `ORGANIZER_PASSWORD` no `.env`). Altere-a depois em *Configurações*.

Fluxo:
1. O organizador entra em **Área do organizador** e importa os nomes (um por linha, com grupos de família opcionais).
2. Compartilha o link; cada pessoa cria sua senha de 4 números (e uma dica de presente).
3. O organizador clica em **Realizar sorteio**. Cada pessoa vê seu resultado com a senha — ou por e-mail, se configurado.

Formatos aceitos na importação: `Nome`, `Nome - Família`, `Nome (Família)`, `Nome, Família`, cabeçalhos `Família Silva:` / `[Silva]` e `Sem família:`.

## Configuração (`.env`)

Copie `.env.example` para `.env`. E-mail é opcional (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`…); sem ele tudo funciona pelo site. Para Gmail use uma [senha de app](https://myaccount.google.com/apppasswords) com `smtp.gmail.com`, porta `465` e `SMTP_SECURE=true`.

Para expor na internet: `npx cloudflared tunnel --url http://localhost:3000`, defina `TRUST_PROXY=1` e cole o link em *Configurações → Link público*.

## Estrutura

```
server/   app.js (Express) · store.js (JSON atômico) · routes/ · lib/ (draw, parser, security, validation) · mailer.js
public/   index.html · css/styles.css · js/ (api, dom, public, organizer, main)
tests/    sorteio, parser e API (npm test)
```

## Segurança

- Senhas (organizador e participantes) com **scrypt** + salt; nunca em texto puro.
- Organizador usa **sessão por token** (expira em 8 h); credenciais não vão na URL.
- **Bloqueio anti força-bruta** (5 erros → 10 min) no login e nas senhas de 4 dígitos.
- API pública não expõe e-mails nem dicas de presente; o resultado só sai com a senha.
- CSP restritiva (helmet), sem `innerHTML`/scripts inline, validação de toda entrada, escrita de dados atômica.
- Limitação conhecida: a senha de 4 dígitos é definida por quem clicar primeiro no nome — o organizador pode **redefinir** a senha de qualquer pessoa.
# amigo-secreto-simples
# amigo-secreto-simples
