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

Após o push para `main`, o workflow **Deploy GitHub Pages** (`.github/workflows/deploy-pages.yml`) publica o build em:

**https://thiagod11lopes-ops.github.io/SOT2.0/**

### Ativar no GitHub (primeira vez)

1. Repositório → **Settings** → **Pages**
2. Em **Build and deployment** → **Source**: escolha **GitHub Actions**
3. Aguarde o workflow **Deploy GitHub Pages** terminar na aba **Actions**

O `vite.config.ts` usa `base: "/SOT2.0/"` só em build de produção (nome do repositório). Se renomear o repo, ajuste esse valor e o domínio acima.

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
