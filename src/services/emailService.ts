import { logger } from "../utils/logger";
import {
  BRAND,
  button,
  detailRows,
  detailSection,
  emailShell,
  esc,
  highlight,
  notice,
  orgFooter,
  paragraph,
  sectionTitle,
  steps,
} from "./emailLayout";

// ─── Email delivery ───────────────────────────────────────────────────────────
// Sends through Resend's HTTP API when RESEND_API_KEY is set, otherwise falls
// back to SMTP. Resend goes over HTTPS, so it works on hosts (e.g. Railway)
// that block outbound SMTP ports. Both expose the same sendMail() shape so
// every caller stays provider-agnostic.

export interface MailAttachment {
  filename: string;
  /** Base64-encoded file content */
  content: string;
  contentType?: string;
}

export interface MailMessage {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<unknown>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function createResendTransport(apiKey: string): MailTransport {
  return {
    async sendMail({ from, to, subject, html, replyTo, attachments }) {
      const res = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
          ...(attachments?.length
            ? {
                attachments: attachments.map((a) => ({
                  filename: a.filename,
                  content: a.content,
                  ...(a.contentType ? { content_type: a.contentType } : {}),
                })),
              }
            : {}),
        }),
        // Fail fast rather than holding the request open
        signal: AbortSignal.timeout(15_000),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          `Resend rejected the email (${res.status}): ${body?.message || body?.name || res.statusText}`,
        );
      }
      return body; // { id }
    },
  };
}

let transporter: MailTransport | null = null;

export function getTransporter(): MailTransport | null {
  if (!transporter && process.env.RESEND_API_KEY) {
    transporter = createResendTransport(process.env.RESEND_API_KEY);
    logger.info("Email provider: Resend");
  }
  if (!transporter) {
    try {
      const nodemailer = require("nodemailer");
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        // Fail fast: where outbound SMTP is blocked the connection otherwise
        // hangs ~2 minutes and the invite/reset request waits with it
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      const smtp = transporter as any;
      transporter = {
        sendMail: (m: MailMessage) =>
          smtp.sendMail({
            ...m,
            attachments: m.attachments?.map((a) => ({
              filename: a.filename,
              content: a.content,
              encoding: "base64",
              contentType: a.contentType,
            })),
          }),
      };
      logger.info("Email provider: SMTP");
    } catch (error) {
      logger.error("Failed to initialize email transporter:", error);
      return null;
    }
  }
  return transporter;
}

export const FROM_EMAIL = process.env.FROM_EMAIL || "info@countrylab.com.ng";
export const FROM_NAME = process.env.FROM_NAME || "Countrylab Laboratory";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "info@countrylab.com.ng";

// ─── Organisation details for client-facing emails ────────────────────────────

export interface BankAccount {
  bank_name: string;
  account_name: string;
  account_number: string;
  label?: string;
  is_active?: boolean;
}

export interface OrgDetails {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  logoUrl: string | null;
  bankAccounts: BankAccount[];
}

export async function getOrgDetails(tenantId: string): Promise<OrgDetails> {
  const { db } = await import("../db");
  const { tenants } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const accounts = ((t?.settings as any)?.bank_accounts ?? []) as BankAccount[];
  return {
    name: t?.name || FROM_NAME,
    phone: t?.phone || null,
    email: t?.email || null,
    address: t?.address || null,
    logoUrl: t?.logo_url && /^https:\/\//.test(t.logo_url) ? t.logo_url : null,
    bankAccounts: accounts.filter((a) => a && a.is_active !== false && a.account_number),
  };
}

async function orgOrNull(tenantId?: string): Promise<OrgDetails | null> {
  if (!tenantId) return null;
  try {
    return await getOrgDetails(tenantId);
  } catch (error) {
    logger.warn("Could not load organisation details for email:", error);
    return null;
  }
}

/** Fallback when no organisation record is available (e.g. no tenant). */
function defaultOrg(): OrgDetails {
  return { name: FROM_NAME, phone: null, email: null, address: null, logoUrl: null, bankAccounts: [] };
}

function frontendBase(): string {
  return (process.env.FRONTEND_URL || "").split(",")[0].trim().replace(/\/+$/, "");
}

/** Payment instructions from Settings → Bank Accounts. */
export function bankDetailsHtml(org: OrgDetails, reference: string): string {
  if (org.bankAccounts.length === 0) {
    return paragraph(
      `Please contact us${org.phone ? ` on ${esc(org.phone)}` : ""}${
        org.email ? ` or at ${esc(org.email)}` : ""
      } for payment details, quoting <strong>${esc(reference)}</strong>.`,
      { html: true },
    );
  }
  const accounts = org.bankAccounts
    .map((a) =>
      notice(
        `${a.label ? `<div style="font-weight:700;color:${BRAND.navy};margin-bottom:6px">${esc(a.label)}</div>` : ""}
         ${detailRows([
           ["Bank", a.bank_name],
           ["Account Name", a.account_name],
           ["Account Number", a.account_number],
         ])}`,
      ),
    )
    .join("");
  return `${accounts}${paragraph(`Please use <strong>${esc(reference)}</strong> as the payment reference.`, { html: true })}`;
}

