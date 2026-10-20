import { asc, eq } from 'drizzle-orm'
import type { Api } from '@shared/api'
import { githubTokenSchema, projectUpdateSchema, repoInputSchema } from '@shared/schemas'
import type { GithubStatus, Project } from '@shared/types'
import type { Db } from '../db/client'
import { projects, settings } from '../db/schema'

const API = 'https://api.github.com'
const TOKEN_KEY = 'github.token'
const USER_KEY = 'github.user'
const WEEKS = 12

/** Criptografia do token (no app: Electron safeStorage, ligado ao usuário do Windows). */
export interface Secrets {
  available(): boolean
  encrypt(plain: string): string
  decrypt(encoded: string): string
}

type Fetch = typeof fetch
type ProjectRow = typeof projects.$inferSelect

class GithubError extends Error {}

const toProject = (row: ProjectRow): Project => ({
  ...row,
  weeklyCommits: JSON.parse(row.weeklyCommits) as number[]
})

/** Segunda-feira 00:00 (horário local) da semana de `date`. */
function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

/** Conta commits por semana: 12 posições, da mais antiga à atual. */
export function bucketByWeek(dates: Date[], now = new Date()): number[] {
  const current = weekStart(now).getTime()
  const buckets = Array<number>(WEEKS).fill(0)
  for (const date of dates) {
    const weeksAgo = Math.round((current - weekStart(date).getTime()) / (7 * 86_400_000))
    if (weeksAgo >= 0 && weeksAgo < WEEKS) buckets[WEEKS - 1 - weeksAgo]++
  }
  return buckets
}

