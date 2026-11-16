// ─── Staff email notifications ────────────────────────────────────────────────
// Emails staff by role when work moves through the lab:
//   • new client / new sample  → Operations Manager, GM, MD (client + sample)
//   • new / assigned sample    → Lab Manager, Lab Analysts (sample only, no client)
//   • result finally approved  → Secretary (ready for printing)
// Recipients are the active users holding those roles in the tenant, at the
// email address on their user account. Every send also drops an in-app
// notification for the same people.
//
// Callers fire these with notifyInBackground() so a slow or failing SMTP
// server never delays or breaks the request that triggered them.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { clients, results, samples, tenants, users } from "../db/schema";
import { logger } from "../utils/logger";
import { FROM_EMAIL, FROM_NAME, getTransporter } from "./emailService";
import { sendNotification } from "./notificationService";

export const MANAGEMENT_ROLES = ["operations_manager", "general_manager", "md"];
export const LAB_ROLES = ["lab_manager", "lab_analyst"];
export const SECRETARY_ROLES = ["secretary"];

interface Staff {
  id: string;
  email: string;
  full_name: string;
}

type Row = [label: string, value: unknown];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Run a notification without awaiting it; failures are logged, never thrown. */
export function notifyInBackground(label: string, task: () => Promise<unknown>) {
  task().catch((error) => logger.error(`Staff notification failed (${label}):`, error));
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function appLink(path: string): string {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  return `${base}${path}`;
}

async function staffByRoles(tenantId: string, roles: string[]): Promise<Staff[]> {
  return db
    .select({ id: users.id, email: users.email, full_name: users.full_name })
    .from(users)
    .where(
      and(eq(users.tenant_id, tenantId), eq(users.is_active, true), inArray(users.role, roles)),
    );
}

async function staffByIds(tenantId: string, ids: string[]): Promise<Staff[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: users.id, email: users.email, full_name: users.full_name })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.is_active, true), inArray(users.id, ids)));
}

function uniqueStaff(...groups: Staff[][]): Staff[] {
  const seen = new Map<string, Staff>();
  for (const s of groups.flat()) {
    const key = s.email?.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()];
}

async function labName(tenantId: string): Promise<string> {
  const [t] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return t?.name || FROM_NAME;
}

export function renderEmail(opts: {
  lab: string;
  heading: string;
  intro: string;
  sections: { title: string; rows: Row[] }[];
  link?: { href: string; label: string };
  /** Trusted HTML placed after the sections (callers escape their own values) */
  html?: string;
  /** Replaces the default staff-notification footer */
  footer?: string;
}): string {
  const sections = opts.sections
    .map((section) => {
      const rows = section.rows
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:bold;width:190px;vertical-align:top">${esc(label)}</td>
              <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827">${esc(value)}</td>
            </tr>`,
        )
        .join("");
      if (!rows) return "";
      return `
        <h3 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:1px;color:#1e40af">${esc(section.title)}</h3>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;font-size:14px">${rows}</table>`;
    })
    .join("");

  const button = opts.link
    ? `<div style="text-align:center;margin:28px 0 8px">
         <a href="${esc(opts.link.href)}" style="display:inline-block;background:#1e40af;color:#fff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold">${esc(opts.link.label)}</a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font-family:Arial,sans-serif;line-height:1.5;color:#333;background:#f3f4f6">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#1f2937;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <div style="font-size:12px;opacity:.75;text-transform:uppercase;letter-spacing:1px">${esc(opts.lab)}</div>
      <h2 style="margin:4px 0 0;font-size:20px">${esc(opts.heading)}</h2>
    </div>
    <div style="background:#f9fafb;padding:24px;border-radius:0 0 8px 8px">
      <p style="margin:0">${esc(opts.intro)}</p>
      ${sections}
      ${opts.html ?? ""}
      ${button}
      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px">
        ${opts.footer ?? `Automated notification from ${esc(opts.lab)} LMS. Please do not reply to this email.`}
      </p>
    </div>
  </div>
</body></html>`;
}

/** Send one message per recipient so a single bad address can't block the rest. */
async function sendToStaff(recipients: Staff[], subject: string, html: string, label: string) {
  if (recipients.length === 0) {
    logger.warn(`No active staff to email for ${label}`);
    return;
  }
  const transporter = getTransporter();
  if (!transporter) {
    logger.warn(`Email transporter not available, skipping ${label} emails`);
    return;
  }
  const outcomes = await Promise.allSettled(
    recipients.map((r) =>
      transporter.sendMail({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to: r.email, subject, html }),
    ),
  );
  outcomes.forEach((o, i) => {
    if (o.status === "rejected") {
      logger.error(`Failed to email ${recipients[i].email} (${label}):`, o.reason);
    }
  });
  const sent = outcomes.filter((o) => o.status === "fulfilled").length;
  logger.info(`${label}: emailed ${sent}/${recipients.length} staff`);
}

