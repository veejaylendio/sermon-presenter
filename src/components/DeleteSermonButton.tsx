'use client'

import { deleteSermon } from '@/app/sermons/actions'

interface DeleteSermonButtonProps {
  sermonId: string
}

export default function DeleteSermonButton({ sermonId }: DeleteSermonButtonProps) {
  return (
    <form action={deleteSermon.bind(null, sermonId)}>
      <button
        type="submit"
        className="btn btn-secondary"
        style={{
          width: '36px',
          height: '36px',
          padding: 0,
          color: 'var(--text-muted)',
          borderColor: 'transparent',
          background: 'transparent'
        }}
        title="Delete Sermon"
        onClick={(e) => {
          if (!confirm('Are you sure you want to delete this sermon and all associated presentation files?')) {
            e.preventDefault()
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--danger)'
          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
        </svg>
      </button>
    </form>
  )
}
