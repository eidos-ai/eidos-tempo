import { useState, type FormEvent } from 'react'
import type { Project, ProjectInput } from '../../api/types'
import { Button } from '../../components/Button'
import { Checkbox, ErrorMessage, Field, Select, TextInput } from '../../components/Field'
import { PlusIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge, Table } from '../../components/Table'
import { PROJECT_COLORS } from '../../lib/colors'
import { useCurrentUser } from '../auth/useAuth'
import { useClientLookup, useClients } from '../clients/useClients'
import { ProjectLabel } from './ProjectLabel'
import { useProjects, useSaveProject } from './useProjects'

type EditorState = { project: Project | null } | null

export function ProjectsPage() {
  const user = useCurrentUser()
  const isAdmin = user.role === 'admin'
  const { data: projects = [], isPending } = useProjects()
  const clients = useClientLookup()
  const [showArchived, setShowArchived] = useState(false)
  const [editor, setEditor] = useState<EditorState>(null)

  const visible = projects.filter((project) => showArchived || !project.is_archived)

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          <>
            <Checkbox label="Show archived" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            {isAdmin && (
              <Button onClick={() => setEditor({ project: null })}>
                <PlusIcon /> New project
              </Button>
            )}
          </>
        }
      />
      <div className="flex-1 overflow-y-auto p-8">
        <Table headers={['Project', 'Client', 'Billable', 'Status']}>
          {visible.map((project) => (
            <tr
              key={project.id}
              className={isAdmin ? 'cursor-pointer hover:bg-canvas/60' : ''}
              onClick={() => isAdmin && setEditor({ project })}
            >
              <td className="px-5 py-3">
                <ProjectLabel project={project} showClient={false} />
              </td>
              <td className="px-5 py-3 text-ink-soft">
                {project.client_id ? clients.get(project.client_id)?.name : '—'}
              </td>
              <td className="px-5 py-3">{project.is_billable ? <span className="font-semibold text-primary">$ Billable</span> : <span className="text-muted">—</span>}</td>
              <td className="px-5 py-3">
                <StatusBadge active={!project.is_archived} />
              </td>
            </tr>
          ))}
          {!isPending && visible.length === 0 && (
            <tr>
              <td colSpan={4} className="px-5 py-8 text-center text-muted">
                No projects yet.
              </td>
            </tr>
          )}
        </Table>
      </div>
      {editor && <ProjectEditor project={editor.project} onClose={() => setEditor(null)} />}
    </>
  )
}

function ProjectEditor({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const { data: clients = [] } = useClients()
  const saveProject = useSaveProject()
  const [form, setForm] = useState<ProjectInput>(
    project ?? { name: '', color: PROJECT_COLORS[0], client_id: null, is_billable: true, is_archived: false },
  )

  const update = <K extends keyof ProjectInput>(key: K, value: ProjectInput[K]) => setForm((current) => ({ ...current, [key]: value }))

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    saveProject.mutate({ id: project?.id ?? null, input: form }, { onSuccess: onClose })
  }

  return (
    <Modal title={project ? 'Edit project' : 'New project'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name">
          <TextInput value={form.name} onChange={(e) => update('name', e.target.value)} required autoFocus />
        </Field>
        <Field label="Client">
          <Select value={form.client_id ?? ''} onChange={(e) => update('client_id', e.target.value || null)}>
            <option value="">No client</option>
            {clients
              .filter((client) => !client.is_archived || client.id === form.client_id)
              .map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Color</span>
          <div className="flex flex-wrap gap-2">
            {PROJECT_COLORS.map((color) => (
              <button
                type="button"
                key={color}
                aria-label={`Color ${color}`}
                onClick={() => update('color', color)}
                className={`size-6 rounded-full border border-line-strong ring-offset-2 ring-offset-surface${form.color === color ? 'ring-2 ring-ink' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <Checkbox label="Billable" checked={form.is_billable} onChange={(e) => update('is_billable', e.target.checked)} />
        {project && <Checkbox label="Archived" checked={form.is_archived} onChange={(e) => update('is_archived', e.target.checked)} />}
        <ErrorMessage error={saveProject.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saveProject.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
