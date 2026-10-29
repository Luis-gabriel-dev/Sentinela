/*
 * Estrutura de sumários (capítulos > seções > subseções) a partir de texto, sem IA: numeração
 * ("3", "3.1", "3.1.2"), marcadores ("Capítulo 3", "Módulo 2", "Aula 5"), títulos e listas de
 * Markdown, e colunas de planilha. Sem dependências, para dar para testar fora do app.
 */

/** Um item do sumário. `prefix` é a numeração ("3.1", "Capítulo 3"), separada do título. */
export interface OutlineNode {
  key: string
  prefix: string | null
  title: string
  /** Onde abrir no livro, como na URL do leitor: "pagina=12" ou "href=...". */
  bookLocation: string | null
  children: OutlineNode[]
}

/** Item ainda sem hierarquia: o nível diz onde ele entra (1 = capítulo). */
export interface FlatItem {
  level: number
  prefix: string | null
  title: string
  bookLocation?: string | null
}

/** Itens que quase nunca são matéria de estudo; vêm desmarcados na prévia. */
const SKIPPED =
  /^(resumo|refer[êe]ncias|[íi]ndice|bibliografia|sum[áa]rio|pref[áa]cio|apresenta[çc][ãa]o|agradecimentos|sobre (o|os|a|as) autor|capa|folha de rosto|cr[ée]ditos|copyright|dedicat[óo]ria|ep[íi]grafe|gloss[áa]rio|contents|index|references|acknowledg|about the author|cover|title page)\b/i

export const skippedByDefault = (title: string): boolean => SKIPPED.test(title.trim())

/** Monta a árvore a partir dos níveis (um salto de nível vira o nível seguinte). */
export function buildTree(items: FlatItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: { level: number; node: OutlineNode }[] = []
  items.forEach((item, i) => {
    const node: OutlineNode = {
      key: String(i),
      prefix: item.prefix,
      title: item.title,
      bookLocation: item.bookLocation ?? null,
      children: []
    }
    while (stack.length && stack.at(-1)!.level >= item.level) stack.pop()
    if (stack.length) stack.at(-1)!.node.children.push(node)
    else roots.push(node)
    stack.push({ level: item.level, node })
  })
  return roots
}

/** Árvore de volta para a lista com níveis, na mesma ordem (as chaves de buildTree se mantêm). */
export const flattenOutline = (nodes: OutlineNode[], level = 1): FlatItem[] =>
  nodes.flatMap((n) => [
    { level, prefix: n.prefix, title: n.title, bookLocation: n.bookLocation },
    ...flattenOutline(n.children, level + 1)
  ])

/**
 * Sobe (-1) ou desce (+1) o nível do item `index`, levando os subitens junto. Nenhum item fica
 * mais de um nível abaixo do anterior; um movimento inválido devolve a mesma lista.
 */
export function shiftLevel(items: FlatItem[], index: number, delta: -1 | 1): FlatItem[] {
  const item = items[index]
  const level = item.level + delta
  const maxLevel = index === 0 ? 1 : items[index - 1].level + 1
  if (level < 1 || level > maxLevel) return items
  let end = index + 1
  while (end < items.length && items[end].level > item.level) end++
  return items.map((it, i) => (i >= index && i < end ? { ...it, level: it.level + delta } : it))
}

export const countNodes = (nodes: OutlineNode[]): number =>
  nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0)

export const outlineDepth = (nodes: OutlineNode[]): number =>
  nodes.reduce((max, n) => Math.max(max, 1 + outlineDepth(n.children)), 0)

/** Tira marcações de Markdown e de lista do começo da linha. */
const stripMarkup = (line: string): string =>
  line
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+•]\s+)/, '')
    .replace(/\*\*|__/g, '')
    .trim()

/**
 * Tira do fim o número de página com pontilhado ("Introdução ........ 12") e a duração de aula
 * ("Boas-vindas 05:12", "Instalação (12min)").
 */
const stripPageNumber = (title: string): string =>
  title
    .replace(/\s*(\.{2,}|…+|_{2,}|·{2,})\s*\d{1,4}$/, '')
    .replace(/\s*[([]?\d{1,2}:\d{2}(:\d{2})?[)\]]?$/, '')
    .replace(/\s*[([]?\d{1,3}\s?min(utos)?[)\]]?$/i, '')
    .trim()

const MARKER =
  /^(parte|part|unidade|unit|m[óo]dulo|module|cap[íi]tulo|chapter|se[çc][ãa]o|section|semana|week|aula|lesson|li[çc][ãa]o)\s+(\d{1,3}|[IVXLC]{1,6})\b\s*[–—:.)-]?\s*(.*)$/i
const NUMBERED = /^(\d{1,3}(?:\.\d{1,3})+)\.?\s+(\S.*)$/
const TOP_NUMBERED = /^(\d{1,3})[.)]?\s+([A-ZÀ-Ý].*)$/

/**
 * Sumário numerado ou com marcadores. Os marcadores ganham nível pela ordem em que aparecem
 * ("Parte" antes de "Capítulo" = Parte acima); "3.1.2" fica dois níveis abaixo do último
 * marcador (ou do capítulo "3", sem marcadores). Títulos quebrados em duas linhas (PDF) são
 * juntados.
 */
