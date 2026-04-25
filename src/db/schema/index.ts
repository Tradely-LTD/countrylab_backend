import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  real,
  jsonb,
  index,
  uniqueIndex,
  pgSchema,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Define the schema
export const countrylabSchema = pgSchema("countrylab_lms");

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = countrylabSchema.enum("user_role", [
  "super_admin",
  "md",
  "quality_manager",
  "lab_analyst",
  "procurement_officer",
  "inventory_manager",
  "customer",
  "finance",
  "business_development",
  "marketer",
]);

export const sampleStatusEnum = countrylabSchema.enum("sample_status", [
  "received",
  "in_testing",
  "pending_review",
  "approved",
  "disposed",
  "voided",
]);

export const resultStatusEnum = countrylabSchema.enum("result_status", [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "voided",
]);

export const requestStatusEnum = countrylabSchema.enum("request_status", [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "sample_received",
  "completed",
  "cancelled",
]);

export const reagentGradeEnum = countrylabSchema.enum("reagent_grade", [
  "AR",
  "HPLC",
  "GR",
  "LR",
  "Technical",
]);

export const productTypeEnum = countrylabSchema.enum("product_type", [
  "reagent",
  "consumable",
  "standard",
  "supply",
  "kit",
]);

export const assetStatusEnum = countrylabSchema.enum("asset_status", [
  "operational",
  "under_repair",
  "calibration_due",
  "decommissioned",
]);

export const requisitionStatusEnum = countrylabSchema.enum(
  "requisition_status",
  [
    "draft",
    "pending_review",
    "pending_approval",
    "approved",
    "rejected",
    "ordered",
  ],
);

export const ticketStatusEnum = countrylabSchema.enum("ticket_status", [
  "open",
  "in_progress",
  "resolved",
  "closed",
]);

export const ticketTypeEnum = countrylabSchema.enum("ticket_type", [
  "technical_error",
  "delayed_result",
  "billing_issue",
  "behavior",
  "other",
]);

export const sopStatusEnum = countrylabSchema.enum("sop_status", [
  "draft",
  "under_review",
  "published",
  "archived",
]);

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const tenants = countrylabSchema.table("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(),
  logo_url: text("logo_url"),
  address: text("address"),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  accreditation_number: varchar("accreditation_number", { length: 100 }),
  is_active: boolean("is_active").default(true),
  settings: jsonb("settings").default({}),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = countrylabSchema.table(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    supabase_user_id: uuid("supabase_user_id").unique(),
    email: varchar("email", { length: 255 }).notNull(),
    full_name: varchar("full_name", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("lab_analyst"),
    department: varchar("department", { length: 100 }),
    phone: varchar("phone", { length: 50 }),
    avatar_url: text("avatar_url"),
    is_active: boolean("is_active").default(true),
    requires_2fa: boolean("requires_2fa").default(false),
    referral_code: varchar("referral_code", { length: 12 }).unique(),
    last_login_at: timestamp("last_login_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantEmailIdx: uniqueIndex("users_tenant_email_idx").on(
      t.tenant_id,
      t.email,
    ),
  }),
);

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clients = countrylabSchema.table("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  city: varchar("city", { length: 100 }),
  state: varchar("state", { length: 100 }),
  postal_code: varchar("postal_code", { length: 20 }),
  country: varchar("country", { length: 100 }).default("Nigeria"),
  tax_id: varchar("tax_id", { length: 100 }),
  website: varchar("website", { length: 255 }),
  contact_person: varchar("contact_person", { length: 255 }),
  notes: text("notes"),
  is_active: boolean("is_active").default(true),
  client_status: varchar("client_status", { length: 20 }).default("active"),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Client Interactions ──────────────────────────────────────────────────────

export const client_interactions = countrylabSchema.table(
  "client_interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    client_id: uuid("client_id")
      .references(() => clients.id, { onDelete: "cascade" })
      .notNull(),
    staff_id: uuid("staff_id")
      .references(() => users.id)
      .notNull(),
    type: varchar("type", { length: 50 }).notNull(), // Call | Email | Visit | Meeting | Other
    date: timestamp("date").notNull(),
    notes: text("notes"),
    outcome: varchar("outcome", { length: 50 }), // Interested | Not Interested | Follow-up Required | Converted
    created_at: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("client_interactions_tenant_idx").on(t.tenant_id),
    clientIdx: index("client_interactions_client_idx").on(t.client_id),
    staffIdx: index("client_interactions_staff_idx").on(t.staff_id),
  }),
);

