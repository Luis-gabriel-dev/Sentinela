import { Route, Routes } from 'react-router'
import { AppShell } from './components/app-shell'
import { ErrorBoundary } from './components/error-boundary'
import { TodayPage } from './pages/today'
import { AgendaPage } from './pages/agenda'
import { WeekPage } from './pages/week'
import { TasksPage } from './pages/tasks'
import { TopicsPage } from './pages/topics'
import { SettingsPage } from './pages/settings'
import { NotesPage } from './pages/notes'
import { LibraryPage } from './pages/library'
import { ReaderPage } from './pages/reader'
import { ProjectsPage } from './pages/projects'
import { MentorPage } from './pages/mentor'

function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="semana" element={<WeekPage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="tarefas" element={<TasksPage />} />
        <Route path="temas" element={<TopicsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="anotacoes/:noteId?" element={<NotesPage />} />
        <Route path="biblioteca" element={<LibraryPage />} />
        <Route path="biblioteca/:bookId" element={<ReaderPage />} />
        <Route path="projetos" element={<ProjectsPage />} />
        <Route path="mentora" element={<MentorPage />} />
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
