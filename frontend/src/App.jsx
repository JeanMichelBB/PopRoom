import { useState } from 'react'
import JoinScreen from './components/JoinScreen'
import GameCanvas from './components/GameCanvas'

const STORAGE_KEY = 'poproom_name'

export default function App() {
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem(STORAGE_KEY) || null
  )

  const handleJoin = (name) => {
    localStorage.setItem(STORAGE_KEY, name)
    setPlayerName(name)
  }

  if (!playerName) {
    return <JoinScreen onJoin={handleJoin} savedName={localStorage.getItem(STORAGE_KEY) || ''} />
  }

  return <GameCanvas playerName={playerName} />
}
