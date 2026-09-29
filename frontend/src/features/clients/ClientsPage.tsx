import { useState, type FormEvent } from 'react'
import type { Client } from '../../api/types'
import { Button } from '../../components/Button'
import { Checkbox, ErrorMessage, Field, TextInput } from '../../components/Field'
import { PlusIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge, Table } from '../../components/Table'
import { useCurrentUser } from '../auth/useAuth'
import { useProjects } from '../projects/useProjects'
import { useClients, useSaveClient } from './useClients'

type EditorState = { client: Client | null } | null

export function ClientsPage() {
  const user = useCurrentUser()
  const isAdmin = user.role === 'admin'
  const { data: clients = [], isPending } = useClients()
  const { data: projects = [] } = useProjects()
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<EditorState>(null)

  const visible = clients.filter((client) => showArchived || !client.is_archived)
  const projectCount = (clientId: string) => projects.filter((project) => project.client_id === clientId && !project.is_archived).length

  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <>
            <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {isAdmin && (
              <Button onClick={() => setEditor({ client: null })}>
                <PlusIcon /> New client
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-8">
        <Table headers={['Client', 'Active projects', 'Status']}>
          {visible.map((client) => (
            <tr
              key={client.id}
              className={isAdmin ? 'cursor-pointer hover:bg-canvas/60' : ''}
              onClick={() => isAdmin && setEditor({ client })}
            >
              <td className="px-5 py-3 font-medium">{client.name}</td>
              <td className="px-5 py-3 text-ink-soft">{projectCount(client.id)}</td>
              <td className="px-5 py-3">
                <StatusBadge active={!client.is_archived} />
              </td>
            </tr>
          ))}
          {!isPending && visible.length === 0 && (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-muted">
                No clients yet.
              </td>
            </tr>
          )}
        </Table>
      </div>
      {editor && <ClientEditor client={editor.client} onClose={() => setEditor(null)} />}
    </>
  )
}

function ClientEditor({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const saveClient = useSaveClient()
  const [name, setName] = useState(client?.name ?? '')
  const [isArchived, setIsArchived] = useState(client?.is_archived ?? false)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveClient.mutate({ id: client?.id ?? null, input: { name, is_archived: isArchived } }, { onSuccess: onClose })
  }

  return (
    <Modal title={client ? 'Edit client' : 'New client'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        {client && <Checkbox label="Archived" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} />}
        <ErrorMessage error={saveClient.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveClient.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
