import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AccountPage } from './pages/AccountPage'
import { CreateHotPotato } from './pages/CreateHotPotato'
import { CreateScorecard } from './pages/CreateScorecard'
import { GamesHub } from './pages/GamesHub'
import { Home } from './pages/Home'
import { JoinRoom } from './pages/JoinRoom'
import { RoomPage } from './pages/RoomPage'
import { ScorecardsHub } from './pages/ScorecardsHub'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/Family-Games">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/games" element={<GamesHub />} />
          <Route path="/games/hot-potato/create" element={<CreateHotPotato />} />
          <Route path="/scorecards" element={<ScorecardsHub />} />
          <Route path="/scorecards/:templateId/create" element={<CreateScorecard />} />
          <Route path="/join/:code" element={<JoinRoom />} />
          <Route path="/room/:code" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