// ─── Suppliers ────────────────────────────────────────────────────────────────

export const suppliers = countrylabSchema.table("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  address: text("address"),
  contact_person: varchar("contact_person", { length: 255 }),
  website: varchar("website", { length: 255 }),
  tax_id: varchar("tax_id", { length: 100 }),
  payment_terms: varchar("payment_terms", { length: 100 }), // Net 30, Net 60, COD
  currency: varchar("currency", { length: 10 }).default("NGN"),
  total_spent: real("total_spent").default(0),
  total_orders: integer("total_orders").default(0),
  notes: text("notes"),
  is_active: boolean("is_active").default(true),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Test Methods ─────────────────────────────────────────────────────────────

export const test_methods = countrylabSchema.table("test_methods", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 100 }).notNull(),
  standard: varchar("standard", { length: 100 }), // ISO 6222, AOAC, ASTM D1234
  category: varchar("category", { length: 100 }), // Wastewater, Animal Feed, Water
  parameters: jsonb("parameters").default([]),
  // [{name, unit, data_type: 'numerical'|'qualitative', spec_min, spec_max, formula}]
  turnaround_days: integer("turnaround_days").default(3),
  price: real("price").default(0),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
});

// ─── Samples ──────────────────────────────────────────────────────────────────

export const samples = countrylabSchema.table(
  "samples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    ulid: varchar("ulid", { length: 30 }).unique().notNull(),
    client_id: uuid("client_id")
      .references(() => clients.id)
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    matrix: varchar("matrix", { length: 100 }), // Water, Soil, Food, Animal Feed
    collection_date: timestamp("collection_date"),
    received_at: timestamp("received_at").defaultNow(),
    status: sampleStatusEnum("status").notNull().default("received"),
    storage_zone: varchar("storage_zone", { length: 100 }),
    storage_location: varchar("storage_location", { length: 200 }),
    assigned_analyst_id: uuid("assigned_analyst_id").references(() => users.id),
    barcode_url: text("barcode_url"),
    disposed_at: timestamp("disposed_at"),
    voided_at: timestamp("voided_at"),
    void_reason: text("void_reason"),
    notes: text("notes"),
    received_by: uuid("received_by").references(() => users.id),
    // Enhanced CoA fields
    sample_container: varchar("sample_container", { length: 100 }),
    sample_volume: varchar("sample_volume", { length: 50 }),
    reference_standard: varchar("reference_standard", { length: 100 }),
    batch_number: varchar("batch_number", { length: 100 }),
    sample_condition: varchar("sample_condition", { length: 50 }).default(
      "Good",
    ),
    temperature_on_receipt: varchar("temperature_on_receipt", { length: 50 }),
    sampling_point: text("sampling_point"),
    production_date: timestamp("production_date"),
    expiry_date: timestamp("expiry_date"),
    manufacturer: varchar("manufacturer", { length: 255 }),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("samples_tenant_idx").on(t.tenant_id),
    statusIdx: index("samples_status_idx").on(t.status),
    clientIdx: index("samples_client_idx").on(t.client_id),
  }),
);

// ─── Sample Requests ──────────────────────────────────────────────────────────

