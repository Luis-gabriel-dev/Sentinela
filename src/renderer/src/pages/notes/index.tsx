import { useParams } from 'react-router'
import { NotebookPen } from 'lucide-react'
import { EmptyState } from '@renderer/components/page-header'
import { NoteEditor } from './note-editor'
import { NotesSidebar } from './notes-sidebar'

export function NotesPage(): React.JSX.Element {
  const { noteId } = useParams()
  const id = noteId ? Number(noteId) : null

  return (
    <div className="flex h-full">
      <NotesSidebar activeId={id} />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {id !== null && Number.isInteger(id) ? (
          <NoteEditor noteId={id} />
        ) : (
          <div className="p-8">
            <EmptyState icon={<NotebookPen />} title="Escolha ou crie uma anotação">
              As anotações ficam organizadas pelos seus temas. Passe o mouse sobre um tema e clique
              no ícone de + para criar uma anotação dentro dele.
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
