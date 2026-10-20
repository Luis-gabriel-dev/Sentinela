# Sentinela

Agenda e caderno de estudos inteligente, 100% local (Electron + React + SQLite).

## Rodando

```bash
npm install
npm run dev
```

Os dados ficam em `%APPDATA%\Sentinela\` (o caminho do banco aparece em Configurações):

| Caminho        | Conteúdo                                    |
| -------------- | ------------------------------------------- |
| `sentinela.db` | Banco SQLite (tudo, exceto arquivos)        |
| `attachments\` | Imagens coladas nas anotações               |
| `covers\`      | Capas dos livros, geradas ao adicioná-los   |
| `tessdata\`    | Dados de idioma do OCR (copiados no 1º uso) |

Os livros **não** são copiados: a biblioteca guarda só o caminho do arquivo. Se um arquivo for
movido, o livro aparece como "Arquivo não encontrado" e pode ser localizado de novo nos detalhes.

Para usar outra pasta de dados, por exemplo para testes:

```powershell
$env:SENTINELA_DATA_DIR = "C:\caminho\de\teste"; npm run dev
```

## Scripts

| Comando                | O que faz                                                           |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | App em modo desenvolvimento, com hot reload na interface            |
| `npm run typecheck`    | Checa os tipos do processo principal e da interface                 |
| `npm run lint`         | ESLint + Prettier                                                   |
| `npm run db:generate`  | Gera uma migration nova depois de mudar `src/main/db/schema.ts`     |
| `npm run icons`        | Gera os ícones do app (`.ico`, `.icns`, `.png`) de `build/icon.svg` |
| `npm run build:unpack` | Gera o app sem instalador em `dist/win-unpacked/`                   |
| `npm run build:win`    | Gera o instalador do Windows em `dist/`                             |

As migrations em `drizzle/` são aplicadas automaticamente quando o app abre.

### Dependências

`dependencies` tem **só** o que o processo principal carrega em tempo de execução (SQLite,
Drizzle, Tesseract). Tudo que a interface usa (React, BlockNote, pdf.js...) vai em
`devDependencies`, porque o Vite já compila isso no bundle; se ficasse em `dependencies`, o
electron-builder empacotaria esses pacotes de novo, inteiros.

## Estrutura

```text
src/
├── shared/            Código usado pelos dois lados
│   ├── api.ts         Contrato da API (interface ↔ processo principal)
│   ├── schemas.ts     Validação com Zod
│   └── types.ts       Tipos do domínio
├── main/              Processo principal (Node)
│   ├── db/            Schema Drizzle e conexão SQLite
│   ├── services/      Regras de negócio (sem depender do Electron)
│   ├── desktop.ts     O que depende do sistema: diálogo de arquivos, Explorer, janelas
│   ├── ipc.ts         Despacha "namespace.metodo" para os serviços
│   ├── protocol.ts    Protocolo sentinela:// que serve arquivos locais
│   └── index.ts       Janelas, banco e registro da API
├── preload/           Expõe só window.sentinela (invoke e caminho de arquivo arrastado)
└── renderer/src/      Interface React
    ├── components/    Layout e componentes compartilhados (ui/ = shadcn)
    ├── lib/           Cliente da API, hooks do React Query, tema, pdf.js, foliate-js
    └── pages/         Hoje, Agenda, Tarefas, Temas, Anotações, Biblioteca, Leitor
```

### Protocolo `sentinela://`

A interface não lê o disco direto. Arquivos locais passam pelo protocolo, que só aceita nomes
validados:

| URL                                   | Origem                                  |
| ------------------------------------- | --------------------------------------- |
| `sentinela://attachments/<uuid>.png`  | Imagens das anotações                   |
| `sentinela://covers/<id>.jpg`         | Capas dos livros                        |
| `sentinela://books/<id>`              | Arquivo do livro cadastrado com esse id |
| `sentinela://pdfjs/<pasta>/<arquivo>` | Fontes, cmaps e wasm do pdf.js          |

No app empacotado, os arquivos do pdf.js vão para `resources/pdfjs/` (`extraResources` no
`electron-builder.yml`); em desenvolvimento, saem de `node_modules/pdfjs-dist/`.

### Leitores

- **PDF**: pdf.js (`PDFViewer`), com camada de texto para selecionar/copiar, busca e destaques
  desenhados por cima da página (retângulos normalizados por página).
- **EPUB, MOBI, AZW3, FB2, CBZ**: foliate-js. Destaques guardados como CFI.
- Livros com DRM (comprados na Amazon, por exemplo) não abrem.
- O leitor também abre em janela própria (rota `#/leitor/<id>`, sem o menu lateral).

### OCR (PDFs escaneados)

Quando um PDF não tem texto, o leitor oferece "Reconhecer texto (OCR)":

1. A interface renderiza cada página em ~200 DPI com o pdf.js e manda a imagem pelo IPC.
2. O processo principal reconhece com o Tesseract (português + inglês, modelos `best_int`, tudo
   local) e grava as linhas com a posição normalizada em `book_ocr_pages`.
3. O leitor coloca essas linhas como texto invisível na camada de texto do pdf.js, então
   seleção, cópia, busca e destaques funcionam como num PDF comum.

O processo pode ser pausado e continua de onde parou. Páginas com confiança abaixo de 60%
aparecem no menu "OCR" do leitor.

> O tesseract.js 7 tem um bug ao receber os idiomas em memória (`{ code, data }`), por isso os
> arquivos são copiados para `tessdata\` e lidos por `langPath` (veja `src/main/services/ocr.ts`).

### Ícones

- `build/icon.svg` é a fonte do ícone do app. Depois de mudá-lo, rode `npm run icons`, que gera
  `build/icon.ico`, `build/icon.icns`, `build/icon.png` e `resources/icon.png` usando o Chromium
  do Electron.
- `src/renderer/src/components/icons.tsx` tem os ícones próprios da interface (menu, telas vazias,
  leitor): grid de 24 px, traço de 1,75 e preenchimento _duotone_ (`.icon-duo`, mais forte no item
  ativo). Ícones pequenos de ação continuam vindo do `lucide-react`.

### Migrations

Depois de mudar `src/main/db/schema.ts`, rode `npm run db:generate`. Para SQL que o Drizzle não
gera sozinho (tabelas FTS5, gatilhos), crie uma migration vazia com
`npx drizzle-kit generate --custom --name <nome>` e escreva o SQL nela, separando os comandos
com `--> statement-breakpoint` (veja `drizzle/0002_notes_fts.sql`).

### Adicionando um método novo na API

1. Declare o método em `src/shared/api.ts` (e o schema Zod em `schemas.ts`, se tiver entrada).
2. Implemente no serviço correspondente em `src/main/services/`.
3. Na interface, chame `api.namespace.metodo(...)` ou crie um hook em `lib/queries.ts`.

### Adicionando componentes de UI

```bash
npx shadcn@latest add <componente>
```

O CLI gera os imports como `from "cn"`. Troque por `from "@renderer/lib/utils"`.
