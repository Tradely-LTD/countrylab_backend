// ─── Permission catalog ───────────────────────────────────────────────────────
// A permission is "<module>.<action>". Admins toggle these per role from
// Settings → Roles & Permissions; the defaults below reproduce the access each
// built-in role had before permissions became configurable.

export const PERMISSION_CATALOG = [
  {
    module: "dashboard",
    label: "Dashboard",
    actions: { view: "View", revenue: "See revenue" },
  },
  {
    module: "sample_requests",
    label: "Sample Requests",
    actions: {
      view: "View",
      update: "Update / quote",
      approve: "Approve",
      convert: "Convert to sample",
    },
  },
  {
    module: "samples",
    label: "Samples",
    actions: {
      view: "View",
      create: "Register",
      update: "Edit",
      status: "Change status",
      approve: "Mark approved",
    },
  },
  {
    module: "results",
    label: "Results & CoA",
    actions: {
      view: "View",
      create: "Enter",
      update: "Edit / submit",
      delete: "Delete",
      approve: "Approve / reject",
    },
  },
  {
    module: "templates",
    label: "Result Templates",
    actions: { view: "View", create: "Create", update: "Edit", delete: "Delete" },
  },
  {
    module: "inventory",
    label: "Stock & Consumables",
    actions: { view: "View", create: "Add", update: "Edit / adjust stock" },
  },
  {
    module: "assets",
    label: "Assets & Equipment",
    actions: { view: "View", create: "Add", update: "Edit", log: "Log maintenance" },
  },
  {
    module: "requisitions",
    label: "Requisitions",
    actions: {
      view: "View",
      create: "Create",
      update: "Edit / submit",
      approve: "Approve",
      delete: "Delete",
    },
  },
  {
    module: "purchase_orders",
    label: "Purchase Orders",
    actions: { view: "View", update: "Update", delete: "Delete" },
  },
  {
    module: "invoices",
    label: "Invoices",
    actions: {
      view: "View",
      create: "Create",
      update: "Edit",
      payment: "Record payment",
      delete: "Delete",
    },
  },
  {
    module: "clients",
    label: "Clients",
    actions: { view: "View", create: "Register", update: "Edit" },
  },
  {
    module: "suppliers",
    label: "Suppliers",
    actions: { view: "View", create: "Add", update: "Edit", delete: "Delete" },
  },
  {
    module: "leads",
    label: "Marketing Leads",
    actions: { view: "View", create: "Add", update: "Edit" },
  },
  {
    module: "marketers",
    label: "Marketers",
    actions: { view: "View all marketers" },
  },
  {
    module: "team",
    label: "Team",
    actions: { view: "View", create: "Invite", update: "Edit / reset password" },
  },
  {
    module: "training_logs",
    label: "Training Logs",
    actions: { view: "View", create: "Record", update: "Edit", delete: "Delete" },
  },
  { module: "audit_logs", label: "Audit Logs", actions: { view: "View" } },
  { module: "reports", label: "Reports", actions: { view: "View" } },
  {
    module: "settings",
    label: "Settings",
    actions: { update: "Edit organisation", bank_accounts: "Edit bank accounts" },
  },
  {
    module: "roles",
    label: "Roles & Permissions",
    actions: { view: "View", update: "Manage" },
  },
] as const;

export const ALL_PERMISSIONS: string[] = PERMISSION_CATALOG.flatMap((m) =>
  Object.keys(m.actions).map((a) => `${m.module}.${a}`),
);

// Super Admin always holds every permission and cannot be edited, so the
// organisation can never lock itself out of Roles & Permissions.
export const SUPER_ADMIN = "super_admin";

