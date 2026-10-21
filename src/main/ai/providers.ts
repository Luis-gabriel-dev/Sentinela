import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'
import type { AiProvider } from '@shared/schemas'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

/** O que o Sentinela precisa de qualquer provedor de IA. */
export interface AiClient {
  /**
   * Quanto texto (em caracteres) dá para mandar num pedido e ainda sobrar espaço para a
   * resposta. Histórico da conversa e material dos exercícios são cortados para caber nisso.
   */
  maxInputChars: number
  /** Resposta estruturada, validada pelo schema. */
  generate<T>(request: {
    system: string
    prompt: string
    schema: z.ZodType<T>
    name: string
  }): Promise<T>
  /** Conversa com streaming; devolve o texto final. */
  chat(request: {
    system: string
    messages: ChatTurn[]
    onDelta: (text: string) => void
  }): Promise<string>
  listModels(): Promise<string[]>
}

export class AiError extends Error {}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-5',
  ollama: 'llama3.2'
}

// Claude e GPT aguentam bem mais, mas pedidos enormes custam caro e não melhoram a resposta.
const CLOUD_MAX_INPUT_CHARS = 120_000

// ---------------------------------------------------------------- Anthropic (Claude)

/** Modelos com fallback no servidor quando o pedido é recusado por política. */
const SUPPORTS_FALLBACK = /^claude-(opus-5|opus-5-5|fable-5-1|sonnet-5-5)$/

function anthropicError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiError('Chave da Anthropic inválida ou revogada')
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('Esta chave da Anthropic não tem acesso a este modelo')
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiError('Modelo não encontrado na Anthropic')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('Limite de uso da Anthropic atingido. Tente de novo em instantes.')
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AiError('Sem conexão com a Anthropic')
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError(`A Anthropic respondeu com erro ${error.status ?? ''}`.trim())
  }
  return error instanceof Error ? error : new AiError(String(error))
}

function anthropicClient(apiKey: string, model: string): AiClient {
  const client = new Anthropic({ apiKey })
  // Fallback por padrão: se o modelo recusar por política, a API repete em outro modelo.
  const fallback = SUPPORTS_FALLBACK.test(model)
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : { betas: [] }

  const checkRefusal = (stopReason: string | null): void => {
    if (stopReason === 'refusal') {
      throw new AiError('O modelo recusou este pedido. Tente reformular.')
    }
  }

  return {
    maxInputChars: CLOUD_MAX_INPUT_CHARS,

    async generate({ system, prompt, schema }) {
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: 16000,
          ...fallback,
          system,
          messages: [{ role: 'user', content: prompt }],
          output_config: { effort: 'medium', format: betaZodOutputFormat(schema) }
        })
        checkRefusal(response.stop_reason)
        if (response.parsed_output == null) {
          throw new AiError('A resposta da IA veio num formato inesperado')
        }
        return response.parsed_output as z.infer<typeof schema>
      } catch (error) {
        throw anthropicError(error)
      }
    },

    async chat({ system, messages, onDelta }) {
      try {
        const stream = client.beta.messages.stream({
          model,
          max_tokens: 16000,
          ...fallback,
          system,
          messages,
          output_config: { effort: 'medium' }
        })
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            onDelta(event.delta.text)
          }
        }
        const final = await stream.finalMessage()
        checkRefusal(final.stop_reason)
        // Texto final consolidado (num fallback, o modelo que respondeu pode ter mudado).
        return final.content
          .flatMap((block) => (block.type === 'text' ? [block.text] : []))
          .join('')
      } catch (error) {
        throw anthropicError(error)
      }
    },

    async listModels() {
      try {
        const models: string[] = []
        for await (const model of client.models.list()) models.push(model.id)
        return models
      } catch (error) {
        throw anthropicError(error)
      }
    }
  }
}

// ---------------------------------------------------------------- OpenAI

function openaiError(error: unknown): Error {
  if (error instanceof OpenAI.AuthenticationError) {
    return new AiError('Chave da OpenAI inválida ou revogada')
  }
  if (error instanceof OpenAI.NotFoundError) {
    return new AiError('Modelo não encontrado na OpenAI')
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiError('Limite de uso da OpenAI atingido (ou sem créditos na conta)')
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AiError('Sem conexão com a OpenAI')
  }
  if (error instanceof OpenAI.APIError) {
    return new AiError(`A OpenAI respondeu com erro ${error.status ?? ''}`.trim())
  }
  return error instanceof Error ? error : new AiError(String(error))
}

