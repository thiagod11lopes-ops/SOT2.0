# SOT React

Aplicação web (React + TypeScript + Vite) para cadastro e gestão de saídas (administrativas e ambulância).

## Requisitos

- Node.js 20+ (recomendado a versão LTS atual)

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

O servidor de desenvolvimento usa a porta **5174** (configurada em `vite.config.ts`).

## Build de produção

```bash
npm run build
npm run preview
```

## Dados no navegador

O estado do catálogo e das saídas é persistido em **IndexedDB** (não usa `localStorage`).

## CI (GitHub Actions)

Em cada push ou pull request para `main`/`master`, o workflow em `.github/workflows/ci.yml` executa `npm ci`, `npm run lint` e `npm run build`.

## Site público (GitHub Pages)

Após o push para `main`, o workflow **Deploy GitHub Pages** (`.github/workflows/deploy-pages.yml`) faz o build e publica o conteúdo de `dist`.

### URL oficial do site

Use sempre o link que o GitHub mostra em **Settings → Pages** (ex.: “Your site is live at …”). O caminho segue o **nome do repositório** (maiúsculas/minúsculas importam na URL).

Se aparecer **404**: confira na aba **Actions** se o job **Deploy GitHub Pages** concluiu com sucesso (incluindo o job **deploy**). Execuções **Waiting for approval** no ambiente `github-pages` precisam ser aprovadas antes do site ficar no ar.

### Ativar no GitHub (primeira vez)

1. Repositório → **Settings** → **Pages**
2. Em **Build and deployment** → **Source**: escolha **GitHub Actions**
3. Aguarde o workflow **Deploy GitHub Pages** terminar na aba **Actions**

No CI, o build define `VITE_BASE_PATH=/<nome-do-repo>/` automaticamente. Em build local (`npm run build`), o fallback é `/SOT2.0/` se `VITE_BASE_PATH` não estiver definido. Se **renomear o repositório**, faça um novo push para o GitHub gerar o deploy com o path correto.

## Publicar no GitHub

1. Crie um repositório vazio no GitHub (sem README/licença gerados pelo site, se quiser evitar conflito no primeiro push).

2. Na pasta do projeto:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

Se ainda não configurou nome/e-mail do Git nesta máquina:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
```

## Licença

Defina a licença do projeto no repositório (por exemplo MIT) se for público.