export function parseNumbered(text: string): FlatItem[] {
  const markerLevels = new Map<string, number>()
  const items: FlatItem[] = []
  const seen = new Set<string>()
  let markerLevel = 0
  let lastTop = 0
  let awaitingTitle: FlatItem | null = null
  let previousWasItem = false

  const push = (item: FlatItem, key: string): void => {
    // Sumário repetido no corpo do livro (títulos das seções): fica o primeiro.
    if (seen.has(key)) return
    seen.add(key)
    items.push(item)
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = stripMarkup(raw)
    if (!line) {
      previousWasItem = false
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(MARKER))) {
      const word = m[1].toLowerCase()
      if (!markerLevels.has(word)) markerLevels.set(word, markerLevels.size + 1)
      markerLevel = markerLevels.get(word)!
      const prefix = `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`
      const item = { level: markerLevel, prefix, title: stripPageNumber(m[3]) }
      push(item, prefix.toLowerCase())
      awaitingTitle = item.title ? null : item
      previousWasItem = true
      continue
    }
    if ((m = line.match(NUMBERED))) {
      const depth = m[1].split('.').length
      push(
        { level: (markerLevel || 1) + depth - 1, prefix: m[1], title: stripPageNumber(m[2]) },
        m[1]
      )
      awaitingTitle = null
      previousWasItem = true
      continue
    }
    if (!markerLevels.size && (m = line.match(TOP_NUMBERED))) {
      const n = Number(m[1])
      // Só vale como capítulo se a sequência fizer sentido (1, 2, 3...), não "80 (HTTP)".
      if (n === lastTop + 1) {
        lastTop = n
        push({ level: 1, prefix: m[1], title: stripPageNumber(m[2]) }, m[1])
        awaitingTitle = null
        previousWasItem = true
        continue
      }
    }
    if (awaitingTitle) {
      // "Capítulo 3" numa linha e o título na seguinte.
      awaitingTitle.title = stripPageNumber(line)
      awaitingTitle = null
    } else if (previousWasItem && /^[a-zà-ÿ(]/.test(line) && items.length) {
      // Título quebrado em duas linhas.
      const last = items.at(-1)!
      last.title = stripPageNumber(`${last.title} ${line}`)
    }
    previousWasItem = false
  }
  return items.filter((i) => i.title)
}

/** Títulos de Markdown (#, ##...) e listas aninhadas por recuo. */
export function parseMarkdown(text: string): FlatItem[] {
  const items: FlatItem[] = []
  let headingLevel = 0
  for (const raw of text.split(/\r?\n/)) {
    const heading = raw.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      headingLevel = heading[1].length
      items.push({ level: headingLevel, prefix: null, title: stripMarkup(heading[2]) })
      continue
    }
    const bullet = raw.match(/^(\s*)([-*+•]|\d+[.)])\s+(.+)$/)
    if (bullet) {
      const indent = Math.floor(bullet[1].replace(/\t/g, '  ').length / 2)
      items.push({
        level: headingLevel + 1 + indent,
        prefix: null,
        title: stripPageNumber(stripMarkup(bullet[3]))
      })
    }
  }
  // Um único título no topo (o nome do documento) não é capítulo.
  const tops = items.filter((i) => i.level === Math.min(...items.map((x) => x.level)))
  return tops.length === 1 && items[0] === tops[0] ? items.slice(1) : items
}

/** Primeiro título "# ..." ou primeira linha curta: sugestão de nome para o tema. */
export function guessTitle(text: string): string | null {
  const heading = text.match(/^#\s+(.+)$/m)
  if (heading) return stripMarkup(heading[1]).slice(0, 200)
  const first = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean)
  return first && first.length <= 120 && !NUMBERED.test(first) && !MARKER.test(first)
    ? stripMarkup(first)
    : null
}

/** Melhor leitura do texto: numeração/marcadores; senão, títulos e listas de Markdown. */
export function parseOutlineText(text: string): FlatItem[] {
  const numbered = parseNumbered(text)
  if (numbered.length >= 3) return numbered
  const markdown = parseMarkdown(text)
  return markdown.length >= 3 ? markdown : []
}

/**
 * Planilha: se as linhas têm numeração, vale a numeração; senão, cada coluna é um nível
 * (o valor que muda em relação à linha de cima entra como item). A primeira linha é pulada
 * quando parece cabeçalho ("Capítulo", "Seção", "Aula"...).
 */
export function parseRows(rows: string[][]): FlatItem[] {
  const cells = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean))
  if (!cells.length) return []
  const header =
    /^(n[º°o]?\.?|n[úu]mero|cap[íi]tulos?|se[çc][õo]es|se[çc][ãa]o|subse[çc][ãa]o|t[óo]picos?|m[óo]dulos?|aulas?|unidades?|temas?|assuntos?|t[íi]tulos?|item|itens|parte|chapter|section|topic|title)$/i
  if (cells[0].filter(Boolean).every((c) => header.test(c))) cells.shift()

  const numbered = parseNumbered(cells.map((r) => r.filter(Boolean).join(' ')).join('\n'))
  if (numbered.length >= Math.max(3, cells.length * 0.6)) return numbered

  const items: FlatItem[] = []
  let previous: string[] = []
  for (const row of cells) {
    let changed = false
    row.forEach((value, col) => {
      if (!value) return
      if (changed || value !== previous[col]) {
        items.push({ level: col + 1, prefix: null, title: value })
        changed = true
      }
    })
    previous = row
  }
  return items
}
