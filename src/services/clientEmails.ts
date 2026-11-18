// ─── Client-facing emails ─────────────────────────────────────────────────────
//   • Invoice raised           → client, with items, totals and bank details
//   • Certificate sent         → client, with the CoA PDF attached
// Replies go to the lab's own inbox (Settings → Organization email), since
// mail is sent from a no-reply address.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { clients, invoices, results, samples } from "../db/schema";
import { AppError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import {
  FROM_EMAIL,
  FROM_NAME,
  bankDetailsHtml,
  getOrgDetails,
  getTransporter,
  type OrgDetails,
} from "./emailService";
import { fmtDate, renderEmail } from "./staffNotifications";
import { esc, itemsTable, notice, orgFooter, paragraph, sectionTitle } from "./emailLayout";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function clientFooter(org: OrgDetails): string {
  return orgFooter(
    { name: org.name, address: org.address, email: org.email, phone: org.phone },
    "You can reply to this email to reach us.",
  );
}

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  const n = Number(amount ?? 0);
  const formatted = n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (currency || "NGN") === "NGN" ? `₦${formatted}` : `${currency} ${formatted}`;
}

async function deliver(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo: string | null;
  attachments?: { filename: string; content: string; contentType?: string }[];
}) {
  const transporter = getTransporter();
  if (!transporter) throw new AppError(503, "Email is not configured on the server");
  try {
    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      replyTo: opts.replyTo || undefined,
      attachments: opts.attachments,
    });
  } catch (error: any) {
    logger.error(`Failed to email ${opts.to} (${opts.subject}):`, error);
    throw new AppError(502, `The email could not be sent: ${error?.message || "unknown error"}`);
  }
}

// ─── Invoice ──────────────────────────────────────────────────────────────────

/** Email an invoice to its client. Throws AppError when it can't be sent. */
export async function sendInvoiceEmail(params: {
  tenantId: string;
  invoiceId: string;
  to?: string;
}): Promise<{ sentTo: string }> {
  const [row] = await db
    .select({ invoice: invoices, client: clients, sample: samples })
    .from(invoices)
    .leftJoin(clients, eq(invoices.client_id, clients.id))
    .leftJoin(samples, eq(invoices.sample_id, samples.id))
    .where(and(eq(invoices.id, params.invoiceId), eq(invoices.tenant_id, params.tenantId)))
    .limit(1);
  if (!row) throw new AppError(404, "Invoice not found");
  const { invoice, client, sample } = row;
  if (invoice.status === "voided") throw new AppError(400, "A voided invoice can't be emailed");

  const to = (params.to || client?.email || "").trim();
  if (!to) throw new AppError(400, "The client has no email address. Add one to the client first.");
  if (!EMAIL_RE.test(to)) throw new AppError(400, `"${to}" is not a valid email address`);

  const org = await getOrgDetails(params.tenantId);
  const html = buildInvoiceEmailHtml({ invoice, client, sample, org });

  await deliver({
    to,
    subject: `Invoice ${invoice.invoice_number} from ${org.name}`,
    html,
    replyTo: org.email,
  });
  logger.info(`Invoice ${invoice.invoice_number} emailed to ${to}`);
  return { sentTo: to };
}

/** Invoice email body. Pure, so it can be previewed without a database. */
export function buildInvoiceEmailHtml({
  invoice,
  client,
  sample,
  org,
}: {
  invoice: typeof invoices.$inferSelect;
  client: typeof clients.$inferSelect | null;
  sample: typeof samples.$inferSelect | null;
  org: OrgDetails;
}): string {
  const cur = invoice.currency;
  const discount = Number(invoice.discount_amount || 0);
  const tax = Number(invoice.tax_amount || 0);

  return renderEmail({
    lab: org.name,
    logoUrl: org.logoUrl,
    eyebrow: "Invoice",
    heading: `Invoice ${invoice.invoice_number}`,
    intro: `Dear ${client?.contact_person || client?.name || "Customer"}, please find below your invoice from ${org.name}.`,
    sections: [
      {
        title: "Invoice Details",
        rows: [
          ["Invoice No.", invoice.invoice_number],
          ["Date", fmtDate(invoice.created_at)],
          ["Due Date", fmtDate(invoice.due_date)],
          ["Billed To", [client?.name, client?.company].filter(Boolean).join(" – ")],
          ["Sample", sample ? `${sample.ulid} – ${sample.name}` : null],
        ],
      },
    ],
    html: [
      sectionTitle("Items"),
      itemsTable({
        columns: [
          { label: "Description" },
          { label: "Qty", align: "center", width: "48px" },
          { label: "Unit Price", align: "right" },
          { label: "Amount", align: "right" },
        ],
        rows: ((invoice.line_items as any[]) || []).map((li) => [
          String(li.description ?? ""),
          String(li.quantity ?? ""),
          money(li.unit_price, cur),
          money(li.amount, cur),
        ]),
        totals: [
          { label: "Subtotal", value: money(invoice.subtotal, cur) },
          ...(discount > 0 ? [{ label: "Discount", value: `- ${money(discount, cur)}` }] : []),
          ...(tax > 0 ? [{ label: `VAT (${invoice.tax_rate}%)`, value: money(tax, cur) }] : []),
          { label: "Total Due", value: money(invoice.total, cur), strong: true },
        ],
      }),
      invoice.notes ? paragraph(`<strong>Notes:</strong> ${esc(invoice.notes)}`, { html: true }) : "",
      invoice.status === "paid"
        ? notice("<strong>This invoice has been paid.</strong> Thank you.")
        : sectionTitle("Payment Details") +
          bankDetailsHtml(org, invoice.invoice_number) +
          paragraph("After payment, please reply to this email with your proof of payment."),
    ].join(""),
    footer: clientFooter(org),
  });
}

