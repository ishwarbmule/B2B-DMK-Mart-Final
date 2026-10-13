"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { api, ModuleHeader } from "./ui-bits";
import { CrudModule, type FieldDef, type ColumnDef } from "./ui-bits";
import { StatusBadge } from "./ui-bits";

const ROLES = ["SUPER_ADMIN", "COMPANY_ADMIN", "STORE_MANAGER", "SALESMAN", "PRODUCT_PERSON", "DELIVERY_BOY", "CUSTOMER"];
const MODULES = [
  "Dashboard", "Website Settings", "Shop Settings", "Stores", "Products",
  "Coupons", "Price Slabs", "Zone & Pricing", "Ads", "Category", "Sales Person",
  "Companies", "Orders", "POS Billing", "Purchases", "Returns", "Sales Monitoring",
  "Delivery", "Sliders", "Customers", "Users & Roles",
];

const USER_FIELDS: FieldDef[] = [
  { key: "fullName", label: "Full Name", type: "text" },
  { key: "email", label: "Email Address", type: "text" },
  { key: "password", label: "Password", type: "text" },
  { key: "role", label: "Role", type: "select", options: ROLES, default: "COMPANY_ADMIN" },
  { key: "active", label: "Active", type: "toggle", default: true },
];
const USER_COLUMNS: ColumnDef[] = [
  { key: "fullName", label: "Name", render: (r) => <span className="font-semibold">{String(r.fullName)}</span> },
  { key: "email", label: "Email" },
  { key: "role", label: "Role", render: (r) => <StatusBadge status={String(r.role)} /> },
  { key: "active", label: "Active", render: (r) => (r.active ? "✅" : "—") },
];

export function UsersModule({ token }: { token: string }) {
  return (
    <CrudModule
      entity="users"
      title="Manage Users"
      sub="Backend portal accounts and their roles"
      token={token}
      nameField="fullName"
      fields={USER_FIELDS}
      columns={USER_COLUMNS}
    />
  );
}

interface RoleRow { id: string; fullName: string; role: string; permissions: string }

export function RolesModule({ token }: { token: string }) {
  const call = useMemo(() => api(token), [token]);
  const [users, setUsers] = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [perms, setPerms] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    call("/api/admin/crud/users").then((d) => {
      setUsers(d.rows || []);
      const map: Record<string, string[]> = {};
      for (const u of (d.rows || []) as RoleRow[]) {
        try { map[u.id] = JSON.parse(u.permissions || "[]"); } catch { map[u.id] = []; }
      }
      setPerms(map);
      if (d.rows?.length) setSelected(d.rows[0].id);
    }).catch(() => {});
  }, [call]);

  const user = users.find((u) => u.id === selected);
  const current = perms[selected] || [];

  const toggle = (m: string) => {
    setPerms((p) => {
      const cur = p[selected] || [];
      const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
      return { ...p, [selected]: next };
    });
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await call("/api/admin/crud/users", { method: "PATCH", body: JSON.stringify({ id: selected, permissions: JSON.stringify(perms[selected] || []) }) });
      toast.success(`Permissions saved for ${user.fullName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const isSuper = user?.role === "SUPER_ADMIN";

  return (
    <div>
      <ModuleHeader title="Role & Permission Management" sub="Module-level access per portal account">
        <button onClick={save} disabled={!user || saving || isSuper} className="flex items-center gap-1.5 rounded-lg bg-black px-3 py-2 text-xs font-bold text-yellow-400 disabled:opacity-50">
          <Save className="h-3.5 w-3.5" /> Save Permissions
        </button>
      </ModuleHeader>
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="rounded-xl border bg-white p-2">
          <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">Select User</p>
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => setSelected(u.id)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold ${selected === u.id ? "bg-yellow-100 text-black" : "text-gray-600 hover:bg-gray-50"}`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-yellow-600" />
              <span className="flex-1 truncate">{u.fullName}</span>
              <span className="text-[9px] text-gray-400">{u.role}</span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 text-sm font-black flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4" /> Permissions for {user?.fullName || "—"}
          </h3>
          {isSuper ? (
            <p className="rounded-lg bg-yellow-50 p-3 text-xs font-semibold text-yellow-800">
              Super Admin has unrestricted access to every module — permissions are not editable for this role.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {MODULES.map((m) => (
                <label key={m} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-2 text-xs font-medium">
                  <input type="checkbox" checked={current.includes(m)} onChange={() => toggle(m)} className="accent-yellow-500" />
                  {m}
                </label>
              ))}
            </div>
          )}
          {!user && <p className="text-xs text-gray-400">Create users in Manage Users first.</p>}
        </div>
      </div>
    </div>
  );
}
