import { Route, Routes } from 'react-router'
import { AppShell } from './components/app-shell'
import { TodayPage } from './pages/today'
import { AgendaPage } from './pages/agenda'
import { TasksPage } from './pages/tasks'
import { TopicsPage } from './pages/topics'
import { SettingsPage } from './pages/settings'
import { NotesPage } from './pages/notes'
import { ComingSoonPage } from './pages/coming-soon'

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
        <Route
          path="biblioteca"
          element={
            <ComingSoonPage
              title="Biblioteca"
              step={4}
              text="Leitor de PDF, EPUB e MOBI com progresso, destaques e pastas."
            />
          }
        />
        <Route
          path="projetos"
          element={
            <ComingSoonPage
              title="Projetos"
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
              step={7}
              text="Cronogramas, tópicos de estudo e exercícios com gabarito gerados pela IA."
            />
          }
        />
      </Route>
    </Routes>
  )
}

export default App
