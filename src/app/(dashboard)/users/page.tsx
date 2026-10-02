"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus, Shield, User as UserIcon, Loader2,
  Pencil, Trash2, X, KeyRound, ShieldCheck, ShieldOff,
  AlertTriangle,
} from 'lucide-react';

interface User {
  id: number;
  username: string;
  role: string;
  created_at: string;
}

type ModalMode = 'create' | 'edit' | 'delete' | null;

const ROLES: Record<string, { label: string; badge: string }> = {
  admin: {
    label: 'Administrador',
    badge: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  },
  uploader: {
    label: 'Uploader',
    badge: 'bg-neutral-800 text-neutral-300 border border-neutral-700',
  },
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [mode, setMode] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<User | null>(null);

  // Create form
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'uploader' });

  // Edit form
  const [editForm, setEditForm] = useState({ role: 'uploader', password: '', confirmPassword: '' });

  const [submitLoading, setSubmitLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const openCreate = () => {
    setCreateForm({ username: '', password: '', role: 'uploader' });
    setFormError('');
    setMode('create');
  };

  const openEdit = (user: User) => {
    setSelected(user);
    setEditForm({ role: user.role, password: '', confirmPassword: '' });
    setFormError('');
    setMode('edit');
  };

  const openDelete = (user: User) => {
    setSelected(user);
    setMode('delete');
  };

  const closeModal = () => {
    setMode(null);
    setSelected(null);
    setFormError('');
  };

  // ─── Create ───────────────────────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (createForm.password.length < 6) {
      setFormError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      const data = await res.json();
      if (res.ok) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Erro ao criar usuário.');
      }
    } catch {
      setFormError('Erro ao conectar com o servidor.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ─── Edit ─────────────────────────────────────────────────────────────────

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      setFormError('As senhas não coincidem.');
      return;
    }
    if (editForm.password && editForm.password.length < 6) {
      setFormError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    setSubmitLoading(true);
    try {
      const body: Record<string, string> = { role: editForm.role };
      if (editForm.password) body.password = editForm.password;

      const res = await fetch(`/api/users/${selected!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Erro ao atualizar usuário.');
      }
    } catch {
      setFormError('Erro ao conectar com o servidor.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ─── Delete ───────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setSubmitLoading(true);
    try {
      const res = await fetch(`/api/users/${selected!.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        closeModal();
        fetchUsers();
      } else {
        setFormError(data.error || 'Erro ao excluir usuário.');
      }
    } catch {
      setFormError('Erro ao conectar com o servidor.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Equipe</h1>
          <p className="text-neutral-400 mt-1">Gerencie os acessos ao painel da rádio</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-5 h-5" />
          Novo Usuário
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-neutral-800/50 border-b border-neutral-800">
              <tr>
                <th className="p-4 font-medium text-neutral-300">Usuário</th>
                <th className="p-4 font-medium text-neutral-300">Cargo</th>
                <th className="p-4 font-medium text-neutral-300">Criado em</th>
                <th className="p-4 font-medium text-neutral-300 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {users.map((user) => {
                const roleInfo = ROLES[user.role] ?? ROLES.uploader;
                return (
                  <tr key={user.id} className="hover:bg-neutral-800/20 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0">
                          {user.role === 'admin'
                            ? <Shield className="w-4 h-4 text-purple-400" />
                            : <UserIcon className="w-4 h-4 text-neutral-400" />
                          }
                        </div>
                        <span className="text-white font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.badge}`}>
                        {user.role === 'admin' && <ShieldCheck className="w-3 h-3" />}
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="p-4 text-neutral-400 text-sm">
                      {new Date(user.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 justify-end opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(user)}
                          title="Editar usuário"
                          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openDelete(user)}
                          title="Excluir usuário"
                          className="p-1.5 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-neutral-500">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal backdrop ─────────────────────────────────────────────────── */}
      {mode && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md shadow-2xl">

            {/* ── CREATE modal ─────────────────────────────────────────────── */}
            {mode === 'create' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-purple-400" /> Novo Usuário
                  </h2>
                  <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {formError && <ErrorBanner message={formError} />}

                <form onSubmit={handleCreate} className="space-y-4">
                  <Field label="Nome de Usuário">
                    <input
                      type="text" required autoFocus
                      value={createForm.username}
                      onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                      className={inputClass}
                      placeholder="ex: joao.silva"
                    />
                  </Field>
                  <Field label="Senha provisória">
                    <input
                      type="password" required
                      value={createForm.password}
                      onChange={e => setCreateForm({ ...createForm, password: e.target.value })}
                      className={inputClass}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </Field>
                  <Field label="Cargo">
                    <RoleSelect value={createForm.role} onChange={r => setCreateForm({ ...createForm, role: r })} />
                  </Field>
                  <ModalFooter onCancel={closeModal} loading={submitLoading} label="Criar Usuário" />
                </form>
              </div>
            )}

            {/* ── EDIT modal ───────────────────────────────────────────────── */}
            {mode === 'edit' && selected && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Pencil className="w-5 h-5 text-purple-400" /> Editar Usuário
                    </h2>
                    <p className="text-sm text-neutral-500 mt-0.5">@{selected.username}</p>
                  </div>
                  <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {formError && <ErrorBanner message={formError} />}

                <form onSubmit={handleEdit} className="space-y-4">
                  <Field label="Cargo">
                    <RoleSelect value={editForm.role} onChange={r => setEditForm({ ...editForm, role: r })} />
                  </Field>

                  <div className="border-t border-neutral-800 pt-4">
                    <p className="text-xs text-neutral-500 flex items-center gap-1.5 mb-3">
                      <KeyRound className="w-3.5 h-3.5" /> Alterar senha (deixe em branco para manter a atual)
                    </p>
                    <div className="space-y-3">
                      <Field label="Nova senha">
                        <input
                          type="password"
                          value={editForm.password}
                          onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                          className={inputClass}
                          placeholder="Mínimo 6 caracteres"
                        />
                      </Field>
                      <Field label="Confirmar nova senha">
                        <input
                          type="password"
                          value={editForm.confirmPassword}
                          onChange={e => setEditForm({ ...editForm, confirmPassword: e.target.value })}
                          className={inputClass}
                          placeholder="Repita a senha"
                        />
                      </Field>
                    </div>
                  </div>

                  <ModalFooter onCancel={closeModal} loading={submitLoading} label="Salvar Alterações" />
                </form>
              </div>
            )}

            {/* ── DELETE modal ─────────────────────────────────────────────── */}
            {mode === 'delete' && selected && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-400" /> Excluir Usuário
                  </h2>
                  <button onClick={closeModal} className="text-neutral-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 flex gap-3 mb-5">
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-300 font-medium">Esta ação é irreversível.</p>
                    <p className="text-sm text-neutral-400 mt-1">
                      O usuário <span className="font-bold text-white">@{selected.username}</span> será removido permanentemente do sistema.
                    </p>
                  </div>
                </div>

                {formError && <ErrorBanner message={formError} />}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-neutral-400 hover:text-white transition-colors font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitLoading}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-60"
                  >
                    {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Confirmar Exclusão
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

const inputClass =
  'w-full bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { value: 'uploader', label: 'Uploader', desc: 'Apenas envia músicas', Icon: UserIcon },
        { value: 'admin', label: 'Admin', desc: 'Controle total', Icon: ShieldOff },
      ].map(({ value: v, label, desc, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
            value === v
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-neutral-700 bg-neutral-950 hover:border-neutral-600'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${value === v ? 'text-purple-400' : 'text-neutral-500'}`} />
            <span className={`text-sm font-semibold ${value === v ? 'text-white' : 'text-neutral-300'}`}>{label}</span>
          </div>
          <span className="text-xs text-neutral-500">{desc}</span>
        </button>
      ))}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-3 py-2.5 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function ModalFooter({ onCancel, loading, label }: { onCancel: () => void; loading: boolean; label: string }) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-neutral-400 hover:text-white transition-colors font-medium"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-60"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}
