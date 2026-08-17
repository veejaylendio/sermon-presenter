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
          padding: '0.75rem',
          color: 'var(--danger)',
          borderColor: 'transparent',
          background: 'transparent'
        }}
        title="Delete Sermon"
        onClick={(e) => {
          if (!confirm('Are you sure you want to delete this sermon and all associated presentation files?')) {
            e.preventDefault()
          }
        }}
      >
        🗑️
      </button>
    </form>
  )
}
