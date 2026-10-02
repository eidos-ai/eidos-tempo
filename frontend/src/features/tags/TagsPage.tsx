import { useState, type FormEvent } from 'react'
import type { Tag } from '../../api/types'
import { Button } from '../../components/Button'
import { Checkbox, CONTROL_CLASSES, ErrorMessage, Field, TextInput } from '../../components/Field'
import { PlusIcon, SearchIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge, Table } from '../../components/Table'
import { useCurrentUser } from '../auth/useAuth'
import { useSaveTag, useTags } from './useTags'

type EditorState = { tag: Tag | null } | null

export function TagsPage() {
  const user = useCurrentUser()
  const isAdmin = user.role === 'admin'
  const { data: tags = [], isPending } = useTags()
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<EditorState>(null)

  const query = search.trim().toLowerCase()
  const visible = tags
    .filter((tag) => (showArchived || !tag.is_archived) && tag.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }))

  return (
    <>
      <PageHeader
        title="Tags"
        actions={
          <>
            <label className="relative w-56">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">
                <SearchIcon />
              </span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tags…"
                aria-label="Search tags"
                className={`${CONTROL_CLASSES} pl-9`}
              />
            </label>
            <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <Button onClick={() => setEditor({ tag: null })}>
              <PlusIcon /> New tag
            </Button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-8">
        <Table headers={['Tag', 'Status']}>
          {visible.map((tag) => (
            <tr
              key={tag.id}
              className={isAdmin ? 'cursor-pointer hover:bg-canvas/60' : ''}
              onClick={() => isAdmin && setEditor({ tag })}
            >
              <td className="px-5 py-3 font-medium">{tag.name}</td>
              <td className="px-5 py-3">
                <StatusBadge active={!tag.is_archived} />
              </td>
            </tr>
          ))}
          {!isPending && visible.length === 0 && (
            <tr>
              <td colSpan={2} className="px-5 py-8 text-center text-muted">
                {query ? 'No tags match your search.' : 'No tags yet.'}
              </td>
            </tr>
          )}
        </Table>
      </div>
      {editor && <TagEditor tag={editor.tag} onClose={() => setEditor(null)} />}
    </>
  )
}

function TagEditor({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const saveTag = useSaveTag()
  const [name, setName] = useState(tag?.name ?? '')
  const [isArchived, setIsArchived] = useState(tag?.is_archived ?? false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveTag.mutate({ id: tag?.id ?? null, input: { name, is_archived: isArchived } }, { onSuccess: onClose })
  }

  return (
    <Modal title={tag ? 'Edit tag' : 'New tag'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
        </Field>
        {tag && <Checkbox label="Archived" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />}
        <ErrorMessage error={saveTag.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveTag.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
