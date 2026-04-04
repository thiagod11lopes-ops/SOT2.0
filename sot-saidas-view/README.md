# SOT · Vista mobile das saídas

Interface **paralela** e **só de leitura/consulta rápida** (com edição de KM e hora de chegada) para as mesmas saídas **Administrativas** e **Ambulância** do sistema principal (SOT2.0).

- **Visual**: escuro, tipografia clara, cartões grandes, barra inferior com duas abas, áreas seguras para iPhone/Android (`safe-area`).
- **Dados**: usa o **mesmo IndexedDB** que o app principal (`sot_app_db`, chave `sot-departures-v1`) quando o site é servido na **mesma origem** (mesmo domínio e caminho base).
- **Repositório separado no GitHub**: copie esta pasta para um repositório novo e publique com GitHub Pages (ou outro host estático).

## Repositório e URL próprios

1. Crie um repositório vazio no GitHub (ex.: `sot-saidas-view`).
2. Copie o conteúdo da pasta `sot-saidas-view` para a raiz desse repositório (ou use este monorepo e faça `git subtree split` / publicação só desta pasta).
3. Em **Settings → Pages**: origem **GitHub Actions** (recomendado) ou branch `gh-pages` com a pasta `dist`.
4. Defina o caminho base do Vite igual ao nome do repositório, para o site em `https://SEU_USUARIO.github.io/NOME_DO_REPO/`:

```bash
# build local (substitua pelo nome do seu repositório)
set VITE_BASE_PATH=/NOME_DO_REPO/
npm run build
```

No Linux/macOS: `export VITE_BASE_PATH=/NOME_DO_REPO/`

O workflow em `.github/workflows/pages.yml` define isso automaticamente no deploy.

## Sincronização de dados

| Situação | Comportamento |
|----------|----------------|
| Mesmo domínio que o SOT (ex.: ambos em `usuario.github.io` com o mesmo prefixo de path testado no mesmo browser) | Lista reflete o que está no IndexedDB partilhado. |
| **Outro** subdomínio ou **outro** repositório Pages (origem diferente) | O navegador **não** partilha IndexedDB. Use **Importar** e carregue o JSON de backup exportado pelo SOT (Configurações / backup). |

## Desenvolvimento

```bash
npm install
npm run dev
```

Abre em `http://localhost:3010` por defeito.

### Porque os dados podem não aparecer

O **IndexedDB** é por **origem** (protocolo + domínio + **porta**). O SOT principal em `http://localhost:3000` e esta app em `http://localhost:3010` são origens **diferentes** — não partilham armazenamento.

**Para ver as mesmas saídas no telemóvel em desenvolvimento**, use a vista integrada no próprio SOT (mesma porta):

- Abra o sistema principal (ex. `http://localhost:3000`) e na **página inicial** toque em **«Vista mobile das saídas»**, ou aceda diretamente a  
  `http://localhost:3000/#/saidas/administrativas`

Isso usa o mesmo IndexedDB que o cadastro de saídas.

O repositório `sot-saidas-view` continua útil para **deploy separado** no GitHub Pages (outro URL) com **Importar** JSON.

## Build

```bash
npm run build
```

Saída em `dist/`.