// ─── Row builders ─────────────────────────────────────────────────────────────

type ClientRow = typeof clients.$inferSelect;
type SampleRow = typeof samples.$inferSelect;

function clientRows(c: ClientRow): Row[] {
  const address = [c.address, c.city, c.state, c.country].filter(Boolean).join(", ");
  return [
    ["Client / Establishment", c.name],
    ["Company", c.company],
    ["Contact Person", c.contact_person],
    ["Email", c.email],
    ["Phone", c.phone],
    ["Address", address],
  ];
}

/** Sample details only. Deliberately excludes the client and manufacturer. */
function sampleRows(s: SampleRow, analystName?: string | null): Row[] {
  return [
    ["Lab No.", s.ulid],
    ["Sample", s.name],
    ["Sample Type / Matrix", s.matrix],
    ["Description / Label", s.description],
    ["Sample Container", s.sample_container],
    ["Sample Volume / Size", s.sample_volume],
    ["Received Condition", s.sample_condition],
    ["Temperature on Receipt", s.temperature_on_receipt],
    ["Reference Standard", s.reference_standard],
    ["Batch No.", s.batch_number],
    ["Sampling Point", s.sampling_point],
    ["Collection Date", fmtDate(s.collection_date)],
    ["Production Date", fmtDate(s.production_date)],
    ["Expiry Date", fmtDate(s.expiry_date)],
    ["Receiving Date", fmtDate(s.received_at)],
    ["Storage", [s.storage_zone, s.storage_location].filter(Boolean).join(" / ")],
    ["Assigned Analyst", analystName],
    ["Notes", s.notes],
  ];
}

async function loadSample(tenantId: string, sampleId: string) {
  const [sample] = await db
    .select()
    .from(samples)
    .where(and(eq(samples.id, sampleId), eq(samples.tenant_id, tenantId)))
    .limit(1);
  if (!sample) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, sample.client_id)).limit(1);
  let analystName: string | null = null;
  if (sample.assigned_analyst_id) {
    const [a] = await db
      .select({ full_name: users.full_name })
      .from(users)
      .where(eq(users.id, sample.assigned_analyst_id))
      .limit(1);
    analystName = a?.full_name ?? null;
  }
  return { sample, client: client ?? null, analystName };
}

// ─── Events ───────────────────────────────────────────────────────────────────

/** New client registered → Operations Manager, GM, MD. */
export async function notifyClientRegistered(params: {
  tenantId: string;
  clientId: string;
  registeredBy?: string | null;
}) {
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, params.clientId), eq(clients.tenant_id, params.tenantId)))
    .limit(1);
  if (!client) return;

  const lab = await labName(params.tenantId);
  const recipients = uniqueStaff(await staffByRoles(params.tenantId, MANAGEMENT_ROLES));
  const html = renderEmail({
    lab,
    heading: "New Client Registered",
    intro: `A new client has been registered${params.registeredBy ? ` by ${params.registeredBy}` : ""}.`,
    sections: [
      { title: "Client Information", rows: [...clientRows(client), ["Registered On", fmtDate(client.created_at)]] },
    ],
    link: { href: appLink("/clients"), label: "View Clients" },
  });

  await Promise.all([
    sendToStaff(recipients, `New Client Registered – ${client.name}`, html, "client registered"),
    sendNotification({
      tenant_id: params.tenantId,
      type: "CLIENT_REGISTERED",
      title: "New Client Registered",
      message: `${client.name}${client.company ? ` (${client.company})` : ""} was registered.`,
      roles: MANAGEMENT_ROLES,
      link: "/clients",
    }),
  ]);
}

/**
 * New sample registered.
 *   Management gets client + sample details.
 *   Lab Manager and all Lab Analysts get sample details only.
 */