export function createGithubService(
  db: Db,
  secrets: Secrets,
  fetchImpl: Fetch = fetch
): { github: Api['github']; projects: Api['projects'] } {
  const getSetting = (key: string): string | null =>
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null

  const setSetting = (key: string, value: string): void => {
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run()
  }

  const token = (): string | null => {
    const stored = getSetting(TOKEN_KEY)
    if (!stored) return null
    try {
      return secrets.decrypt(stored)
    } catch {
      return null
    }
  }

  async function request(
    path: string,
    options: { token?: string | null; allow?: number[] } = {}
  ): Promise<Response> {
    const auth = options.token === undefined ? token() : options.token
    let response: Response
    try {
      response = await fetchImpl(`${API}${path}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Sentinela',
          ...(auth && { Authorization: `Bearer ${auth}` })
        }
      })
    } catch {
      throw new GithubError('Sem conexão com o GitHub')
    }
    if (response.ok || options.allow?.includes(response.status)) return response

    if (response.status === 401) throw new GithubError('Token do GitHub inválido ou expirado')
    if (
      (response.status === 403 || response.status === 429) &&
      response.headers.get('x-ratelimit-remaining') === '0'
    ) {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      const when = reset
        ? ` Tente de novo às ${new Date(reset).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`
        : ''
      throw new GithubError(
        `Limite de consultas ao GitHub atingido.${when}${auth ? '' : ' Conectar um token aumenta o limite.'}`
      )
    }
    if (response.status === 404) {
      throw new GithubError(
        auth
          ? 'Repositório não encontrado ou sem acesso com este token'
          : 'Repositório não encontrado (se for privado, conecte um token do GitHub)'
      )
    }
    throw new GithubError(`O GitHub respondeu com erro ${response.status}`)
  }

  const json = async <T>(path: string): Promise<T> => (await request(path)).json() as Promise<T>

  /** Total de itens de uma lista paginada, pelo cabeçalho Link (per_page=1). */
  const countFromLink = async (response: Response): Promise<number> => {
    const last = response.headers.get('link')?.match(/[?&]page=(\d+)>;\s*rel="last"/)
    if (last) return Number(last[1])
    return ((await response.json()) as unknown[]).length
  }

  async function fetchRepoData(repo: string): Promise<Partial<ProjectRow>> {
    const info = await json<{
      full_name: string
      description: string | null
      html_url: string
      default_branch: string
      language: string | null
      stargazers_count: number
      open_issues_count: number
      private: boolean
      archived: boolean
    }>(`/repos/${repo}`)

    type Commit = {
      html_url: string
      commit: {
        message: string
        author: { date: string } | null
        committer: { date: string } | null
      }
    }
    const commitDate = (c: Commit): Date =>
      new Date(c.commit.committer?.date ?? c.commit.author?.date ?? 0)
    const branch = encodeURIComponent(info.default_branch)

    // Último commit do branch principal. 409 = repositório vazio.
    const lastResponse = await request(
      `/repos/${info.full_name}/commits?sha=${branch}&per_page=1`,
      { allow: [409] }
    )
    const last = lastResponse.ok ? ((await lastResponse.json()) as Commit[])[0] : undefined

    // Commits por semana: o GitHub já calcula (exato, uma consulta só). Quando ele ainda está
    // calculando (202), conta pela lista de commits, limitada a 300.
    let weekly: number[] | null = null
    const stats = await request(`/repos/${info.full_name}/stats/participation`, {
      allow: [202, 204]
    })
    if (stats.status === 200) {
      const { all } = (await stats.json()) as { all?: number[] }
      if (all && all.length >= WEEKS) weekly = all.slice(-WEEKS)
    }
    if (!weekly && last) {
      const since = weekStart(new Date())
      since.setDate(since.getDate() - 7 * (WEEKS - 1))
      const recent: Commit[] = []
      for (let page = 1; page <= 3; page++) {
        const batch = await json<Commit[]>(
          `/repos/${info.full_name}/commits?sha=${branch}&since=${since.toISOString()}&per_page=100&page=${page}`
        )
        recent.push(...batch)
        if (batch.length < 100) break
      }
      weekly = bucketByWeek(recent.map(commitDate))
    }

    const openPrs = await countFromLink(
      await request(`/repos/${info.full_name}/pulls?state=open&per_page=1`)
    )

    return {
      repo: info.full_name,
      description: info.description,
      htmlUrl: info.html_url,
      defaultBranch: info.default_branch,
      language: info.language,
      stars: info.stargazers_count,
      openPrs,
      // open_issues_count do GitHub inclui os pull requests
      openIssues: Math.max(0, info.open_issues_count - openPrs),
      isPrivate: info.private,
      archived: info.archived,
      lastCommitAt: last ? commitDate(last) : null,
      lastCommitMessage: last ? last.commit.message.split('\n')[0].slice(0, 300) : null,
      lastCommitUrl: last?.html_url ?? null,
      weeklyCommits: JSON.stringify(weekly ?? Array<number>(WEEKS).fill(0)),
      syncedAt: new Date(),
      syncError: null
    }
  }

  const getRow = (id: number): ProjectRow => {
    const row = db.select().from(projects).where(eq(projects.id, id)).get()
    if (!row) throw new Error('Projeto não encontrado')
    return row
  }

  /** Sincroniza e grava; em caso de falha guarda o erro e mantém os dados anteriores. */
  async function syncRow(row: ProjectRow): Promise<void> {
    try {
      const data = await fetchRepoData(row.repo)
      db.update(projects).set(data).where(eq(projects.id, row.id)).run()
    } catch (error) {
      const message = error instanceof GithubError ? error.message : 'Falha ao sincronizar'
      db.update(projects)
        .set({ syncError: message, syncedAt: new Date() })
        .where(eq(projects.id, row.id))
        .run()
    }
  }

  const status = (): GithubStatus => {
    const user = getSetting(USER_KEY)
    const parsed = user ? (JSON.parse(user) as { login: string; avatarUrl: string | null }) : null
    return {
      connected: token() !== null,
      login: parsed?.login ?? null,
      avatarUrl: parsed?.avatarUrl ?? null,
      encryptionAvailable: secrets.available()
    }
  }

  const list = (): Project[] =>
    db.select().from(projects).orderBy(asc(projects.repo)).all().map(toProject)

  return {
    github: {
      async status() {
        return status()
      },

      async connect(input) {
        if (!secrets.available()) {
          throw new Error('Este sistema não oferece armazenamento seguro para o token')
        }
        const value = githubTokenSchema.parse(input)
        const user = (await (await request('/user', { token: value })).json()) as {
          login: string
          avatar_url: string | null
        }
        setSetting(TOKEN_KEY, secrets.encrypt(value))
        setSetting(USER_KEY, JSON.stringify({ login: user.login, avatarUrl: user.avatar_url }))
        return status()
      },

      async disconnect() {
        db.delete(settings).where(eq(settings.key, TOKEN_KEY)).run()
        db.delete(settings).where(eq(settings.key, USER_KEY)).run()
        return status()
      },

      async listRepos() {
        if (!token()) throw new Error('Conecte um token do GitHub para listar seus repositórios')
        type Repo = {
          full_name: string
          description: string | null
          private: boolean
          language: string | null
          stargazers_count: number
          pushed_at: string | null
        }
        const repos: Repo[] = []
        for (let page = 1; page <= 3; page++) {
          const batch = await json<Repo[]>(
            `/user/repos?per_page=100&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`
          )
          repos.push(...batch)
          if (batch.length < 100) break
        }
        return repos.map((r) => ({
          fullName: r.full_name,
          description: r.description,
          isPrivate: r.private,
          language: r.language,
          stars: r.stargazers_count,
          pushedAt: r.pushed_at ? new Date(r.pushed_at) : null
        }))
      }
    },

    projects: {
      async list() {
        return list()
      },

      async add(input) {
        const repo = repoInputSchema.parse(input)
        const exists = list().find((p) => p.repo.toLowerCase() === repo.toLowerCase())
        if (exists) throw new Error(`${exists.repo} já está nos seus projetos`)
        // Busca antes de inserir: um endereço errado não vira projeto quebrado.
        const data = await fetchRepoData(repo)
        const row = db
          .insert(projects)
          .values({ ...data, repo: data.repo ?? repo })
          .returning()
          .get()
        return toProject(row)
      },

      async update(id, input) {
        getRow(id)
        const row = db
          .update(projects)
          .set(projectUpdateSchema.parse(input))
          .where(eq(projects.id, id))
          .returning()
          .get()!
        return toProject(row)
      },

      async remove(id) {
        db.delete(projects).where(eq(projects.id, id)).run()
      },

      async sync(id) {
        const rows = id === undefined ? db.select().from(projects).all() : [getRow(id)]
        for (const row of rows) await syncRow(row)
        return list()
      }
    }
  }
}
