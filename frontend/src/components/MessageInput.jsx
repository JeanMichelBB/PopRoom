import { useState } from 'react'

export default function MessageInput({ onSend }) {
  const [text, setText] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = text.trim()
    if (trimmed) {
      onSend(trimmed)
      setText('')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 8, alignItems: 'center',
        background: '#0a0a0a', padding: '10px 14px',
        border: '3px solid #2a2a2a',
      }}
    >
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="send a balloon..."
        maxLength={80}
        style={{
          background: 'transparent', border: 'none',
          color: '#fff', fontFamily: '"Press Start 2P", monospace', fontSize: 9,
          outline: 'none', width: 230,
        }}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        style={{
          background: 'transparent',
          border: `3px solid ${text.trim() ? '#ffffff' : '#2a2a2a'}`,
          color: text.trim() ? '#fff' : '#333',
          fontFamily: '"Press Start 2P", monospace', fontSize: 8,
          padding: '6px 12px', borderRadius: 0, cursor: 'pointer',
        }}
      >
        SEND
      </button>
    </form>
  )
}