function clientFooter(org: OrgDetails): string {
  return orgFooter(
    { name: org.name, address: org.address, email: org.email || FROM_EMAIL, phone: org.phone },
    "You can reply to this email to reach us.",
  );
}

function staffFooter(org: OrgDetails): string {
  return orgFooter({ name: org.name }, "This is an automated message. Please do not reply.");
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ─── Online sample request: confirmation ──────────────────────────────────────

interface RequestConfirmationData {
  tenantId: string;
  requestNumber: string;
  clientName: string;
  clientEmail: string;
  representativeName?: string;
  representativeEmail?: string;
  productName: string;
  testCategory: string;
}

export async function sendRequestConfirmation(data: RequestConfirmationData) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      logger.warn("Email transporter not available, skipping email");
      return false;
    }

    const org = await getOrgDetails(data.tenantId);
    const {
      requestNumber,
      clientName,
      clientEmail,
      representativeName,
      representativeEmail,
      productName,
      testCategory,
    } = data;
    const submitted = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const contactEmail = org.email || FROM_EMAIL;

    // Email to client
    const clientEmailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: clientEmail,
      replyTo: org.email || undefined,
      subject: `Request Confirmation - ${requestNumber}`,
      html: emailShell({
        orgName: org.name,
        logoUrl: org.logoUrl,
        eyebrow: "Request Received",
        title: "We've received your request",
        preheader: `Request ${requestNumber} received. We'll send a quotation within 24 hours.`,
        content: [
          paragraph(`Dear ${clientName},`),
          paragraph(
            `Thank you for choosing ${org.name}. We have received your sample analysis request. Our team will review it and contact you within 24 hours with a detailed quotation.`,
          ),
          highlight("Your request number", requestNumber, { mono: true }),
          paragraph("Please keep this number to track your request."),
          detailSection("Request Details", [
            ["Product", productName],
            ["Test Category", titleCase(testCategory)],
            ["Submitted", submitted],
          ]),
          sectionTitle("What Happens Next"),
          steps([
            "Our team reviews your request",
            "We prepare a detailed quotation",
            "You receive the quotation by email",
            "After payment, we schedule sample collection or drop-off",
            "Testing begins and your results are delivered",
          ]),
          button(`mailto:${contactEmail}`, "Contact Us"),
        ].join(""),
        footer: clientFooter(org),
      }),
    };

    // Email to representative (if different)
    let representativeEmailContent = null;
    if (representativeEmail && representativeEmail !== clientEmail) {
      representativeEmailContent = {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: representativeEmail,
        replyTo: org.email || undefined,
        subject: `Request Confirmation - ${requestNumber}`,
        html: emailShell({
          orgName: org.name,
          logoUrl: org.logoUrl,
          eyebrow: "Request Received",
          title: "Request submitted",
          preheader: `A request was submitted on behalf of ${clientName}.`,
          content: [
            paragraph(`Dear ${representativeName || "Representative"},`),
            paragraph(`A sample analysis request has been submitted on behalf of ${clientName}.`),
            highlight("Request number", requestNumber, { mono: true }),
            paragraph(
              "Our team will contact you within 24 hours with a detailed quotation. Please quote the request number above in any enquiry.",
            ),
          ].join(""),
          footer: clientFooter(org),
        }),
      };
    }

    // Internal notification to the company inbox
    const companyEmailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: COMPANY_EMAIL,
      subject: `New Sample Request - ${requestNumber}`,
      html: emailShell({
        orgName: org.name,
        logoUrl: org.logoUrl,
        eyebrow: "Action Required",
        title: "New sample request",
        preheader: `${clientName} submitted request ${requestNumber}.`,
        content: [
          notice("<strong>A new request needs review and a quotation.</strong>", "warning"),
          detailSection("Request", [
            ["Request Number", requestNumber],
            ["Client", clientName],
            ["Email", clientEmail],
            ["Representative", representativeName],
            ["Product", productName],
            ["Test Category", titleCase(testCategory)],
            ["Submitted", submitted],
          ]),
          sectionTitle("Next Steps"),
          steps(["Review the request in the system", "Prepare the quotation", "Contact the client within 24 hours"]),
          frontendBase() ? button(`${frontendBase()}/requests`, "Open Requests") : "",
        ].join(""),
        footer: staffFooter(org),
      }),
    };

    // Send emails
    const promises = [
      transporter.sendMail(clientEmailContent),
      transporter.sendMail(companyEmailContent),
    ];

    if (representativeEmailContent) {
      promises.push(transporter.sendMail(representativeEmailContent));
    }

    await Promise.all(promises);

    logger.info(`Request confirmation emails sent for ${requestNumber}`);
    return true;
  } catch (error) {
    logger.error("Failed to send request confirmation emails:", error);
    // Don't throw error - email failure shouldn't block request creation
    return false;
  }
}

