import { Route, Routes } from 'react-router'
import { AppShell } from './components/app-shell'
import { ErrorBoundary } from './components/error-boundary'
import { TodayPage } from './pages/today'
import { AgendaPage } from './pages/agenda'
import { TasksPage } from './pages/tasks'
import { TopicsPage } from './pages/topics'
import { SettingsPage } from './pages/settings'
import { NotesPage } from './pages/notes'
import { LibraryPage } from './pages/library'
import { ReaderPage } from './pages/reader'
import { ComingSoonPage } from './pages/coming-soon'
import { MentorIcon, ProjectsIcon } from './components/icons'

function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="tarefas" element={<TasksPage />} />
        <Route path="temas" element={<TopicsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="anotacoes/:noteId?" element={<NotesPage />} />
        <Route path="biblioteca" element={<LibraryPage />} />
        <Route path="biblioteca/:bookId" element={<ReaderPage />} />
        <Route
          path="projetos"
          element={
            <ComingSoonPage
              title="Projetos"
              icon={<ProjectsIcon />}
              step={6}
              text="Integração com seus repositórios do GitHub e lembretes de commit."
            />
          }
        />
        <Route
          path="mentora"
          element={
            <ComingSoonPage
              title="IA mentora"
              icon={<MentorIcon />}
              step={7}
              text="Cronogramas, tópicos de estudo e exercícios com gabarito gerados pela IA."
            />
          }
        />
      </Route>
      {/* Leitor em janela separada: sem o menu lateral */}
      <Route
        path="leitor/:bookId"
        element={
          <ErrorBoundary>
            <ReaderPage standalone />
          </ErrorBoundary>
        }
      />
    </Routes>
  )
}

export default App