export const sample_requests = countrylabSchema.table(
  "sample_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    request_number: varchar("request_number", { length: 50 })
      .unique()
      .notNull(),
    client_id: uuid("client_id")
      .references(() => clients.id)
      .notNull(),
    // Representative Information
    representative_name: varchar("representative_name", { length: 255 }),
    representative_phone: varchar("representative_phone", { length: 50 }),
    representative_email: varchar("representative_email", { length: 255 }),
    // Sample Information
    product_name: varchar("product_name", { length: 255 }),
    sample_source: text("sample_source"),
    sample_type: varchar("sample_type", { length: 100 }),
    production_date: timestamp("production_date"),
    expiry_date: timestamp("expiry_date"),
    batch_number: varchar("batch_number", { length: 100 }),
    // Analysis Details
    intended_use: text("intended_use"),
    reference_standard: varchar("reference_standard", { length: 100 }),
    test_category: varchar("test_category", { length: 50 }),
    test_category_other: varchar("test_category_other", { length: 255 }),
    requested_tests: jsonb("requested_tests").default([]),
    // Additional fields
    sample_container: varchar("sample_container", { length: 100 }),
    sample_volume: varchar("sample_volume", { length: 50 }),
    sample_condition: varchar("sample_condition", { length: 50 }),
    temperature_on_receipt: varchar("temperature_on_receipt", { length: 50 }),
    sampling_point: text("sampling_point"),
    manufacturer: varchar("manufacturer", { length: 255 }),
    matrix: varchar("matrix", { length: 100 }),
    // Official Use
    reference_standard_available: boolean("reference_standard_available"),
    service_offered: boolean("service_offered"),
    test_resources_available: boolean("test_resources_available"),
    sample_quantity_sufficient: boolean("sample_quantity_sufficient"),
    invoice_issued: boolean("invoice_issued"),
    payment_confirmed: boolean("payment_confirmed"),
    official_remarks: text("official_remarks"),
    // Workflow
    status: requestStatusEnum("status").default("pending"),
    sample_id: uuid("sample_id").references(() => samples.id),
    invoice_id: uuid("invoice_id"),
    quotation_amount: real("quotation_amount"),
    // Tracking
    received_by: uuid("received_by").references(() => users.id),
    reviewed_by: uuid("reviewed_by").references(() => users.id),
    approved_by: uuid("approved_by").references(() => users.id),
    reviewed_at: timestamp("reviewed_at"),
    approved_at: timestamp("approved_at"),
    rejection_reason: text("rejection_reason"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("sample_requests_tenant_idx").on(t.tenant_id),
    clientIdx: index("sample_requests_client_idx").on(t.client_id),
    statusIdx: index("sample_requests_status_idx").on(t.status),
    numberIdx: index("sample_requests_number_idx").on(t.request_number),
  }),
);

// ─── Result Templates ─────────────────────────────────────────────────────────

export const result_templates = countrylabSchema.table(
  "result_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    nis_standard: varchar("nis_standard", { length: 100 }),
    nis_standard_ref: varchar("nis_standard_ref", { length: 100 }),
    effective_date: date("effective_date"),
    version: integer("version").default(1),
    parent_template_id: uuid("parent_template_id").references(
      (): any => result_templates.id,
    ),
    is_active: boolean("is_active").default(true),
    created_by: uuid("created_by").references(() => users.id),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("result_templates_tenant_idx").on(t.tenant_id),
    activeIdx: index("result_templates_active_idx").on(
      t.tenant_id,
      t.is_active,
    ),
  }),
);

export const result_template_parameters = countrylabSchema.table(
  "result_template_parameters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    template_id: uuid("template_id")
      .references(() => result_templates.id, { onDelete: "cascade" })
      .notNull(),
    parameter_name: varchar("parameter_name", { length: 255 }).notNull(),
    nis_limit: text("nis_limit"),
    unit: varchar("unit", { length: 50 }),
    parameter_group: varchar("parameter_group", { length: 100 }),
    sequence_order: integer("sequence_order").default(0),
    data_type: varchar("data_type", { length: 20 }).default("numerical"),
    spec_min: real("spec_min"),
    spec_max: real("spec_max"),
  },
  (t) => ({
    templateIdx: index("result_template_params_template_idx").on(t.template_id),
  }),
);

// ─── Results ──────────────────────────────────────────────────────────────────

export const results = countrylabSchema.table(
  "results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    sample_id: uuid("sample_id")
      .references(() => samples.id)
      .notNull(),
    test_method_id: uuid("test_method_id").references(() => test_methods.id),
    analyst_id: uuid("analyst_id")
      .references(() => users.id)
      .notNull(),
    reviewer_id: uuid("reviewer_id").references(() => users.id),
    approver_id: uuid("approver_id").references(() => users.id),
    parameters: jsonb("parameters").default([]),
    // [{param_name, raw_value, calculated_value, unit, spec_min, spec_max, pass, warning, data_type}]
    overall_status: resultStatusEnum("overall_status").default("draft"),
    coa_url: text("coa_url"),
    qr_hash: varchar("qr_hash", { length: 64 }).unique(),
    qr_code_url: text("qr_code_url"),
    reviewed_at: timestamp("reviewed_at"),
    approved_at: timestamp("approved_at"),
    locked_at: timestamp("locked_at"),
    voided_at: timestamp("voided_at"),
    void_reason: text("void_reason"),
    notes: text("notes"),
    template_id: uuid("template_id").references(() => result_templates.id),
    template_version: integer("template_version"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("results_tenant_idx").on(t.tenant_id),
    sampleIdx: index("results_sample_idx").on(t.sample_id),
    statusIdx: index("results_status_idx").on(t.overall_status),
  }),
);

