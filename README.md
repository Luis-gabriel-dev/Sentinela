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
Drizzle, Tesseract, SDKs da Anthropic e da OpenAI e o `zod`, que o helper de saída estruturada
do SDK importa). Tudo que a interface usa (React, BlockNote, pdf.js...) vai em
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

### GitHub (Projetos)

- Consulta a API REST do GitHub direto do processo principal (`src/main/services/github.ts`),
  sem SDK. Sem token funciona para repositórios públicos (60 consultas/hora); com um
  _fine-grained token_ só de leitura (Contents, Issues, Pull requests) vê os privados e lista os
  repositórios da conta (5.000 consultas/hora).
- O token fica no banco **criptografado** pelo `safeStorage` do Electron (DPAPI no Windows), e
  só o processo principal o lê; a interface nunca recebe o token de volta.
- Cada sincronização faz cerca de 4 consultas por repositório: dados do repositório, último
  commit, commits por semana (`/stats/participation`, exato) e PRs abertos. Os dados ficam em
  cache na tabela `projects`; a página atualiza sozinha se o cache tiver mais de 30 minutos.
- Um projeto fica "parado" quando passa do limite de dias sem commit configurado nele
  (padrão: 7). Os parados aparecem na página Hoje.

### IA mentora

- **Provedores** (`src/main/ai/providers.ts`), todos atrás da mesma interface `AiClient`
  (`generate` com saída estruturada validada por zod, `chat` com streaming, `listModels`):
  - **Claude**: SDK oficial `@anthropic-ai/sdk`, modelo padrão `claude-opus-5-5`, esforço
    `medium`, saída estruturada com `betaZodOutputFormat`. Nos modelos que suportam, o pedido vai
    com `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): se o modelo recusar por
    política, a própria API repete em outro modelo.
  - **OpenAI**: SDK oficial `openai`, Responses API (`responses.parse` com `zodTextFormat`).
  - **Ollama**: API local (`/api/chat` com `format` = JSON Schema do zod). Sem chave, offline.
    A janela é fixada em 16 mil tokens (`num_ctx`) com `truncate: false`: por padrão o Ollama
    usa 4096 e descarta o começo do pedido sem avisar (instruções e dados), e o modelo passa a
    inventar. Com `truncate: false`, um pedido grande demais vira erro em vez de corte. As listas
    do primeiro nível do schema levam `minItems: 1`, porque modelos pequenos às vezes devolvem
    lista vazia.
- As chaves ficam criptografadas com `safeStorage`; ao salvar, a chave é validada listando os
  modelos (não consome tokens).
- **Modelos**: `listModels` devolve `ModelInfo` (tipo, parâmetros, quantização, tamanho, visão).
  No Ollama vêm só os já baixados (`/api/tags`, que informa as capacidades de cada modelo); os de
  embedding ficam fora da escolha do modelo de conversa. O seletor aparece em Configurações e no
  topo da IA mentora.
- Configuração em `src/main/ai/config.ts` (tabela `settings`: `ai.config`, `rag.config` e as
  chaves `ai.key.*`).
- **Contexto** (`src/main/ai/context.ts`): a conversa recebe um retrato dos estudos (progresso,
  agenda, tarefas com atraso já marcado, resultados de exercícios, projetos, títulos das
  anotações), refeito a cada mensagem. Cada seção tem um teto, para o retrato não crescer sem
  fim com o uso. Exercícios usam o texto das anotações e os destaques dos livros do tema, e
  reforçam questões erradas antes.
- **Orçamento**: cada provedor informa quanto texto aguenta (`maxInputChars`: ~32 mil caracteres
  no Ollama, 120 mil na nuvem). Os trechos da busca inteligente usam até 1/4 dele; o material dos
  exercícios, até a metade (se o material do tema não couber, a busca escolhe os trechos mais
  ligados ao tema e ao foco pedido).
- **Compactação** (`ai_conversations.summary` / `summary_until`): quando a conversa não cabe mais,
  as mensagens antigas viram um resumo (feito pelo próprio modelo, em partes se preciso) e as
  mais recentes seguem inteiras; a interface mostra "Compactando a conversa..." pelo evento
  `status` do streaming. O estudante também pode compactar quando quiser (botão Compactar, com
  instruções opcionais do que preservar), e vê quanto do contexto a conversa ocupa. As mensagens
  continuam salvas e visíveis; uma divisória marca até onde a IA recebe só o resumo.
- **Busca inteligente / RAG** (`src/main/ai/rag.ts`): anotações, destaques e páginas com OCR são
  cortados em trechos (~1.200 caracteres, com sobreposição) nas tabelas `rag_chunks` e
  `rag_sources` (impressão digital por origem: só o que mudou é refeito, alguns segundos depois de
  cada alteração). Os vetores vêm de um modelo de embedding do **Ollama**, sempre local, mesmo
  com a conversa no Claude ou na OpenAI (automático: `bge-m3`, que entende bem português). A
  busca junta os vetores mais parecidos (similaridade ≥ 0,5, calibrada no bge-m3) com a FTS5
  `rag_chunks_fts` (todos os termos) por Reciprocal Rank Fusion. Os vetores são comparados em
  memória, sem extensão nativa (milissegundos para dezenas de milhares de trechos). Sem Ollama, a
  busca segue só por palavras. A resposta guarda os trechos usados (`ai_messages.sources`) e a
  interface mostra as fontes com link para a anotação ou para o livro no destaque/página
  (`/biblioteca/:id?destaque=` ou `?pagina=`). A mesma busca aparece em Anotações ("Relacionadas
  por significado") e em Configurações (testar a busca).
- Tudo que a IA devolve é conferido em código antes de gravar ou mostrar: tópicos duplicados,
  blocos fora do horário ou em conflito com a agenda, alternativas e índices inválidos.
- Sugestões de tópicos e de agenda **não são gravadas** sozinhas: a interface mostra e o
  estudante escolhe o que entra.
- A resposta da conversa chega aos pedaços pelo canal `sentinela:ai-stream` (main → interface);
  o preload só deixa escutar os canais listados em `EVENT_CHANNELS`.

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
