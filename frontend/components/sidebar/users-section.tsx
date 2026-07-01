"use client";
import { useState } from "react";
import { Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useInviteUser,
  useRemoveMember,
  useUpdateMemberRole,
  useUsers,
} from "@/lib/hooks/use-workspace";
import { cn, errMsg } from "@/lib/utils";
import { PanelHeader, type DragSectionProps } from "./shared";

type UsersSectionProps = DragSectionProps & {
  dark: boolean;
  projectId: number;
  confirm: (msg: string, cb: () => void) => void;
};

export function UsersSection({ dark, projectId: _projectId, confirm, shellClass, dragHandlers, onDragStart }: UsersSectionProps) {
  const [usersOpen, setUsersOpen] = useState(false);
  const [inviteValue, setInviteValue] = useState("");
  const [roleId, setRoleId] = useState<number | null>(null);
  const [editingMemberRole, setEditingMemberRole] = useState<number | null>(null);
  const [memberRoleValue, setMemberRoleValue] = useState<number>(0);

  const users = useUsers();
  const invite = useInviteUser();
  const removeMember = useRemoveMember();
  const updateMemberRole = useUpdateMemberRole();

  const memberCount = users.data?.memberships.length ?? 0;
  const defaultRoleId = roleId ?? users.data?.roles[0]?.id ?? 0;

  const sectionBorderClass = dark ? "border-neutral-800" : "border-slate-300";
  const expandedPanelClass = dark ? "bg-[#20232b]" : "bg-white";
  const subduedTextClass = dark ? "text-neutral-500" : "text-slate-500";
  const strongTextClass = dark ? "text-white" : "text-slate-950";

  return (
    <div {...(dragHandlers ?? {})} className={shellClass}>
      <section className={cn("border-b", sectionBorderClass)}>
        <PanelHeader
          icon={<Users className="size-4" />}
          title="Users & Roles"
          badge={`${memberCount}`}
          open={usersOpen}
          onClick={() => setUsersOpen(!usersOpen)}
          onDragStart={onDragStart}
        />
        {usersOpen ? (
          <div className={cn("space-y-3 p-3 text-sm", expandedPanelClass)}>
            {users.data?.memberships.map((member) => (
              <div key={member.id} className="border-b border-neutral-700 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={cn("font-semibold", strongTextClass)}>{member.full_name || member.username || member.email}</div>
                    <div className={cn("text-xs", subduedTextClass)}>{member.email}</div>
                  </div>
                  {!member.is_owner ? (
                    <button
                      className="shrink-0 rounded text-red-400 hover:text-red-300"
                      title="Remove member"
                      onClick={() =>
                        confirm(
                          `Remove ${member.full_name || member.username} from project?`,
                          () => removeMember.mutate(member.id, {
                            onSuccess: () => toast.success(`${member.full_name || member.username} removed`),
                            onError: () => toast.error("Failed to remove member"),
                          }),
                        )
                      }
                    >
                      <Trash2 className="size-3" />
                    </button>
                  ) : null}
                </div>
                {editingMemberRole === member.id ? (
                  <div className="mt-2 flex gap-2">
                    <select
                      className="h-7 flex-1 rounded border border-neutral-600 bg-neutral-950 px-2 text-xs text-white"
                      value={memberRoleValue || member.role || 0}
                      onChange={(e) => setMemberRoleValue(Number(e.target.value))}
                    >
                      {users.data?.roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button
                      className="rounded bg-violet-700 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={updateMemberRole.isPending}
                      onClick={() => updateMemberRole.mutate(
                        { membershipId: member.id, roleId: memberRoleValue || member.role || 0 },
                        { onSuccess: () => setEditingMemberRole(null) },
                      )}
                    >
                      {updateMemberRole.isPending ? "Saving…" : "Save"}
                    </button>
                    <button className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300" onClick={() => setEditingMemberRole(null)}>
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    className="mt-1 inline-block rounded border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400 transition-colors hover:border-violet-500/60 hover:bg-violet-500/20"
                    onClick={() => { setEditingMemberRole(member.id); setMemberRoleValue(member.role ?? 0); }}
                  >
                    {member.role_name || "Member"}
                  </button>
                )}
              </div>
            ))}
            <div className="space-y-2">
              <div className={cn("font-semibold", strongTextClass)}>Invite member</div>
              <input
                value={inviteValue}
                onChange={(e) => setInviteValue(e.target.value)}
                className="h-8 w-full rounded border border-violet-700 bg-neutral-950 px-2 text-sm text-white"
                placeholder="Username or email"
              />
              <select
                value={defaultRoleId}
                onChange={(e) => setRoleId(Number(e.target.value))}
                className="h-8 w-full rounded border border-neutral-600 bg-neutral-950 px-2 text-sm text-white"
              >
                <option value={0}>Role</option>
                {users.data?.roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                className="h-8 w-full rounded bg-violet-600 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
                disabled={!inviteValue.trim() || !defaultRoleId || invite.isPending}
                onClick={() => invite.mutate(
                  { usernameOrEmail: inviteValue, roleId: defaultRoleId },
                  {
                    onSuccess: () => { toast.success(`Invite sent to ${inviteValue}`); setInviteValue(""); },
                    onError: (err) => toast.error(errMsg(err)),
                  },
                )}
              >
                Send invite
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
