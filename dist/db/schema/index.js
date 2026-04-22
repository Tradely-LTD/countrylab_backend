"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resultTemplateParametersRelations = exports.resultTemplatesRelations = exports.reagentsRelations = exports.suppliersRelations = exports.resultsRelations = exports.samplesRelations = exports.usersRelations = exports.tenantsRelations = exports.notifications = exports.audit_logs = exports.tickets = exports.invoices = exports.sops = exports.purchase_orders = exports.requisitions = exports.asset_logs = exports.assets = exports.reagents = exports.result_changes = exports.results = exports.result_template_parameters = exports.result_templates = exports.sample_requests = exports.samples = exports.test_methods = exports.suppliers = exports.client_interactions = exports.clients = exports.users = exports.tenants = exports.sopStatusEnum = exports.ticketTypeEnum = exports.ticketStatusEnum = exports.requisitionStatusEnum = exports.assetStatusEnum = exports.productTypeEnum = exports.reagentGradeEnum = exports.requestStatusEnum = exports.resultStatusEnum = exports.sampleStatusEnum = exports.userRoleEnum = exports.countrylabSchema = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const drizzle_orm_1 = require("drizzle-orm");
// Define the schema
exports.countrylabSchema = (0, pg_core_1.pgSchema)("countrylab_lms");
// ─── Enums ────────────────────────────────────────────────────────────────────
exports.userRoleEnum = exports.countrylabSchema.enum("user_role", [
    "super_admin",
    "md",
    "quality_manager",
    "lab_analyst",
    "procurement_officer",
    "inventory_manager",
    "customer",
    "finance",
    "business_development",
]);
exports.sampleStatusEnum = exports.countrylabSchema.enum("sample_status", [
    "received",
    "in_testing",
    "pending_review",
    "approved",
    "disposed",
    "voided",
]);
exports.resultStatusEnum = exports.countrylabSchema.enum("result_status", [
    "draft",
    "submitted",
    "under_review",
    "approved",
    "rejected",
    "voided",
]);
exports.requestStatusEnum = exports.countrylabSchema.enum("request_status", [
    "pending",
    "under_review",
    "approved",
    "rejected",
    "sample_received",
    "completed",
    "cancelled",
]);
exports.reagentGradeEnum = exports.countrylabSchema.enum("reagent_grade", [
    "AR",
    "HPLC",
    "GR",
    "LR",
    "Technical",
]);
exports.productTypeEnum = exports.countrylabSchema.enum("product_type", [
    "reagent",
    "consumable",
    "standard",
    "supply",
    "kit",
]);
exports.assetStatusEnum = exports.countrylabSchema.enum("asset_status", [
    "operational",
    "under_repair",
    "calibration_due",
    "decommissioned",
]);
exports.requisitionStatusEnum = exports.countrylabSchema.enum("requisition_status", [
    "draft",
    "pending_review",
    "pending_approval",
    "approved",
    "rejected",
    "ordered",
]);
exports.ticketStatusEnum = exports.countrylabSchema.enum("ticket_status", [
    "open",
    "in_progress",
    "resolved",
    "closed",
]);
exports.ticketTypeEnum = exports.countrylabSchema.enum("ticket_type", [
    "technical_error",
    "delayed_result",
    "billing_issue",
    "behavior",
    "other",
]);
exports.sopStatusEnum = exports.countrylabSchema.enum("sop_status", [
    "draft",
    "under_review",
    "published",
    "archived",
]);
// ─── Tenants ──────────────────────────────────────────────────────────────────
exports.tenants = exports.countrylabSchema.table("tenants", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).unique().notNull(),
    logo_url: (0, pg_core_1.text)("logo_url"),
    address: (0, pg_core_1.text)("address"),
    phone: (0, pg_core_1.varchar)("phone", { length: 50 }),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    accreditation_number: (0, pg_core_1.varchar)("accreditation_number", { length: 100 }),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    settings: (0, pg_core_1.jsonb)("settings").default({}),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Users ────────────────────────────────────────────────────────────────────
