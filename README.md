# Sentinela

Agenda e caderno de estudos inteligente, 100% local (Electron + React + SQLite).

## Rodando

```bash
npm install
npm run dev
```

O banco fica em `%APPDATA%\Sentinela\sentinela.db` (o caminho aparece em Configurações), e as
imagens coladas nas anotações em `%APPDATA%\Sentinela\attachments\`.
Para usar outra pasta de dados, por exemplo para testes:

```powershell
$env:SENTINELA_DATA_DIR = "C:\caminho\de\teste"; npm run dev
```

## Scripts

| Comando                | O que faz                                                       |
| ---------------------- | --------------------------------------------------------------- |
| `npm run dev`          | App em modo desenvolvimento, com hot reload na interface        |
| `npm run typecheck`    | Checa os tipos do processo principal e da interface             |
| `npm run lint`         | ESLint + Prettier                                               |
| `npm run db:generate`  | Gera uma migration nova depois de mudar `src/main/db/schema.ts` |
| `npm run build:win`    | Gera o instalador do Windows em `dist/`                         |

As migrations em `drizzle/` são aplicadas automaticamente quando o app abre.

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
│   ├── ipc.ts         Despacha "namespace.metodo" para os serviços
│   ├── protocol.ts    Protocolo sentinela:// que serve arquivos locais (anexos)
│   └── index.ts       Janela, banco e registro da API
├── preload/           Expõe só window.sentinela.invoke para a interface
└── renderer/src/      Interface React
    ├── components/    Layout e componentes compartilhados (ui/ = shadcn)
    ├── lib/           Cliente da API, hooks do React Query, tema, utilitários
    └── pages/         Hoje, Agenda, Tarefas, Temas, Anotações, Configurações
```

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
