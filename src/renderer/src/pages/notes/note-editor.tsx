import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
  type PartialBlock
} from '@blocknote/core'
import { pt } from '@blocknote/core/locales'
import { codeBlockOptions, syntaxHighlighter } from '@blocknote/code-block'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import { Check, CircleAlert, FileQuestion, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AttachmentInput } from '@shared/schemas'
import type { Note } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { ConfirmDelete } from '@renderer/components/confirm-delete'
import { EmptyState } from '@renderer/components/page-header'
import { TopicSelect } from '@renderer/components/topic-select'
import { api } from '@renderer/lib/api'
import { noteTitle } from '@renderer/lib/format'
import { useNote, useRemoveNote } from '@renderer/lib/queries'
import { useTheme } from '@renderer/lib/theme'
import { useAutosave, type SaveStatus } from './use-autosave'
import './editor.css'

/** Blocos padrão + bloco de código com realce de sintaxe (Shiki). */
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: 'text' })
  }
})

const dictionary = {
  ...pt,
  placeholders: { ...pt.placeholders, default: "Escreva, ou digite '/' para comandos" }
}

export function NoteEditor({ noteId }: { noteId: number }): React.JSX.Element | null {
  const { data: note, isError } = useNote(noteId)

  if (isError) {
    return (
      <div className="p-8">
        <EmptyState icon={<FileQuestion />} title="Anotação não encontrada">
          Ela pode ter sido excluída.
        </EmptyState>
      </div>
    )
  }
  if (!note) return null
  // key: cada anotação ganha um editor novo, com o conteúdo inicial dela
  return <LoadedEditor key={note.id} note={note} />
}

async function uploadFile(file: File): Promise<string> {
  try {
    return await api.attachments.save({
      mimeType: file.type as AttachmentInput['mimeType'],
      data: new Uint8Array(await file.arrayBuffer())
    })
  } catch (error) {
    toast.error((error as Error).message)
    throw error
  }
}

function LoadedEditor({ note }: { note: Note }): React.JSX.Element {
  const { resolved } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const remove = useRemoveNote()
  const { status, schedule } = useAutosave(note.id)
  const [title, setTitle] = useState(note.title)
  const [topicId, setTopicId] = useState(note.topicId)

  const editor = useCreateBlockNote({
    schema,
    extensions: [syntaxHighlighter],
    initialContent:
      note.content.length > 0
        ? (note.content as PartialBlock<typeof schema.blockSchema>[])
        : undefined,
    dictionary,
    uploadFile
  })

  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true

  return (
    <div className="mx-auto max-w-4xl px-6 pt-6 pb-24">
      <div className="mb-6 flex items-center gap-3 px-13.5">
        <TopicSelect
          value={topicId}
          onChange={(id) => {
            setTopicId(id)
            schedule({ topicId: id })
          }}
          className="h-8 w-auto max-w-72 border-none bg-transparent px-2 text-muted-foreground shadow-none hover:bg-accent dark:bg-transparent"
        />
        <span className="ml-auto">
          <SaveIndicator status={status} updatedAt={note.updatedAt} />
        </span>
        <ConfirmDelete
          title="Excluir anotação?"
          description={`"${noteTitle(title)}" será excluída permanentemente.`}
          onConfirm={() =>
            remove.mutate([note.id], { onSuccess: () => navigate('/anotacoes', { replace: true }) })
          }
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir anotação"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        </ConfirmDelete>
      </div>

      <textarea
        value={title}
        rows={1}
        autoFocus={focusTitle}
        placeholder="Sem título"
        onChange={(e) => {
          setTitle(e.target.value)
          schedule({ title: e.target.value })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            editor.focus()
          }
        }}
        className="field-sizing-content mb-4 w-full resize-none bg-transparent px-13.5 text-4xl leading-tight font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
      />

      <BlockNoteView
        editor={editor}
        theme={resolved}
        className="sentinela-editor"
        onChange={() => schedule({ content: editor.document })}
      />
    </div>
  )
}

function SaveIndicator({
  status,
  updatedAt
}: {
  status: SaveStatus
  updatedAt: Date
}): React.JSX.Element {
  const base = 'flex items-center gap-1.5 text-xs text-muted-foreground'
  if (status === 'error') {
    return (
      <span className={`${base} text-destructive`}>
        <CircleAlert className="size-3.5" /> Erro ao salvar
      </span>
    )
  }
  if (status === 'pending' || status === 'saving') {
    return (
      <span className={base}>
        <Loader2 className="size-3.5 animate-spin" /> Salvando...
      </span>
    )
  }
  return (
    <span className={base} title={`Editada em ${updatedAt.toLocaleString('pt-BR')}`}>
      <Check className="size-3.5" /> Salvo
    </span>
  )
}
