import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Edit, KeyRound, Loader2, LucideIcon, Plus, RefreshCw, Search, ShieldCheck, UserRoundX, Users } from 'lucide-react';
import { AxiosError } from 'axios';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateManagedUser,
  useDeactivateManagedUser,
  useManagedUsers,
  useSetManagedUserPassword,
  useUpdateManagedUser,
} from '@/hooks/useMetering';
import type { ManagedUser, ManagedUserPayload, MeteringUserRole } from '@/types/api';

type UserFormState = {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  role: MeteringUserRole;
  phone_number: string;
  profile_notes: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
};

type AccessFilter = 'all' | 'active' | 'inactive' | 'staff' | 'superuser';

const roleOptions: Array<{ value: MeteringUserRole; label: string }> = [
  { value: 'PRODUCTION_SUPERVISOR', label: 'Production Supervisor' },
  { value: 'PUMP_OPERATOR', label: 'Pump Operator' },
  { value: 'ZONAL_OFFICER', label: 'Zonal Officer' },
  { value: 'PLUMBER', label: 'Plumber' },
];

const emptyForm: UserFormState = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  password: '',
  role: 'PUMP_OPERATOR',
  phone_number: '',
  profile_notes: '',
  is_active: true,
  is_staff: false,
  is_superuser: false,
};

function userToForm(user: ManagedUser): UserFormState {
  return {
    username: user.username,
    email: user.email || '',
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    password: '',
    role: user.profile?.role || 'PUMP_OPERATOR',
    phone_number: user.profile?.phone_number || '',
    profile_notes: user.profile?.notes || '',
    is_active: user.is_active,
    is_staff: user.is_staff,
    is_superuser: user.is_superuser,
  };
}

function errorDetail(error: unknown) {
  const axiosError = error as AxiosError<Record<string, unknown> | string>;
  const data = axiosError.response?.data;

  if (!data) {
    return 'Check the server connection and try again.';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (typeof data.detail === 'string') {
    return data.detail;
  }

  return Object.entries(data)
    .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' | ');
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Never';
  }

  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function roleLabel(role?: MeteringUserRole) {
  return roleOptions.find(option => option.value === role)?.label || 'No profile';
}