export async function notifySampleRegistered(params: {
  tenantId: string;
  sampleId: string;
  registeredBy?: string | null;
}) {
  const loaded = await loadSample(params.tenantId, params.sampleId);
  if (!loaded) return;
  const { sample, client, analystName } = loaded;
  const lab = await labName(params.tenantId);
  const by = params.registeredBy ? ` by ${params.registeredBy}` : "";
  const link = { href: appLink(`/samples/${sample.id}`), label: "Open Sample" };

  const management = uniqueStaff(await staffByRoles(params.tenantId, MANAGEMENT_ROLES));
  const managementHtml = renderEmail({
    lab,
    heading: "New Sample Registered",
    intro: `A new sample has been registered${by}.`,
    sections: [
      { title: "Client Information", rows: client ? clientRows(client) : [] },
      { title: "Sample Information", rows: sampleRows(sample, analystName) },
    ],
    link,
  });

  const labStaff = uniqueStaff(await staffByRoles(params.tenantId, LAB_ROLES));
  const labHtml = renderEmail({
    lab,
    heading: "New Sample for Analysis",
    intro: `A new sample has been registered for laboratory analysis${by}.`,
    sections: [{ title: "Sample Information", rows: sampleRows(sample, analystName) }],
    link,
  });

  const subject = `New Sample Registered – ${sample.ulid}`;
  await Promise.all([
    sendToStaff(management, subject, managementHtml, "sample registered (management)"),
    sendToStaff(labStaff, subject, labHtml, "sample registered (lab)"),
    sendNotification({
      tenant_id: params.tenantId,
      type: "SAMPLE_REGISTERED",
      title: "New Sample Registered",
      message: `${sample.ulid} – ${sample.name}`,
      roles: [...MANAGEMENT_ROLES, ...LAB_ROLES],
      link: `/samples/${sample.id}`,
    }),
  ]);
}

/** Sample assigned to an analyst after registration → that analyst + Lab Manager (sample only). */
export async function notifySampleAssigned(params: {
  tenantId: string;
  sampleId: string;
  analystId: string;
  assignedBy?: string | null;
}) {
  const loaded = await loadSample(params.tenantId, params.sampleId);
  if (!loaded) return;
  const { sample, analystName } = loaded;
  const lab = await labName(params.tenantId);

  const recipients = uniqueStaff(
    await staffByIds(params.tenantId, [params.analystId]),
    await staffByRoles(params.tenantId, ["lab_manager"]),
  );
  const html = renderEmail({
    lab,
    heading: "Sample Assigned for Analysis",
    intro: `Sample ${sample.ulid} has been assigned to ${analystName || "an analyst"}${
      params.assignedBy ? ` by ${params.assignedBy}` : ""
    }.`,
    sections: [{ title: "Sample Information", rows: sampleRows(sample, analystName) }],
    link: { href: appLink(`/samples/${sample.id}`), label: "Open Sample" },
  });

  await Promise.all([
    sendToStaff(recipients, `Sample Assigned – ${sample.ulid}`, html, "sample assigned"),
    sendNotification({
      tenant_id: params.tenantId,
      type: "SAMPLE_ASSIGNED",
      title: "Sample Assigned",
      message: `${sample.ulid} – ${sample.name} assigned to ${analystName || "an analyst"}.`,
      user_ids: [params.analystId],
      roles: ["lab_manager"],
      link: `/samples/${sample.id}`,
    }),
  ]);
}

/** Result has passed final management approval → Secretary, ready for printing. */
export async function notifyResultReadyForPrinting(params: {
  tenantId: string;
  resultId: string;
  approvedBy?: string | null;
}) {
  const [result] = await db
    .select()
    .from(results)
    .where(and(eq(results.id, params.resultId), eq(results.tenant_id, params.tenantId)))
    .limit(1);
  if (!result) return;
  const loaded = await loadSample(params.tenantId, result.sample_id);
  if (!loaded) return;
  const { sample, client } = loaded;
  const lab = await labName(params.tenantId);

  const recipients = uniqueStaff(await staffByRoles(params.tenantId, SECRETARY_ROLES));
  const html = renderEmail({
    lab,
    heading: "Result Approved – Ready for Printing",
    intro:
      "The final analysis and result approval have been completed. The Certificate of Analysis is ready for printing.",
    sections: [
      {
        title: "Certificate",
        rows: [
          ["Certificate / Lab No.", sample.ulid],
          ["Sample", sample.name],
          ["Sample Type", sample.matrix],
          ["Client / Establishment", client?.name],
          ["Company", client?.company],
          ["Approved By", params.approvedBy],
          ["Approved On", fmtDate(result.approved_at)],
        ],
      },
    ],
    link: { href: appLink(`/results/${result.id}`), label: "Open Result & Download PDF" },
  });

  await Promise.all([
    sendToStaff(recipients, `Ready for Printing – Certificate ${sample.ulid}`, html, "result ready for printing"),
    sendNotification({
      tenant_id: params.tenantId,
      type: "RESULT_READY_FOR_PRINTING",
      title: "Result Ready for Printing",
      message: `Certificate for ${sample.ulid} – ${sample.name} has been approved and is ready for printing.`,
      roles: SECRETARY_ROLES,
      link: `/results/${result.id}`,
    }),
  ]);
}
