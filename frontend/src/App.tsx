import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './features/auth/LoginPage'
import { RequireAdmin, RequireAuth } from './features/auth/RequireAuth'
import { ClientsPage } from './features/clients/ClientsPage'
import { MembersPage } from './features/members/MembersPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { ProjectsPage } from './features/projects/ProjectsPage'
import { TagsPage } from './features/tags/TagsPage'
import { TimerPage } from './features/timer/TimerPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/timer" element={<TimerPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/members" element={<MembersPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/timer" replace />} />
    </Routes>
  )
}