export default function UserManagement() {
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [password, setPassword] = useState('');
  const [form, setForm] = useState<UserFormState>(emptyForm);

  const params = useMemo(() => {
    const next: Record<string, string | boolean | number> = {
      ordering: 'username',
      page_size: 100,
    };

    if (submittedSearch.trim()) {
      next.search = submittedSearch.trim();
    }

    if (accessFilter === 'active') next.is_active = true;
    if (accessFilter === 'inactive') next.is_active = false;
    if (accessFilter === 'staff') next.is_staff = true;
    if (accessFilter === 'superuser') next.is_superuser = true;

    return next;
  }, [accessFilter, submittedSearch]);

  const { data, isLoading, isFetching, refetch } = useManagedUsers(params);
  const createUser = useCreateManagedUser();
  const updateUser = useUpdateManagedUser();
  const deactivateUser = useDeactivateManagedUser();
  const setUserPassword = useSetManagedUserPassword();

  const users = data?.results || [];
  const activeCount = users.filter(user => user.is_active).length;
  const staffCount = users.filter(user => user.is_staff).length;
  const superuserCount = users.filter(user => user.is_superuser).length;

  useEffect(() => {
    if (!formOpen) {
      setEditingUser(null);
      setForm(emptyForm);
    }
  }, [formOpen]);

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setEditingUser(user);
    setForm(userToForm(user));
    setFormOpen(true);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedSearch(search);
  };

  const buildPayload = (): ManagedUserPayload => ({
    username: form.username.trim(),
    email: form.email.trim(),
    first_name: form.first_name.trim(),
    last_name: form.last_name.trim(),
    role: form.role,
    phone_number: form.phone_number.trim(),
    profile_notes: form.profile_notes.trim(),
    is_active: form.is_active,
    is_staff: form.is_staff,
    is_superuser: form.is_superuser,
    ...(form.password ? { password: form.password } : {}),
  });

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.username.trim()) {
      toast({ title: 'Username is required.', variant: 'destructive' });
      return;
    }

    if (!editingUser && !form.password) {
      toast({ title: 'Password is required for new users.', variant: 'destructive' });
      return;
    }

    try {
      if (editingUser) {
        await updateUser.mutateAsync({ id: editingUser.id, ...buildPayload() });
        toast({ title: 'User updated.' });
      } else {
        await createUser.mutateAsync(buildPayload());
        toast({ title: 'User created.' });
      }
      setFormOpen(false);
    } catch (error) {
      toast({
        title: editingUser ? 'User could not be updated.' : 'User could not be created.',
        description: errorDetail(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeactivate = async (user: ManagedUser) => {
    const confirmed = window.confirm(`Deactivate ${user.username}?`);
    if (!confirmed) {
      return;
    }

    try {
      await deactivateUser.mutateAsync(user.id);
      toast({ title: 'User deactivated.' });
    } catch (error) {
      toast({ title: 'User could not be deactivated.', description: errorDetail(error), variant: 'destructive' });
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordUser || !password) {
      toast({ title: 'Password is required.', variant: 'destructive' });
      return;
    }

    try {
      await setUserPassword.mutateAsync({ id: passwordUser.id, password });
      toast({ title: 'Password updated.' });
      setPassword('');
      setPasswordUser(null);
    } catch (error) {
      toast({ title: 'Password could not be updated.', description: errorDetail(error), variant: 'destructive' });
    }
  };

  const saving = createUser.isPending || updateUser.isPending;

  return (
    <div className="min-h-screen bg-gradient-surface">
      <div className="container space-y-6 py-6 md:py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Loaded users" value={data?.count ?? users.length} icon={Users} />
          <SummaryCard label="Active" value={activeCount} icon={ShieldCheck} />
          <SummaryCard label="Staff" value={staffCount} icon={ShieldCheck} />
          <SummaryCard label="Superusers" value={superuserCount} icon={ShieldCheck} />
        </div>

        <Card className="border-border/50 bg-card/80">
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-base">Users and Profiles</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Create users, assign field roles, and control account access.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New User
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row">
              <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search username, name, email, or phone"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="secondary">Search</Button>
              </form>
              <Select value={accessFilter} onValueChange={(value) => setAccessFilter(value as AccessFilter)}>
                <SelectTrigger className="w-full lg:w-[190px]">
                  <SelectValue placeholder="Access filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="staff">Staff users</SelectItem>
                  <SelectItem value="superuser">Superusers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Loading users
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      No users match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell className="min-w-[240px]">
                        <div className="font-medium">{user.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {user.username}{user.email ? ` | ${user.email}` : ''}
                        </div>
                        {user.profile?.phone_number ? (
                          <div className="text-xs text-muted-foreground">{user.profile.phone_number}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{roleLabel(user.profile?.role)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={user.is_active ? 'default' : 'secondary'}>
                            {user.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                          {user.is_staff ? <Badge variant="outline">Staff</Badge> : null}
                          {user.is_superuser ? <Badge variant="destructive">Superuser</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] text-sm text-muted-foreground">
                        {formatDateTime(user.last_login)}
                      </TableCell>
                      <TableCell className="min-w-[220px] text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(user)} className="gap-2">
                            <Edit className="h-4 w-4" />
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setPasswordUser(user)} className="gap-2">
                            <KeyRound className="h-4 w-4" />
                            Password
                          </Button>
                          {user.is_active ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeactivate(user)}
                              disabled={deactivateUser.isPending}
                              className="gap-2"
                            >
                              <UserRoundX className="h-4 w-4" />
                              Disable
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>
              Account access and the metering profile are saved together.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submitForm} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Username">
                <Input
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  required
                />
              </Field>
              <Field label={editingUser ? 'New password' : 'Password'}>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required={!editingUser}
                  placeholder={editingUser ? 'Leave blank to keep current' : ''}
                />
              </Field>
              <Field label="First name">
                <Input
                  value={form.first_name}
                  onChange={(event) => setForm({ ...form, first_name: event.target.value })}
                />
              </Field>
              <Field label="Last name">
                <Input
                  value={form.last_name}
                  onChange={(event) => setForm({ ...form, last_name: event.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone_number}
                  onChange={(event) => setForm({ ...form, phone_number: event.target.value })}
                />
              </Field>
              <Field label="Metering role">
                <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as MeteringUserRole })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Profile notes">
              <Textarea
                value={form.profile_notes}
                onChange={(event) => setForm({ ...form, profile_notes: event.target.value })}
                rows={3}
              />
            </Field>

            <div className="grid gap-3 rounded-md border border-border/70 p-4 md:grid-cols-3">
              <ToggleRow
                label="Active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <ToggleRow
                label="Staff access"
                checked={form.is_staff}
                onCheckedChange={(checked) => setForm({ ...form, is_staff: checked })}
              />
              <ToggleRow
                label="Superuser"
                checked={form.is_superuser}
                onCheckedChange={(checked) => setForm({ ...form, is_superuser: checked })}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!passwordUser} onOpenChange={(open) => !open && setPasswordUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-4">
            <Field label="New password">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPassword('');
                  setPasswordUser(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={setUserPassword.isPending} className="gap-2">
                {setUserPassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Update
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  );
}