exports.users = exports.countrylabSchema.table("users", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    supabase_user_id: (0, pg_core_1.uuid)("supabase_user_id").unique(),
    email: (0, pg_core_1.varchar)("email", { length: 255 }).notNull(),
    full_name: (0, pg_core_1.varchar)("full_name", { length: 255 }).notNull(),
    role: (0, exports.userRoleEnum)("role").notNull().default("lab_analyst"),
    department: (0, pg_core_1.varchar)("department", { length: 100 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 50 }),
    avatar_url: (0, pg_core_1.text)("avatar_url"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    requires_2fa: (0, pg_core_1.boolean)("requires_2fa").default(false),
    last_login_at: (0, pg_core_1.timestamp)("last_login_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    tenantEmailIdx: (0, pg_core_1.uniqueIndex)("users_tenant_email_idx").on(t.tenant_id, t.email),
}));
// ─── Clients ──────────────────────────────────────────────────────────────────
exports.clients = exports.countrylabSchema.table("clients", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    company: (0, pg_core_1.varchar)("company", { length: 255 }),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 50 }),
    address: (0, pg_core_1.text)("address"),
    city: (0, pg_core_1.varchar)("city", { length: 100 }),
    state: (0, pg_core_1.varchar)("state", { length: 100 }),
    postal_code: (0, pg_core_1.varchar)("postal_code", { length: 20 }),
    country: (0, pg_core_1.varchar)("country", { length: 100 }).default("Nigeria"),
    tax_id: (0, pg_core_1.varchar)("tax_id", { length: 100 }),
    website: (0, pg_core_1.varchar)("website", { length: 255 }),
    contact_person: (0, pg_core_1.varchar)("contact_person", { length: 255 }),
    notes: (0, pg_core_1.text)("notes"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    client_status: (0, pg_core_1.varchar)("client_status", { length: 20 }).default("active"),
    created_by: (0, pg_core_1.uuid)("created_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Client Interactions ──────────────────────────────────────────────────────
exports.client_interactions = exports.countrylabSchema.table("client_interactions", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    client_id: (0, pg_core_1.uuid)("client_id")
        .references(() => exports.clients.id, { onDelete: "cascade" })
        .notNull(),
    staff_id: (0, pg_core_1.uuid)("staff_id")
        .references(() => exports.users.id)
        .notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 50 }).notNull(), // Call | Email | Visit | Meeting | Other
    date: (0, pg_core_1.timestamp)("date").notNull(),
    notes: (0, pg_core_1.text)("notes"),
    outcome: (0, pg_core_1.varchar)("outcome", { length: 50 }), // Interested | Not Interested | Follow-up Required | Converted
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("client_interactions_tenant_idx").on(t.tenant_id),
    clientIdx: (0, pg_core_1.index)("client_interactions_client_idx").on(t.client_id),
    staffIdx: (0, pg_core_1.index)("client_interactions_staff_idx").on(t.staff_id),
}));
// ─── Suppliers ────────────────────────────────────────────────────────────────
exports.suppliers = exports.countrylabSchema.table("suppliers", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    company: (0, pg_core_1.varchar)("company", { length: 255 }),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    phone: (0, pg_core_1.varchar)("phone", { length: 50 }),
    address: (0, pg_core_1.text)("address"),
    contact_person: (0, pg_core_1.varchar)("contact_person", { length: 255 }),
    website: (0, pg_core_1.varchar)("website", { length: 255 }),
    tax_id: (0, pg_core_1.varchar)("tax_id", { length: 100 }),
    payment_terms: (0, pg_core_1.varchar)("payment_terms", { length: 100 }), // Net 30, Net 60, COD
    currency: (0, pg_core_1.varchar)("currency", { length: 10 }).default("NGN"),
    total_spent: (0, pg_core_1.real)("total_spent").default(0),
    total_orders: (0, pg_core_1.integer)("total_orders").default(0),
    notes: (0, pg_core_1.text)("notes"),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_by: (0, pg_core_1.uuid)("created_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Test Methods ─────────────────────────────────────────────────────────────
exports.test_methods = exports.countrylabSchema.table("test_methods", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    code: (0, pg_core_1.varchar)("code", { length: 100 }).notNull(),
    standard: (0, pg_core_1.varchar)("standard", { length: 100 }), // ISO 6222, AOAC, ASTM D1234
    category: (0, pg_core_1.varchar)("category", { length: 100 }), // Wastewater, Animal Feed, Water
    parameters: (0, pg_core_1.jsonb)("parameters").default([]),
    // [{name, unit, data_type: 'numerical'|'qualitative', spec_min, spec_max, formula}]
    turnaround_days: (0, pg_core_1.integer)("turnaround_days").default(3),
    price: (0, pg_core_1.real)("price").default(0),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ─── Samples ──────────────────────────────────────────────────────────────────
exports.samples = exports.countrylabSchema.table("samples", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    ulid: (0, pg_core_1.varchar)("ulid", { length: 30 }).unique().notNull(),
    client_id: (0, pg_core_1.uuid)("client_id")
        .references(() => exports.clients.id)
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    matrix: (0, pg_core_1.varchar)("matrix", { length: 100 }), // Water, Soil, Food, Animal Feed
    collection_date: (0, pg_core_1.timestamp)("collection_date"),
    received_at: (0, pg_core_1.timestamp)("received_at").defaultNow(),
    status: (0, exports.sampleStatusEnum)("status").notNull().default("received"),
    storage_zone: (0, pg_core_1.varchar)("storage_zone", { length: 100 }),
    storage_location: (0, pg_core_1.varchar)("storage_location", { length: 200 }),
    assigned_analyst_id: (0, pg_core_1.uuid)("assigned_analyst_id").references(() => exports.users.id),
    barcode_url: (0, pg_core_1.text)("barcode_url"),
    disposed_at: (0, pg_core_1.timestamp)("disposed_at"),
    voided_at: (0, pg_core_1.timestamp)("voided_at"),
    void_reason: (0, pg_core_1.text)("void_reason"),
    notes: (0, pg_core_1.text)("notes"),
    received_by: (0, pg_core_1.uuid)("received_by").references(() => exports.users.id),
    // Enhanced CoA fields
    sample_container: (0, pg_core_1.varchar)("sample_container", { length: 100 }),
    sample_volume: (0, pg_core_1.varchar)("sample_volume", { length: 50 }),
    reference_standard: (0, pg_core_1.varchar)("reference_standard", { length: 100 }),
    batch_number: (0, pg_core_1.varchar)("batch_number", { length: 100 }),
    sample_condition: (0, pg_core_1.varchar)("sample_condition", { length: 50 }).default("Good"),
    temperature_on_receipt: (0, pg_core_1.varchar)("temperature_on_receipt", { length: 50 }),
    sampling_point: (0, pg_core_1.text)("sampling_point"),
    production_date: (0, pg_core_1.timestamp)("production_date"),
    expiry_date: (0, pg_core_1.timestamp)("expiry_date"),
    manufacturer: (0, pg_core_1.varchar)("manufacturer", { length: 255 }),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("samples_tenant_idx").on(t.tenant_id),
    statusIdx: (0, pg_core_1.index)("samples_status_idx").on(t.status),
    clientIdx: (0, pg_core_1.index)("samples_client_idx").on(t.client_id),
}));
// ─── Sample Requests ──────────────────────────────────────────────────────────
exports.sample_requests = exports.countrylabSchema.table("sample_requests", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    request_number: (0, pg_core_1.varchar)("request_number", { length: 50 })
        .unique()
        .notNull(),
    client_id: (0, pg_core_1.uuid)("client_id")
        .references(() => exports.clients.id)
        .notNull(),
    // Representative Information
    representative_name: (0, pg_core_1.varchar)("representative_name", { length: 255 }),
    representative_phone: (0, pg_core_1.varchar)("representative_phone", { length: 50 }),
    representative_email: (0, pg_core_1.varchar)("representative_email", { length: 255 }),
    // Sample Information
    product_name: (0, pg_core_1.varchar)("product_name", { length: 255 }),
    sample_source: (0, pg_core_1.text)("sample_source"),
    sample_type: (0, pg_core_1.varchar)("sample_type", { length: 100 }),
    production_date: (0, pg_core_1.timestamp)("production_date"),
    expiry_date: (0, pg_core_1.timestamp)("expiry_date"),
    batch_number: (0, pg_core_1.varchar)("batch_number", { length: 100 }),
    // Analysis Details
    intended_use: (0, pg_core_1.text)("intended_use"),
    reference_standard: (0, pg_core_1.varchar)("reference_standard", { length: 100 }),
    test_category: (0, pg_core_1.varchar)("test_category", { length: 50 }),
    test_category_other: (0, pg_core_1.varchar)("test_category_other", { length: 255 }),
    requested_tests: (0, pg_core_1.jsonb)("requested_tests").default([]),
    // Additional fields
    sample_container: (0, pg_core_1.varchar)("sample_container", { length: 100 }),
    sample_volume: (0, pg_core_1.varchar)("sample_volume", { length: 50 }),
    sample_condition: (0, pg_core_1.varchar)("sample_condition", { length: 50 }),
    temperature_on_receipt: (0, pg_core_1.varchar)("temperature_on_receipt", { length: 50 }),
    sampling_point: (0, pg_core_1.text)("sampling_point"),
    manufacturer: (0, pg_core_1.varchar)("manufacturer", { length: 255 }),
    matrix: (0, pg_core_1.varchar)("matrix", { length: 100 }),
    // Official Use
    reference_standard_available: (0, pg_core_1.boolean)("reference_standard_available"),
    service_offered: (0, pg_core_1.boolean)("service_offered"),
    test_resources_available: (0, pg_core_1.boolean)("test_resources_available"),
    sample_quantity_sufficient: (0, pg_core_1.boolean)("sample_quantity_sufficient"),
    invoice_issued: (0, pg_core_1.boolean)("invoice_issued"),
    payment_confirmed: (0, pg_core_1.boolean)("payment_confirmed"),
    official_remarks: (0, pg_core_1.text)("official_remarks"),
    // Workflow
    status: (0, exports.requestStatusEnum)("status").default("pending"),
    sample_id: (0, pg_core_1.uuid)("sample_id").references(() => exports.samples.id),
    invoice_id: (0, pg_core_1.uuid)("invoice_id"),
    quotation_amount: (0, pg_core_1.real)("quotation_amount"),
    // Tracking
    received_by: (0, pg_core_1.uuid)("received_by").references(() => exports.users.id),
    reviewed_by: (0, pg_core_1.uuid)("reviewed_by").references(() => exports.users.id),
    approved_by: (0, pg_core_1.uuid)("approved_by").references(() => exports.users.id),
    reviewed_at: (0, pg_core_1.timestamp)("reviewed_at"),
    approved_at: (0, pg_core_1.timestamp)("approved_at"),
    rejection_reason: (0, pg_core_1.text)("rejection_reason"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("sample_requests_tenant_idx").on(t.tenant_id),
    clientIdx: (0, pg_core_1.index)("sample_requests_client_idx").on(t.client_id),
    statusIdx: (0, pg_core_1.index)("sample_requests_status_idx").on(t.status),
    numberIdx: (0, pg_core_1.index)("sample_requests_number_idx").on(t.request_number),
}));
// ─── Result Templates ─────────────────────────────────────────────────────────
exports.result_templates = exports.countrylabSchema.table("result_templates", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    nis_standard: (0, pg_core_1.varchar)("nis_standard", { length: 100 }),
    nis_standard_ref: (0, pg_core_1.varchar)("nis_standard_ref", { length: 100 }),
    effective_date: (0, pg_core_1.date)("effective_date"),
    version: (0, pg_core_1.integer)("version").default(1),
    parent_template_id: (0, pg_core_1.uuid)("parent_template_id").references(() => exports.result_templates.id),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_by: (0, pg_core_1.uuid)("created_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("result_templates_tenant_idx").on(t.tenant_id),
    activeIdx: (0, pg_core_1.index)("result_templates_active_idx").on(t.tenant_id, t.is_active),
}));
exports.result_template_parameters = exports.countrylabSchema.table("result_template_parameters", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    template_id: (0, pg_core_1.uuid)("template_id")
        .references(() => exports.result_templates.id, { onDelete: "cascade" })
        .notNull(),
    parameter_name: (0, pg_core_1.varchar)("parameter_name", { length: 255 }).notNull(),
    nis_limit: (0, pg_core_1.text)("nis_limit"),
    unit: (0, pg_core_1.varchar)("unit", { length: 50 }),
    parameter_group: (0, pg_core_1.varchar)("parameter_group", { length: 100 }),
    sequence_order: (0, pg_core_1.integer)("sequence_order").default(0),
    data_type: (0, pg_core_1.varchar)("data_type", { length: 20 }).default("numerical"),
    spec_min: (0, pg_core_1.real)("spec_min"),
    spec_max: (0, pg_core_1.real)("spec_max"),
}, (t) => ({
    templateIdx: (0, pg_core_1.index)("result_template_params_template_idx").on(t.template_id),
}));
// ─── Results ──────────────────────────────────────────────────────────────────
exports.results = exports.countrylabSchema.table("results", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    sample_id: (0, pg_core_1.uuid)("sample_id")
        .references(() => exports.samples.id)
        .notNull(),
    test_method_id: (0, pg_core_1.uuid)("test_method_id").references(() => exports.test_methods.id),
    analyst_id: (0, pg_core_1.uuid)("analyst_id")
        .references(() => exports.users.id)
        .notNull(),
    reviewer_id: (0, pg_core_1.uuid)("reviewer_id").references(() => exports.users.id),
    approver_id: (0, pg_core_1.uuid)("approver_id").references(() => exports.users.id),
    parameters: (0, pg_core_1.jsonb)("parameters").default([]),
    // [{param_name, raw_value, calculated_value, unit, spec_min, spec_max, pass, warning, data_type}]
    overall_status: (0, exports.resultStatusEnum)("overall_status").default("draft"),
    coa_url: (0, pg_core_1.text)("coa_url"),
    qr_hash: (0, pg_core_1.varchar)("qr_hash", { length: 64 }).unique(),
    qr_code_url: (0, pg_core_1.text)("qr_code_url"),
    reviewed_at: (0, pg_core_1.timestamp)("reviewed_at"),
    approved_at: (0, pg_core_1.timestamp)("approved_at"),
    locked_at: (0, pg_core_1.timestamp)("locked_at"),
    voided_at: (0, pg_core_1.timestamp)("voided_at"),
    void_reason: (0, pg_core_1.text)("void_reason"),
    notes: (0, pg_core_1.text)("notes"),
    template_id: (0, pg_core_1.uuid)("template_id").references(() => exports.result_templates.id),
    template_version: (0, pg_core_1.integer)("template_version"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("results_tenant_idx").on(t.tenant_id),
    sampleIdx: (0, pg_core_1.index)("results_sample_idx").on(t.sample_id),
    statusIdx: (0, pg_core_1.index)("results_status_idx").on(t.overall_status),
}));
// ─── Result Change Log ────────────────────────────────────────────────────────
exports.result_changes = exports.countrylabSchema.table("result_changes", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    result_id: (0, pg_core_1.uuid)("result_id")
        .references(() => exports.results.id)
        .notNull(),
    changed_by: (0, pg_core_1.uuid)("changed_by")
        .references(() => exports.users.id)
        .notNull(),
    reason: (0, pg_core_1.text)("reason").notNull(),
    old_parameters: (0, pg_core_1.jsonb)("old_parameters"),
    new_parameters: (0, pg_core_1.jsonb)("new_parameters"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ─── Reagents ─────────────────────────────────────────────────────────────────
exports.reagents = exports.countrylabSchema.table("reagents", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    product_type: (0, exports.productTypeEnum)("product_type").default("reagent"),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    chemical_name: (0, pg_core_1.varchar)("chemical_name", { length: 255 }),
    cas_number: (0, pg_core_1.varchar)("cas_number", { length: 50 }),
    catalog_number: (0, pg_core_1.varchar)("catalog_number", { length: 100 }),
    lot_number: (0, pg_core_1.varchar)("lot_number", { length: 100 }),
    manufacturer: (0, pg_core_1.varchar)("manufacturer", { length: 255 }),
    supplier_id: (0, pg_core_1.uuid)("supplier_id").references(() => exports.suppliers.id),
    grade: (0, exports.reagentGradeEnum)("grade"),
    category: (0, pg_core_1.varchar)("category", { length: 100 }), // Acid, Base, Solvent, etc.
    batch_number: (0, pg_core_1.varchar)("batch_number", { length: 100 }),
    quantity: (0, pg_core_1.real)("quantity").default(0),
    unit: (0, pg_core_1.varchar)("unit", { length: 50 }).default("units"),
    reorder_level: (0, pg_core_1.real)("reorder_level").default(10),
    unit_price: (0, pg_core_1.real)("unit_price").default(0),
    expiry_date: (0, pg_core_1.timestamp)("expiry_date"),
    storage_conditions: (0, pg_core_1.varchar)("storage_conditions", { length: 255 }),
    storage_location: (0, pg_core_1.varchar)("storage_location", { length: 200 }),
    is_active: (0, pg_core_1.boolean)("is_active").default(true),
    created_by: (0, pg_core_1.uuid)("created_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Assets ───────────────────────────────────────────────────────────────────
exports.assets = exports.countrylabSchema.table("assets", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    asset_tag: (0, pg_core_1.varchar)("asset_tag", { length: 100 }),
    model: (0, pg_core_1.varchar)("model", { length: 255 }),
    serial_number: (0, pg_core_1.varchar)("serial_number", { length: 255 }),
    manufacturer: (0, pg_core_1.varchar)("manufacturer", { length: 255 }),
    purchase_date: (0, pg_core_1.timestamp)("purchase_date"),
    warranty_expiry: (0, pg_core_1.timestamp)("warranty_expiry"),
    status: (0, exports.assetStatusEnum)("status").default("operational"),
    custodian_id: (0, pg_core_1.uuid)("custodian_id").references(() => exports.users.id),
    location: (0, pg_core_1.varchar)("location", { length: 255 }),
    calibration_frequency_days: (0, pg_core_1.integer)("calibration_frequency_days"),
    last_calibration_date: (0, pg_core_1.timestamp)("last_calibration_date"),
    next_calibration_date: (0, pg_core_1.timestamp)("next_calibration_date"),
    notes: (0, pg_core_1.text)("notes"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.asset_logs = exports.countrylabSchema.table("asset_logs", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    asset_id: (0, pg_core_1.uuid)("asset_id")
        .references(() => exports.assets.id)
        .notNull(),
    action: (0, pg_core_1.varchar)("action", { length: 100 }).notNull(), // calibrated, repaired, moved, assigned
    description: (0, pg_core_1.text)("description"),
    performed_by: (0, pg_core_1.uuid)("performed_by").references(() => exports.users.id),
    performed_at: (0, pg_core_1.timestamp)("performed_at").defaultNow(),
    next_due_date: (0, pg_core_1.timestamp)("next_due_date"),
    attachment_url: (0, pg_core_1.text)("attachment_url"),
});
// ─── Procurement ──────────────────────────────────────────────────────────────
exports.requisitions = exports.countrylabSchema.table("requisitions", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    requisition_number: (0, pg_core_1.varchar)("requisition_number", { length: 50 })
        .unique()
        .notNull(),
    prepared_by: (0, pg_core_1.uuid)("prepared_by")
        .references(() => exports.users.id)
        .notNull(),
    reviewed_by: (0, pg_core_1.uuid)("reviewed_by").references(() => exports.users.id),
    approved_by: (0, pg_core_1.uuid)("approved_by").references(() => exports.users.id),
    department: (0, pg_core_1.varchar)("department", { length: 100 }),
    urgency: (0, pg_core_1.varchar)("urgency", { length: 50 }).default("routine"), // routine | emergency
    required_date: (0, pg_core_1.timestamp)("required_date"),
    status: (0, exports.requisitionStatusEnum)("status").default("draft"),
    items: (0, pg_core_1.jsonb)("items").default([]),
    // [{item_name, quantity, unit, urgency, notes}]
    items_metadata: (0, pg_core_1.jsonb)("items_metadata").default([]),
    // Enhanced items with inventory links:
    // [{item_name, reagent_id?, asset_id?, quantity, unit, supplier_id?, estimated_price?, catalog_number?, notes?}]
    rejection_reason: (0, pg_core_1.text)("rejection_reason"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
exports.purchase_orders = exports.countrylabSchema.table("purchase_orders", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    po_number: (0, pg_core_1.varchar)("po_number", { length: 50 }).unique().notNull(),
    requisition_id: (0, pg_core_1.uuid)("requisition_id").references(() => exports.requisitions.id),
    supplier_id: (0, pg_core_1.uuid)("supplier_id").references(() => exports.suppliers.id),
    supplier_name: (0, pg_core_1.varchar)("supplier_name", { length: 255 }),
    supplier_contact: (0, pg_core_1.varchar)("supplier_contact", { length: 255 }),
    total_amount: (0, pg_core_1.real)("total_amount"),
    currency: (0, pg_core_1.varchar)("currency", { length: 10 }).default("NGN"),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("pending"), // pending | received | partial | cancelled
    invoice_url: (0, pg_core_1.text)("invoice_url"),
    notes: (0, pg_core_1.text)("notes"),
    ordered_by: (0, pg_core_1.uuid)("ordered_by").references(() => exports.users.id),
    ordered_at: (0, pg_core_1.timestamp)("ordered_at"),
    received_at: (0, pg_core_1.timestamp)("received_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ─── SOPs / Knowledge Base ────────────────────────────────────────────────────
exports.sops = exports.countrylabSchema.table("sops", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    document_number: (0, pg_core_1.varchar)("document_number", { length: 100 }),
    version: (0, pg_core_1.varchar)("version", { length: 20 }).default("1.0"),
    category: (0, pg_core_1.varchar)("category", { length: 100 }),
    document_url: (0, pg_core_1.text)("document_url"),
    status: (0, exports.sopStatusEnum)("status").default("draft"),
    submitted_by: (0, pg_core_1.uuid)("submitted_by").references(() => exports.users.id),
    reviewed_by: (0, pg_core_1.uuid)("reviewed_by").references(() => exports.users.id),
    approved_by: (0, pg_core_1.uuid)("approved_by").references(() => exports.users.id),
    parent_sop_id: (0, pg_core_1.uuid)("parent_sop_id"),
    linked_asset_id: (0, pg_core_1.uuid)("linked_asset_id").references(() => exports.assets.id),
    effective_date: (0, pg_core_1.timestamp)("effective_date"),
    review_date: (0, pg_core_1.timestamp)("review_date"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Invoices ─────────────────────────────────────────────────────────────────
exports.invoices = exports.countrylabSchema.table("invoices", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    invoice_number: (0, pg_core_1.varchar)("invoice_number", { length: 50 }).unique().notNull(),
    client_id: (0, pg_core_1.uuid)("client_id")
        .references(() => exports.clients.id)
        .notNull(),
    result_id: (0, pg_core_1.uuid)("result_id").references(() => exports.results.id),
    sample_id: (0, pg_core_1.uuid)("sample_id").references(() => exports.samples.id),
    line_items: (0, pg_core_1.jsonb)("line_items").default([]),
    // [{description, quantity, unit_price, amount}]
    subtotal: (0, pg_core_1.real)("subtotal").default(0),
    discount_type: (0, pg_core_1.varchar)("discount_type", { length: 20 }).default("percentage"),
    discount_value: (0, pg_core_1.real)("discount_value").default(0),
    discount_amount: (0, pg_core_1.real)("discount_amount").default(0),
    tax_rate: (0, pg_core_1.real)("tax_rate").default(0),
    tax_amount: (0, pg_core_1.real)("tax_amount").default(0),
    total: (0, pg_core_1.real)("total").default(0),
    currency: (0, pg_core_1.varchar)("currency", { length: 10 }).default("NGN"),
    status: (0, pg_core_1.varchar)("status", { length: 50 }).default("unpaid"), // unpaid | paid | partial | voided
    due_date: (0, pg_core_1.timestamp)("due_date"),
    paid_at: (0, pg_core_1.timestamp)("paid_at"),
    payment_method: (0, pg_core_1.varchar)("payment_method", { length: 100 }),
    notes: (0, pg_core_1.text)("notes"),
    created_by: (0, pg_core_1.uuid)("created_by").references(() => exports.users.id),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Tickets ──────────────────────────────────────────────────────────────────
exports.tickets = exports.countrylabSchema.table("tickets", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id, { onDelete: "cascade" })
        .notNull(),
    ticket_number: (0, pg_core_1.varchar)("ticket_number", { length: 50 }).unique().notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    description: (0, pg_core_1.text)("description"),
    source: (0, pg_core_1.varchar)("source", { length: 50 }).default("internal"), // internal | external
    type: (0, exports.ticketTypeEnum)("type").notNull(),
    status: (0, exports.ticketStatusEnum)("status").default("open"),
    priority: (0, pg_core_1.varchar)("priority", { length: 50 }).default("medium"), // low | medium | high | critical
    reported_by_user: (0, pg_core_1.uuid)("reported_by_user").references(() => exports.users.id),
    reported_by_client: (0, pg_core_1.uuid)("reported_by_client").references(() => exports.clients.id),
    assigned_to: (0, pg_core_1.uuid)("assigned_to").references(() => exports.users.id),
    resolution_notes: (0, pg_core_1.text)("resolution_notes"),
    resolution_rating: (0, pg_core_1.integer)("resolution_rating"),
    resolved_at: (0, pg_core_1.timestamp)("resolved_at"),
    closed_at: (0, pg_core_1.timestamp)("closed_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// ─── Audit Logs ───────────────────────────────────────────────────────────────
exports.audit_logs = exports.countrylabSchema.table("audit_logs", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id)
        .notNull(),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => exports.users.id),
    action: (0, pg_core_1.varchar)("action", { length: 100 }).notNull(),
    // CREATE | READ | UPDATE | DELETE | APPROVE | REJECT | LOGIN | LOGOUT | EXPORT
    table_name: (0, pg_core_1.varchar)("table_name", { length: 100 }),
    record_id: (0, pg_core_1.uuid)("record_id"),
    old_value: (0, pg_core_1.jsonb)("old_value"),
    new_value: (0, pg_core_1.jsonb)("new_value"),
    ip_address: (0, pg_core_1.varchar)("ip_address", { length: 50 }),
    user_agent: (0, pg_core_1.text)("user_agent"),
    metadata: (0, pg_core_1.jsonb)("metadata").default({}),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
}, (t) => ({
    tenantIdx: (0, pg_core_1.index)("audit_tenant_idx").on(t.tenant_id),
    userIdx: (0, pg_core_1.index)("audit_user_idx").on(t.user_id),
    actionIdx: (0, pg_core_1.index)("audit_action_idx").on(t.action),
    createdAtIdx: (0, pg_core_1.index)("audit_created_at_idx").on(t.created_at),
}));
// ─── Notifications ────────────────────────────────────────────────────────────
exports.notifications = exports.countrylabSchema.table("notifications", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    tenant_id: (0, pg_core_1.uuid)("tenant_id")
        .references(() => exports.tenants.id)
        .notNull(),
    user_id: (0, pg_core_1.uuid)("user_id")
        .references(() => exports.users.id)
        .notNull(),
    type: (0, pg_core_1.varchar)("type", { length: 100 }).notNull(),
    title: (0, pg_core_1.varchar)("title", { length: 500 }).notNull(),
    message: (0, pg_core_1.text)("message"),
    link: (0, pg_core_1.varchar)("link", { length: 500 }),
    is_read: (0, pg_core_1.boolean)("is_read").default(false),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// ─── Relations ────────────────────────────────────────────────────────────────
exports.tenantsRelations = (0, drizzle_orm_1.relations)(exports.tenants, ({ many }) => ({
    users: many(exports.users),
    clients: many(exports.clients),
    samples: many(exports.samples),
    results: many(exports.results),
    reagents: many(exports.reagents),
    assets: many(exports.assets),
}));
exports.usersRelations = (0, drizzle_orm_1.relations)(exports.users, ({ one, many }) => ({
    tenant: one(exports.tenants, { fields: [exports.users.tenant_id], references: [exports.tenants.id] }),
    assignedSamples: many(exports.samples),
    results: many(exports.results),
}));
exports.samplesRelations = (0, drizzle_orm_1.relations)(exports.samples, ({ one, many }) => ({
    tenant: one(exports.tenants, {
        fields: [exports.samples.tenant_id],
        references: [exports.tenants.id],
    }),
    client: one(exports.clients, {
        fields: [exports.samples.client_id],
        references: [exports.clients.id],
    }),
    analyst: one(exports.users, {
        fields: [exports.samples.assigned_analyst_id],
        references: [exports.users.id],
    }),
    results: many(exports.results),
}));
exports.resultsRelations = (0, drizzle_orm_1.relations)(exports.results, ({ one, many }) => ({
    tenant: one(exports.tenants, {
        fields: [exports.results.tenant_id],
        references: [exports.tenants.id],
    }),
    sample: one(exports.samples, {
        fields: [exports.results.sample_id],
        references: [exports.samples.id],
    }),
    analyst: one(exports.users, { fields: [exports.results.analyst_id], references: [exports.users.id] }),
    changes: many(exports.result_changes),
    template: one(exports.result_templates, {
        fields: [exports.results.template_id],
        references: [exports.result_templates.id],
    }),
}));
exports.suppliersRelations = (0, drizzle_orm_1.relations)(exports.suppliers, ({ one, many }) => ({
    tenant: one(exports.tenants, {
        fields: [exports.suppliers.tenant_id],
        references: [exports.tenants.id],
    }),
    reagents: many(exports.reagents),
    purchaseOrders: many(exports.purchase_orders),
}));
exports.reagentsRelations = (0, drizzle_orm_1.relations)(exports.reagents, ({ one }) => ({
    tenant: one(exports.tenants, {
        fields: [exports.reagents.tenant_id],
        references: [exports.tenants.id],
    }),
    supplier: one(exports.suppliers, {
        fields: [exports.reagents.supplier_id],
        references: [exports.suppliers.id],
    }),
}));
exports.resultTemplatesRelations = (0, drizzle_orm_1.relations)(exports.result_templates, ({ one, many }) => ({
    tenant: one(exports.tenants, {
        fields: [exports.result_templates.tenant_id],
        references: [exports.tenants.id],
    }),
    createdBy: one(exports.users, {
        fields: [exports.result_templates.created_by],
        references: [exports.users.id],
    }),
    parentTemplate: one(exports.result_templates, {
        fields: [exports.result_templates.parent_template_id],
        references: [exports.result_templates.id],
        relationName: "templateVersions",
    }),
    childTemplates: many(exports.result_templates, {
        relationName: "templateVersions",
    }),
    parameters: many(exports.result_template_parameters),
    results: many(exports.results),
}));
exports.resultTemplateParametersRelations = (0, drizzle_orm_1.relations)(exports.result_template_parameters, ({ one }) => ({
    template: one(exports.result_templates, {
        fields: [exports.result_template_parameters.template_id],
        references: [exports.result_templates.id],
    }),
}));
//# sourceMappingURL=index.js.map