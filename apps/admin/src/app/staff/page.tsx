import { ActionForm } from '@/components/action-form';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, Td, Th } from '@/components/ui/table';
import { requireAdmin } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { inviteStaff, revokeInvite, setAdmin, setAssignment } from './actions';

export default async function StaffPage() {
  const viewer = await requireAdmin();
  const supabase = await supabaseServer();
  const [{ data: events }, { data: invites }, { data: assignments }, { data: admins }] = await Promise.all([
    supabase.from('events').select('id, name').order('starts_at', { ascending: false }),
    supabase.from('staff_invites').select('*').is('accepted_at', null).order('created_at', { ascending: false }),
    supabase.from('staff_assignments').select('user_id, event_id, role'),
    supabase.from('profiles').select('id').eq('is_admin', true),
  ]);

  const userIds = [...new Set([...(assignments ?? []).map((a) => a.user_id), ...(admins ?? []).map((a) => a.id)])];
  const { data: people } = userIds.length
    ? await supabase.from('profiles').select('id, email, display_name, is_admin').in('id', userIds).order('email')
    : { data: [] as { id: string; email: string; display_name: string | null; is_admin: boolean }[] };
  const eventName = new Map((events ?? []).map((e) => [e.id, e.name]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Staff</h1>

      <Card
        title="Invite someone"
        description="No email is sent. Once saved, send them the dashboard link (managers) or the staff app; access applies when they sign in with this email."
      >
        <ActionForm action={inviteStaff} submitLabel="Save invite" inline>
          <Field label="Email" className="min-w-64 flex-1">
            <Input type="email" name="email" required placeholder="name@example.com" />
          </Field>
          <Field label="Access" className="min-w-64 flex-1">
            <Select name="access" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {(events ?? []).map((e) => (
                <optgroup key={e.id} label={e.name}>
                  <option value={`${e.id}:staff`}>Door / perks staff</option>
                  <option value={`${e.id}:manager`}>Manager</option>
                </optgroup>
              ))}
              <option value="admin">Admin (all events)</option>
            </Select>
          </Field>
        </ActionForm>
      </Card>

      <Card title="Pending invites">
        {(invites ?? []).length === 0 ? (
          <p className="text-sm text-zinc-600">None.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Access</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(invites ?? []).map((i) => (
                <tr key={i.id}>
                  <Td>{i.email}</Td>
                  <Td>{i.make_admin ? 'Admin' : `${i.role === 'manager' ? 'Manager' : 'Staff'} · ${eventName.get(i.event_id!) ?? 'Event'}`}</Td>
                  <Td className="text-right">
                    <ActionForm action={revokeInvite.bind(null, i.id)} submitLabel="Revoke" submitVariant="ghost" inline />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Team">
        {(people ?? []).length === 0 ? (
          <p className="text-sm text-zinc-600">No one yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(people ?? []).map((p) => {
              const own = (assignments ?? []).filter((a) => a.user_id === p.id);
              return (
                <li key={p.id} className="space-y-2 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.display_name ?? p.email}</span>
                    {p.display_name ? <span className="text-sm text-zinc-500">{p.email}</span> : null}
                    {p.is_admin ? <Badge tone="blue">Admin</Badge> : null}
                    <div className="ml-auto">
                      {p.id === viewer.userId ? (
                        <span className="text-xs text-zinc-500">You</span>
                      ) : (
                        <ActionForm
                          action={setAdmin.bind(null, p.id, !p.is_admin)}
                          submitLabel={p.is_admin ? 'Remove admin' : 'Make admin'}
                          submitVariant="ghost"
                          confirm={p.is_admin ? `Remove admin rights from ${p.email}?` : `Give ${p.email} admin rights to every event?`}
                          inline
                        />
                      )}
                    </div>
                  </div>
                  {own.map((a) => (
                    <ActionForm
                      key={a.event_id}
                      action={setAssignment.bind(null, p.id, a.event_id)}
                      submitLabel="Update"
                      submitVariant="secondary"
                      inline
                    >
                      <span className="min-w-48 self-center text-sm text-zinc-700">{eventName.get(a.event_id) ?? 'Event'}</span>
                      <Select name="role" defaultValue={a.role} className="w-48" aria-label="Role">
                        <option value="staff">Door / perks staff</option>
                        <option value="manager">Manager</option>
                        <option value="remove">Remove from event</option>
                      </Select>
                    </ActionForm>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
