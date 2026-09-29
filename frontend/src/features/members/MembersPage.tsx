import { useState, type FormEvent } from 'react'
import type { Role, User } from '../../api/types'
import { Button } from '../../components/Button'
import { Checkbox, ErrorMessage, Field, Select, TextInput } from '../../components/Field'
import { PlusIcon } from '../../components/icons'
import { Modal } from '../../components/Modal'
import { PageHeader } from '../../components/PageHeader'
import { StatusBadge, Table } from '../../components/Table'
import { useCreateMember, useMembers, useResetMemberPassword, useUpdateMember } from './useMembers'

type EditorState = { member: User | null } | null

export function MembersPage() {
  const { data: members = [] } = useMembers()
  const [editor, setEditor] = useState<EditorState>(null)

  return (
    <>
      <PageHeader
        title="Members"
        actions={
          <Button onClick={() => setEditor({ member: null })}>
            <PlusIcon /> New member
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-8">
        <Table headers={['Name', 'Email', 'Role', 'Status']}>
          {members.map((member) => (
            <tr key={member.id} className="cursor-pointer hover:bg-canvas/60" onClick={() => setEditor({ member })}>
              <td className="px-5 py-3 font-medium">{member.full_name}</td>
              <td className="px-5 py-3 text-ink-soft">{member.email}</td>
              <td className="px-5 py-3 capitalize">{member.role}</td>
              <td className="px-5 py-3">
                <StatusBadge active={member.is_active} inactiveLabel="Deactivated" />
              </td>
            </tr>
          ))}
        </Table>
      </div>
      {editor?.member === null && <NewMemberModal onClose={() => setEditor(null)} />}
      {editor?.member && <EditMemberModal member={editor.member} onClose={() => setEditor(null)} />}
    </>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Role)}>
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    </Select>
  )
}

function NewMemberModal({ onClose }: { onClose: () => void }) {
  const createMember = useCreateMember()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('member')

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    createMember.mutate({ email, full_name: fullName, password, role }, { onSuccess: onClose })
  }

  return (
    <Modal title="New member" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
        </Field>
        <Field label="Email">
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Initial password">
          <TextInput type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        <ErrorMessage error={createMember.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createMember.isPending}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function EditMemberModal({ member, onClose }: { member: User; onClose: () => void }) {
  const updateMember = useUpdateMember()
  const resetPassword = useResetMemberPassword()
  const [fullName, setFullName] = useState(member.full_name)
  const [role, setRole] = useState<Role>(member.role)
  const [isActive, setIsActive] = useState(member.is_active)
  const [newPassword, setNewPassword] = useState('')

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    await updateMember.mutateAsync({ id: member.id, input: { full_name: fullName, role, is_active: isActive } })
    if (newPassword) await resetPassword.mutateAsync({ id: member.id, password: newPassword })
    onClose()
  }

  return (
    <Modal title={`Edit ${member.full_name}`} onClose={onClose}>
      <form onSubmit={(event) => void handleSubmit(event).catch(() => undefined)} className="space-y-4">
        <Field label="Full name">
          <TextInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Email">
          <TextInput value={member.email} disabled />
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
        </Field>
        <Field label="Reset password (optional)">
          <TextInput
            type="password"
            autoComplete="new-password"
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Leave empty to keep current"
          />
        </Field>
        <Checkbox label="Active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <ErrorMessage error={updateMember.error ?? resetPassword.error} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateMember.isPending || resetPassword.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