// ─── Password reset ───────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(data: {
  tenantId?: string;
  recipientEmail: string;
  recipientName: string;
  resetLink: string;
}) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      logger.warn("Email transporter not available, skipping password reset email");
      return false;
    }

    const { recipientEmail, recipientName, resetLink } = data;
    const org = (await orgOrNull(data.tenantId)) ?? defaultOrg();

    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `Reset your ${org.name} password`,
      html: emailShell({
        orgName: org.name,
        logoUrl: org.logoUrl,
        eyebrow: "Account Security",
        title: "Reset your password",
        preheader: "Use this link to set a new password. It expires in 24 hours.",
        content: [
          paragraph(`Hello ${recipientName},`),
          paragraph("A password reset was requested for your account. Use the button below to set a new password."),
          button(resetLink, "Reset My Password"),
          paragraph("Or copy and paste this link into your browser:"),
          `<p style="margin:0 0 16px;font-family:${BRAND.mono};font-size:12px;line-height:1.5;word-break:break-all;color:${BRAND.muted}">${esc(resetLink)}</p>`,
          notice(
            "<strong>This link expires in 24 hours.</strong> If you didn't expect this email, contact your administrator.",
            "warning",
          ),
        ].join(""),
        footer: staffFooter(org),
      }),
    });

    logger.info(`Password reset email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    return false;
  }
}

// ─── Request approved: quotation ──────────────────────────────────────────────

export async function sendRequestApprovalEmail(data: {
  tenantId: string;
  requestNumber: string;
  clientName: string;
  clientEmail: string;
  quotationAmount: number;
}) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      logger.warn("Email transporter not available, skipping email");
      return false;
    }

    const { requestNumber, clientName, clientEmail, quotationAmount } = data;
    const org = await getOrgDetails(data.tenantId);
    const amount = `₦${Number(quotationAmount).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: clientEmail,
      replyTo: org.email || undefined,
      subject: `Request Approved - Quotation for ${requestNumber}`,
      html: emailShell({
        orgName: org.name,
        logoUrl: org.logoUrl,
        eyebrow: "Quotation",
        title: "Your quotation is ready",
        preheader: `Request ${requestNumber} approved. Quotation: ${amount}.`,
        content: [
          paragraph(`Dear ${clientName},`),
          paragraph(`Your sample analysis request ${requestNumber} has been approved.`),
          highlight("Quotation amount", amount),
          sectionTitle("Payment Instructions"),
          bankDetailsHtml(org, requestNumber),
          paragraph(
            `After payment, please send proof of payment to <strong>${esc(org.email || FROM_EMAIL)}</strong>, quoting your request number.`,
            { html: true },
          ),
          paragraph("Once payment is confirmed, we will schedule sample collection or provide drop-off instructions."),
        ].join(""),
        footer: clientFooter(org),
      }),
    });

    logger.info(`Approval email sent for ${requestNumber}`);
    return true;
  } catch (error) {
    logger.error("Failed to send approval email:", error);
    return false;
  }
}

// ─── Staff invitation ─────────────────────────────────────────────────────────

export async function sendInvitationEmail(data: {
  tenantId?: string;
  recipientEmail: string;
  recipientName: string;
  roleName: string;
  inviterName: string;
  setPasswordLink: string;
}) {
  try {
    const transporter = getTransporter();
    if (!transporter) {
      logger.warn("Email transporter not available, skipping invitation email");
      return false;
    }

    const { recipientEmail, recipientName, roleName, inviterName, setPasswordLink } = data;
    const org = (await orgOrNull(data.tenantId)) ?? defaultOrg();
    const signInUrl = `${frontendBase()}/login`;

    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `You've been invited to ${org.name} LMS`,
      html: emailShell({
        orgName: org.name,
        logoUrl: org.logoUrl,
        eyebrow: "Invitation",
        title: `Welcome to ${org.name}`,
        preheader: `${inviterName} added you as ${roleName}. Set your password to get started.`,
        content: [
          paragraph(`Hello ${recipientName},`),
          paragraph(
            `${esc(inviterName)} has added you to the ${esc(org.name)} Laboratory Management System as <strong>${esc(roleName)}</strong>. Set your password to activate your account.`,
            { html: true },
          ),
          button(setPasswordLink, "Set My Password"),
          paragraph("Or copy and paste this link into your browser:"),
          `<p style="margin:0 0 16px;font-family:${BRAND.mono};font-size:12px;line-height:1.5;word-break:break-all;color:${BRAND.muted}">${esc(setPasswordLink)}</p>`,
          notice(
            `After setting your password, sign in at <a href="${esc(signInUrl)}" style="color:${BRAND.navy};font-weight:600">${esc(signInUrl)}</a> with <strong>${esc(recipientEmail)}</strong>. The link expires in 24 hours; if it does, ask your administrator to resend it.`,
          ),
        ].join(""),
        footer: staffFooter(org),
      }),
    });

    logger.info(`Invitation email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error("Failed to send invitation email:", error);
    return false;
  }
}
