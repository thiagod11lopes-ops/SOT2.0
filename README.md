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