function openaiClient(apiKey: string, model: string): AiClient {
  const client = new OpenAI({ apiKey })
  return {
    maxInputChars: CLOUD_MAX_INPUT_CHARS,

    async generate({ system, prompt, schema, name }) {
      try {
        const response = await client.responses.parse({
          model,
          instructions: system,
          input: prompt,
          text: { format: zodTextFormat(schema, name) }
        })
        if (response.output_parsed == null) {
          throw new AiError('A resposta da IA veio num formato inesperado')
        }
        return response.output_parsed as z.infer<typeof schema>
      } catch (error) {
        throw openaiError(error)
      }
    },

    async chat({ system, messages, onDelta }) {
      try {
        const stream = await client.responses.create({
          model,
          instructions: system,
          input: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true
        })
        let text = ''
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            text += event.delta
            onDelta(event.delta)
          } else if (event.type === 'response.failed' || event.type === 'error') {
            throw new AiError('A OpenAI interrompeu a resposta')
          }
        }
        return text
      } catch (error) {
        throw openaiError(error)
      }
    },

    async listModels() {
      try {
        const models: string[] = []
        for await (const model of client.models.list()) {
          if (/^(gpt|o\d|chatgpt)/.test(model.id)) models.push(model.id)
        }
        return models.toSorted()
      } catch (error) {
        throw openaiError(error)
      }
    }
  }
}

// ---------------------------------------------------------------- Ollama (local)

// O Ollama carrega os modelos com 4096 tokens e, se o pedido passar disso, descarta o começo
// (instruções e dados do estudante) sem avisar, e o modelo passa a inventar. Por isso a janela é
// fixada aqui (trocar a cada pedido faria o Ollama recarregar o modelo) e o corte é desligado.
const OLLAMA_CONTEXT = 16_384
// ~10 mil tokens em português, sobrando ~6 mil para a resposta.
const OLLAMA_MAX_INPUT_CHARS = 32_000
const ollamaOptions = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  truncate: false,
  options: { num_ctx: OLLAMA_CONTEXT, ...extra }
})

// A gramática do Ollama deixa o modelo fechar a lista logo de cara, e modelos pequenos fazem
// isso com frequência. Exigir ao menos um item nas listas do primeiro nível evita a resposta vazia.
function ollamaFormat(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as {
    properties?: Record<string, { type?: string; minItems?: number }>
  }
  for (const prop of Object.values(json.properties ?? {})) {
    if (prop.type === 'array') prop.minItems = Math.max(prop.minItems ?? 0, 1)
  }
  return json
}

function ollamaClient(baseUrl: string, model: string): AiClient {
  const base = baseUrl.replace(/\/+$/, '')

  async function post(path: string, body: unknown): Promise<Response> {
    let response: Response
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    } catch {
      throw new AiError(`O Ollama não respondeu em ${base}. Ele está aberto?`)
    }
    if (response.status === 404) {
      throw new AiError(
        `O modelo "${model}" não está instalado no Ollama (rode: ollama pull ${model})`
      )
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (detail.includes('exceed_context_size')) {
        throw new AiError(
          'O pedido ficou grande demais para o modelo local. Comece uma conversa nova ou use ' +
            'menos material.'
        )
      }
      throw new AiError(`O Ollama respondeu com erro ${response.status}`)
    }
    return response
  }

  return {
    maxInputChars: OLLAMA_MAX_INPUT_CHARS,

    async generate({ system, prompt, schema }) {
      const response = await post('/api/chat', {
        model,
        stream: false,
        format: ollamaFormat(schema),
        ...ollamaOptions({ temperature: 0.4 }),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ]
      })
      const data = (await response.json()) as { message?: { content?: string } }
      try {
        return schema.parse(JSON.parse(data.message?.content ?? ''))
      } catch {
        throw new AiError(
          'A resposta do modelo local veio num formato inesperado. Tente outro modelo.'
        )
      }
    },

    async chat({ system, messages, onDelta }) {
      const response = await post('/api/chat', {
        model,
        stream: true,
        ...ollamaOptions(),
        messages: [{ role: 'system', content: system }, ...messages]
      })
      // Resposta em NDJSON: um objeto JSON por linha.
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines.filter((l) => l.trim())) {
          const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string }
          if (chunk.error) throw new AiError(`Ollama: ${chunk.error}`)
          const delta = chunk.message?.content ?? ''
          if (delta) {
            text += delta
            onDelta(delta)
          }
        }
      }
      return text
    },

    async listModels() {
      let response: Response
      try {
        response = await fetch(`${base}/api/tags`)
      } catch {
        throw new AiError(`O Ollama não respondeu em ${base}. Ele está aberto?`)
      }
      if (!response.ok) throw new AiError(`O Ollama respondeu com erro ${response.status}`)
      const data = (await response.json()) as { models?: { name: string }[] }
      return (data.models ?? []).map((m) => m.name)
    }
  }
}

export function createAiClient(
  provider: AiProvider,
  options: { model: string; apiKey: string | null; ollamaUrl: string }
): AiClient {
  if (provider === 'ollama') return ollamaClient(options.ollamaUrl, options.model)
  if (!options.apiKey) {
    throw new AiError(
      `Configure a chave da ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} em Configurações`
    )
  }
  return provider === 'anthropic'
    ? anthropicClient(options.apiKey, options.model)
    : openaiClient(options.apiKey, options.model)
}