// ─── Result Change Log ────────────────────────────────────────────────────────

export const result_changes = countrylabSchema.table("result_changes", {
  id: uuid("id").defaultRandom().primaryKey(),
  result_id: uuid("result_id")
    .references(() => results.id)
    .notNull(),
  changed_by: uuid("changed_by")
    .references(() => users.id)
    .notNull(),
  reason: text("reason").notNull(),
  old_parameters: jsonb("old_parameters"),
  new_parameters: jsonb("new_parameters"),
  created_at: timestamp("created_at").defaultNow(),
});

// ─── Reagents ─────────────────────────────────────────────────────────────────

export const reagents = countrylabSchema.table("reagents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  product_type: productTypeEnum("product_type").default("reagent"),
  name: varchar("name", { length: 255 }).notNull(),
  chemical_name: varchar("chemical_name", { length: 255 }),
  cas_number: varchar("cas_number", { length: 50 }),
  catalog_number: varchar("catalog_number", { length: 100 }),
  lot_number: varchar("lot_number", { length: 100 }),
  manufacturer: varchar("manufacturer", { length: 255 }),
  supplier_id: uuid("supplier_id").references(() => suppliers.id),
  grade: reagentGradeEnum("grade"),
  category: varchar("category", { length: 100 }), // Acid, Base, Solvent, etc.
  batch_number: varchar("batch_number", { length: 100 }),
  quantity: real("quantity").default(0),
  unit: varchar("unit", { length: 50 }).default("units"),
  reorder_level: real("reorder_level").default(10),
  unit_price: real("unit_price").default(0),
  expiry_date: timestamp("expiry_date"),
  storage_conditions: varchar("storage_conditions", { length: 255 }),
  storage_location: varchar("storage_location", { length: 200 }),
  is_active: boolean("is_active").default(true),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Assets ───────────────────────────────────────────────────────────────────

export const assets = countrylabSchema.table("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  asset_tag: varchar("asset_tag", { length: 100 }),
  model: varchar("model", { length: 255 }),
  serial_number: varchar("serial_number", { length: 255 }),
  manufacturer: varchar("manufacturer", { length: 255 }),
  purchase_date: timestamp("purchase_date"),
  warranty_expiry: timestamp("warranty_expiry"),
  status: assetStatusEnum("status").default("operational"),
  custodian_id: uuid("custodian_id").references(() => users.id),
  location: varchar("location", { length: 255 }),
  calibration_frequency_days: integer("calibration_frequency_days"),
  last_calibration_date: timestamp("last_calibration_date"),
  next_calibration_date: timestamp("next_calibration_date"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const asset_logs = countrylabSchema.table("asset_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  asset_id: uuid("asset_id")
    .references(() => assets.id)
    .notNull(),
  action: varchar("action", { length: 100 }).notNull(), // calibrated, repaired, moved, assigned
  description: text("description"),
  performed_by: uuid("performed_by").references(() => users.id),
  performed_at: timestamp("performed_at").defaultNow(),
  next_due_date: timestamp("next_due_date"),
  attachment_url: text("attachment_url"),
});

// ─── Procurement ──────────────────────────────────────────────────────────────

export const requisitions = countrylabSchema.table("requisitions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  requisition_number: varchar("requisition_number", { length: 50 })
    .unique()
    .notNull(),
  prepared_by: uuid("prepared_by")
    .references(() => users.id)
    .notNull(),
  reviewed_by: uuid("reviewed_by").references(() => users.id),
  approved_by: uuid("approved_by").references(() => users.id),
  department: varchar("department", { length: 100 }),
  urgency: varchar("urgency", { length: 50 }).default("routine"), // routine | emergency
  required_date: timestamp("required_date"),
  status: requisitionStatusEnum("status").default("draft"),
  items: jsonb("items").default([]),
  // [{item_name, quantity, unit, urgency, notes}]
  items_metadata: jsonb("items_metadata").default([]),
  // Enhanced items with inventory links:
  // [{item_name, reagent_id?, asset_id?, quantity, unit, supplier_id?, estimated_price?, catalog_number?, notes?}]
  rejection_reason: text("rejection_reason"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const purchase_orders = countrylabSchema.table("purchase_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  po_number: varchar("po_number", { length: 50 }).unique().notNull(),
  requisition_id: uuid("requisition_id").references(() => requisitions.id),
  supplier_id: uuid("supplier_id").references(() => suppliers.id),
  supplier_name: varchar("supplier_name", { length: 255 }),
  supplier_contact: varchar("supplier_contact", { length: 255 }),
  total_amount: real("total_amount"),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 50 }).default("pending"), // pending | received | partial | cancelled
  invoice_url: text("invoice_url"),
  notes: text("notes"),
  ordered_by: uuid("ordered_by").references(() => users.id),
  ordered_at: timestamp("ordered_at"),
  received_at: timestamp("received_at"),
  created_at: timestamp("created_at").defaultNow(),
});

// ─── SOPs / Knowledge Base ────────────────────────────────────────────────────

export const sops = countrylabSchema.table("sops", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  document_number: varchar("document_number", { length: 100 }),
  version: varchar("version", { length: 20 }).default("1.0"),
  category: varchar("category", { length: 100 }),
  document_url: text("document_url"),
  status: sopStatusEnum("status").default("draft"),
  submitted_by: uuid("submitted_by").references(() => users.id),
  reviewed_by: uuid("reviewed_by").references(() => users.id),
  approved_by: uuid("approved_by").references(() => users.id),
  parent_sop_id: uuid("parent_sop_id"),
  linked_asset_id: uuid("linked_asset_id").references(() => assets.id),
  effective_date: timestamp("effective_date"),
  review_date: timestamp("review_date"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoices = countrylabSchema.table("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  invoice_number: varchar("invoice_number", { length: 50 }).unique().notNull(),
  client_id: uuid("client_id")
    .references(() => clients.id)
    .notNull(),
  result_id: uuid("result_id").references(() => results.id),
  sample_id: uuid("sample_id").references(() => samples.id),
  line_items: jsonb("line_items").default([]),
  // [{description, quantity, unit_price, amount}]
  subtotal: real("subtotal").default(0),
  discount_type: varchar("discount_type", { length: 20 }).default("percentage"),
  discount_value: real("discount_value").default(0),
  discount_amount: real("discount_amount").default(0),
  tax_rate: real("tax_rate").default(0),
  tax_amount: real("tax_amount").default(0),
  total: real("total").default(0),
  currency: varchar("currency", { length: 10 }).default("NGN"),
  status: varchar("status", { length: 50 }).default("unpaid"), // unpaid | paid | partial | voided
  due_date: timestamp("due_date"),
  paid_at: timestamp("paid_at"),
  payment_method: varchar("payment_method", { length: 100 }),
  notes: text("notes"),
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Tickets ──────────────────────────────────────────────────────────────────

export const tickets = countrylabSchema.table("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  ticket_number: varchar("ticket_number", { length: 50 }).unique().notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 50 }).default("internal"), // internal | external
  type: ticketTypeEnum("type").notNull(),
  status: ticketStatusEnum("status").default("open"),
  priority: varchar("priority", { length: 50 }).default("medium"), // low | medium | high | critical
  reported_by_user: uuid("reported_by_user").references(() => users.id),
  reported_by_client: uuid("reported_by_client").references(() => clients.id),
  assigned_to: uuid("assigned_to").references(() => users.id),
  resolution_notes: text("resolution_notes"),
  resolution_rating: integer("resolution_rating"),
  resolved_at: timestamp("resolved_at"),
  closed_at: timestamp("closed_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export const audit_logs = countrylabSchema.table(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id)
      .notNull(),
    user_id: uuid("user_id").references(() => users.id),
    action: varchar("action", { length: 100 }).notNull(),
    // CREATE | READ | UPDATE | DELETE | APPROVE | REJECT | LOGIN | LOGOUT | EXPORT
    table_name: varchar("table_name", { length: 100 }),
    record_id: uuid("record_id"),
    old_value: jsonb("old_value"),
    new_value: jsonb("new_value"),
    ip_address: varchar("ip_address", { length: 50 }),
    user_agent: text("user_agent"),
    metadata: jsonb("metadata").default({}),
    created_at: timestamp("created_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("audit_tenant_idx").on(t.tenant_id),
    userIdx: index("audit_user_idx").on(t.user_id),
    actionIdx: index("audit_action_idx").on(t.action),
    createdAtIdx: index("audit_created_at_idx").on(t.created_at),
  }),
);

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = countrylabSchema.table("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenant_id: uuid("tenant_id")
    .references(() => tenants.id)
    .notNull(),
  user_id: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  type: varchar("type", { length: 100 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  message: text("message"),
  link: varchar("link", { length: 500 }),
  is_read: boolean("is_read").default(false),
  created_at: timestamp("created_at").defaultNow(),
});

// ─── Leads (Marketer Attribution) ────────────────────────────────────────────

export const leads = countrylabSchema.table(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenant_id: uuid("tenant_id")
      .references(() => tenants.id, { onDelete: "cascade" })
      .notNull(),
    marketer_id: uuid("marketer_id")
      .references(() => users.id)
      .notNull(),
    referral_code: varchar("referral_code", { length: 12 }),
    // Prospect info
    name: varchar("name", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }),
    phone: varchar("phone", { length: 50 }).notNull(),
    email: varchar("email", { length: 255 }),
    city: varchar("city", { length: 100 }),
    state: varchar("state", { length: 100 }),
    notes: text("notes"),
    // Pipeline: new | contacted | interested | sample_submitted | converted | lost
    status: varchar("status", { length: 30 }).default("new").notNull(),
    // Conversion
    converted_client_id: uuid("converted_client_id").references(() => clients.id),
    converted_at: timestamp("converted_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  (t) => ({
    tenantIdx: index("leads_tenant_idx").on(t.tenant_id),
    marketerIdx: index("leads_marketer_idx").on(t.marketer_id),
    statusIdx: index("leads_status_idx").on(t.status),
  }),
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  clients: many(clients),
  samples: many(samples),
  results: many(results),
  reagents: many(reagents),
  assets: many(assets),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, { fields: [users.tenant_id], references: [tenants.id] }),
  assignedSamples: many(samples),
  results: many(results),
}));

