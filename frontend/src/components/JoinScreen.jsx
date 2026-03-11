import { useState } from 'react'

export default function JoinScreen({ onJoin, savedName = '' }) {
  const [name, setName] = useState(savedName)

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onJoin(trimmed)
  }

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <form onSubmit={handleSubmit} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
      }}>
        <h1 style={{
          color: '#fff', fontFamily: '"Press Start 2P", monospace', fontSize: 20,
          letterSpacing: 4, imageRendering: 'pixelated',
        }}>
          PopRoom
        </h1>
        <p style={{ color: '#444', fontFamily: '"Press Start 2P", monospace', fontSize: 7, lineHeight: 2 }}>
          enter the room. pop some balloons.
        </p>
        <input
          type="text"
          placeholder="your name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={20}
          autoFocus
          style={{
            background: '#111', border: '3px solid #2a2a2a',
            color: '#fff', padding: '12px 18px',
            fontFamily: '"Press Start 2P", monospace', fontSize: 11,
            borderRadius: 0, outline: 'none', width: 240,
            textAlign: 'center',
          }}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          style={{
            background: name.trim() ? '#fff' : '#1a1a1a',
            color: name.trim() ? '#000' : '#444',
            border: '3px solid', borderColor: name.trim() ? '#fff' : '#333',
            padding: '12px 36px',
            fontFamily: '"Press Start 2P", monospace', fontSize: 10,
            borderRadius: 0, cursor: name.trim() ? 'pointer' : 'default',
            letterSpacing: 2,
          }}
        >
          JOIN
        </button>
      </form>
    </div>
  )
}