// ─── Certificate of Analysis ──────────────────────────────────────────────────

const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Email an approved result's Certificate of Analysis PDF to the client. */
export async function sendResultToClient(params: {
  tenantId: string;
  resultId: string;
  to?: string;
  pdfBase64: string;
  message?: string;
}): Promise<{ sentTo: string; sampleId: string }> {
  const [row] = await db
    .select({ result: results, sample: samples, client: clients })
    .from(results)
    .innerJoin(samples, eq(results.sample_id, samples.id))
    .leftJoin(clients, eq(samples.client_id, clients.id))
    .where(and(eq(results.id, params.resultId), eq(results.tenant_id, params.tenantId)))
    .limit(1);
  if (!row) throw new AppError(404, "Result not found");
  const { result, sample, client } = row;
  if (result.overall_status !== "approved") {
    throw new AppError(400, "Only approved results can be sent to the client");
  }

  const to = (params.to || client?.email || "").trim();
  if (!to) throw new AppError(400, "The client has no email address. Enter one to send the certificate.");
  if (!EMAIL_RE.test(to)) throw new AppError(400, `"${to}" is not a valid email address`);

  const pdf = params.pdfBase64.replace(/^data:application\/pdf;[^,]*,/, "");
  const bytes = Buffer.from(pdf, "base64");
  if (bytes.length === 0 || bytes.subarray(0, 4).toString() !== "%PDF") {
    throw new AppError(400, "The certificate PDF is missing or invalid");
  }
  if (bytes.length > MAX_PDF_BYTES) throw new AppError(400, "The certificate PDF is too large to email");

  const org = await getOrgDetails(params.tenantId);
  const verifyBase = (process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/+$/, "");
  const verifyUrl = result.qr_hash && verifyBase ? `${verifyBase}/verify/${result.qr_hash}` : null;

  const html = renderEmail({
    lab: org.name,
    logoUrl: org.logoUrl,
    eyebrow: "Certificate of Analysis",
    heading: "Your Certificate of Analysis",
    intro: `Dear ${client?.contact_person || client?.name || "Customer"}, the analysis of your sample is complete. Your Certificate of Analysis is attached to this email.`,
    sections: [
      {
        title: "Sample",
        rows: [
          ["Certificate / Lab No.", sample.ulid],
          ["Sample", sample.name],
          ["Batch No.", sample.batch_number],
          ["Date Received", fmtDate(sample.received_at)],
          ["Date Approved", fmtDate(result.approved_at)],
        ],
      },
    ],
    html: params.message?.trim()
      ? notice(esc(params.message.trim()).replace(/\n/g, "<br/>"))
      : "",
    link: verifyUrl ? { href: verifyUrl, label: "Verify Certificate Online" } : undefined,
    footer: clientFooter(org),
  });

  const safeId = sample.ulid.replace(/[\\/:*?"<>|]+/g, "-");
  await deliver({
    to,
    subject: `Certificate of Analysis – ${sample.ulid} (${sample.name})`,
    html,
    replyTo: org.email,
    attachments: [{ filename: `CoA-${safeId}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  logger.info(`Certificate ${sample.ulid} emailed to ${to}`);
  return { sentTo: to, sampleId: sample.ulid };
}