export const samplesRelations = relations(samples, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [samples.tenant_id],
    references: [tenants.id],
  }),
  client: one(clients, {
    fields: [samples.client_id],
    references: [clients.id],
  }),
  analyst: one(users, {
    fields: [samples.assigned_analyst_id],
    references: [users.id],
  }),
  results: many(results),
}));

export const resultsRelations = relations(results, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [results.tenant_id],
    references: [tenants.id],
  }),
  sample: one(samples, {
    fields: [results.sample_id],
    references: [samples.id],
  }),
  analyst: one(users, { fields: [results.analyst_id], references: [users.id] }),
  changes: many(result_changes),
  template: one(result_templates, {
    fields: [results.template_id],
    references: [result_templates.id],
  }),
}));

export const suppliersRelations = relations(suppliers, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [suppliers.tenant_id],
    references: [tenants.id],
  }),
  reagents: many(reagents),
  purchaseOrders: many(purchase_orders),
}));

export const reagentsRelations = relations(reagents, ({ one }) => ({
  tenant: one(tenants, {
    fields: [reagents.tenant_id],
    references: [tenants.id],
  }),
  supplier: one(suppliers, {
    fields: [reagents.supplier_id],
    references: [suppliers.id],
  }),
}));

export const resultTemplatesRelations = relations(
  result_templates,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [result_templates.tenant_id],
      references: [tenants.id],
    }),
    createdBy: one(users, {
      fields: [result_templates.created_by],
      references: [users.id],
    }),
    parentTemplate: one(result_templates, {
      fields: [result_templates.parent_template_id],
      references: [result_templates.id],
      relationName: "templateVersions",
    }),
    childTemplates: many(result_templates, {
      relationName: "templateVersions",
    }),
    parameters: many(result_template_parameters),
    results: many(results),
  }),
);

export const resultTemplateParametersRelations = relations(
  result_template_parameters,
  ({ one }) => ({
    template: one(result_templates, {
      fields: [result_template_parameters.template_id],
      references: [result_templates.id],
    }),
  }),
);