export const SYSTEM_ROLES: { key: string; name: string }[] = [
  { key: "super_admin", name: "Super Admin" },
  { key: "md", name: "Managing Director" },
  { key: "general_manager", name: "General Manager" },
  { key: "operations_manager", name: "Operations Manager" },
  { key: "lab_manager", name: "Laboratory Manager" },
  { key: "quality_manager", name: "Quality Manager" },
  { key: "lab_analyst", name: "Laboratory Analyst" },
  { key: "hr_manager", name: "HR Manager" },
  { key: "secretary", name: "Secretary" },
  { key: "marketing_officer", name: "Marketing Officer" },
  { key: "internal_auditor", name: "Internal Auditor" },
  { key: "inventory_manager", name: "Inventory Manager" },
  { key: "procurement_officer", name: "Procurement Officer" },
  { key: "finance", name: "Finance" },
  { key: "business_development", name: "Business Development" },
  { key: "marketer", name: "Marketer" },
  { key: "customer", name: "Customer" },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

const ADMIN = ["md"];
const STAFF = [
  "md",
  "operations_manager",
  "lab_manager",
  "quality_manager",
  "lab_analyst",
  "secretary",
  "inventory_manager",
  "procurement_officer",
  "finance",
  "business_development",
  "marketer",
];
const LAB = ["md", "quality_manager", "lab_manager", "lab_analyst"];
const SAMPLE = [...LAB, "inventory_manager", "operations_manager", "secretary"];
const INVOICE = ["md", "finance", "business_development", "secretary"];
const REPORTING = ["md", "finance", "operations_manager"];
const TRAINING_MANAGER = ["md", "lab_manager", "quality_manager"];
const SUPPLIER_EDIT = ["procurement_officer", "inventory_manager"];

// permission → roles granted it by default
const DEFAULT_GRANTS: Record<string, string[]> = {
  "dashboard.view": [...STAFF, "marketing_officer"],
  "dashboard.revenue": ["md", "finance"],

  "sample_requests.view": [...STAFF, "marketing_officer"],
  "sample_requests.update": [...STAFF, "marketing_officer"],
  "sample_requests.approve": [
    ...STAFF.filter((r) => r !== "lab_analyst"),
    "marketing_officer",
  ],
  "sample_requests.convert": STAFF,

  "samples.view": [...STAFF, "marketing_officer"],
  "samples.create": SAMPLE,
  "samples.update": SAMPLE,
  "samples.status": STAFF,
  "samples.approve": STAFF.filter((r) => r !== "lab_analyst"),

  "results.view": STAFF,
  "results.create": LAB,
  "results.update": LAB,
  "results.delete": LAB,
  "results.approve": ["md", "lab_manager"],

  "templates.view": STAFF,
  "templates.create": ["md", "quality_manager", "lab_manager"],
  "templates.update": ["md", "quality_manager", "lab_manager"],
  "templates.delete": ["md", "quality_manager", "lab_manager"],

  "inventory.view": STAFF,
  "inventory.create": ["md", "inventory_manager", "lab_analyst", "lab_manager", "operations_manager"],
  "inventory.update": ["md", "inventory_manager", "lab_analyst", "lab_manager", "operations_manager"],

  "assets.view": STAFF,
  "assets.create": ["md", "inventory_manager", "operations_manager"],
  "assets.update": ["md", "inventory_manager", "operations_manager"],
  "assets.log": ["md", "inventory_manager", "quality_manager", "lab_manager", "operations_manager"],

  "requisitions.view": STAFF,
  "requisitions.create": STAFF,
  "requisitions.update": STAFF,
  "requisitions.approve": ["md", "finance", "procurement_officer"],
  "requisitions.delete": [],

  "purchase_orders.view": STAFF,
  "purchase_orders.update": ["md", "procurement_officer", "finance"],
  "purchase_orders.delete": [],

  "invoices.view": [...INVOICE, ...REPORTING],
  "invoices.create": INVOICE,
  "invoices.update": ["md", "finance", "secretary"],
  "invoices.payment": ["md", "finance"],
  "invoices.delete": ["md"],

  "clients.view": [...STAFF, "marketing_officer"],
  "clients.create": [
    "md", "quality_manager", "business_development", "finance", "marketer",
    "operations_manager", "secretary", "marketing_officer",
  ],
  "clients.update": [
    "md", "quality_manager", "business_development", "finance",
    "operations_manager", "secretary",
  ],

  "suppliers.view": ["md", ...SUPPLIER_EDIT],
  "suppliers.create": SUPPLIER_EDIT,
  "suppliers.update": SUPPLIER_EDIT,
  "suppliers.delete": [],

  "leads.view": [...ADMIN, "marketer"],
  "leads.create": [...ADMIN, "marketer"],
  "leads.update": [...ADMIN, "marketer"],
  "marketers.view": ADMIN,

  "team.view": [...ADMIN, "quality_manager", "lab_manager"],
  "team.create": ADMIN,
  "team.update": ADMIN,

  "training_logs.view": [...TRAINING_MANAGER, "hr_manager"],
  "training_logs.create": TRAINING_MANAGER,
  "training_logs.update": TRAINING_MANAGER,
  "training_logs.delete": TRAINING_MANAGER,

  "audit_logs.view": ["md", "quality_manager", "internal_auditor"],
  "reports.view": REPORTING,

  "settings.update": ADMIN,
  "settings.bank_accounts": ["md", "finance"],

  "roles.view": ADMIN,
  "roles.update": ADMIN,
};

/** Default permission list for a built-in role ([] for unknown roles). */
export function defaultPermissions(role: string): string[] {
  if (role === SUPER_ADMIN) return [...ALL_PERMISSIONS];
  // The General Manager starts with the same executive access as the MD
  const lookup = role === "general_manager" ? "md" : role;
  return ALL_PERMISSIONS.filter((p) => DEFAULT_GRANTS[p]?.includes(lookup));
}

export function isSystemRole(key: string) {
  return SYSTEM_ROLES.some((r) => r.key === key);
}

/** Keep only permissions that exist in the catalog. */
export function sanitizePermissions(perms: unknown): string[] {
  if (!Array.isArray(perms)) return [];
  const valid = new Set(ALL_PERMISSIONS);
  return [...new Set(perms.filter((p): p is string => typeof p === "string" && valid.has(p)))];
}
