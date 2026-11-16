import { logger } from "../utils/logger";

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

/**
 * White logo bar placed above an email's coloured header. Loaded from the
 * organisation's public logo URL (Settings → Organization logo); email clients
 * block embedded data: images, so a hosted URL is what reliably displays.
 */
export function emailLogoHtml(logoUrl: string | null | undefined, name: string): string {
  if (!logoUrl) return "";
  return `<div class="brand" style="background:#ffffff;padding:16px 24px;border-radius:10px 10px 0 0;border-bottom:3px solid #1e40af;text-align:left">
    <img src="${escHtml(logoUrl)}" alt="${escHtml(name)}" height="48" style="height:48px;max-width:220px;width:auto;display:block;border:0;outline:none" />
  </div>`;
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

function escHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bank account list for payment instructions, from Settings → Bank Accounts. */
export function bankDetailsHtml(org: OrgDetails, reference: string): string {
  if (org.bankAccounts.length === 0) {
    return `<p>Please contact us${org.phone ? ` on ${escHtml(org.phone)}` : ""}${
      org.email ? ` or at ${escHtml(org.email)}` : ""
    } for payment details, quoting <strong>${escHtml(reference)}</strong>.</p>`;
  }
  const blocks = org.bankAccounts
    .map(
      (a) => `
      <ul style="margin:8px 0;padding-left:20px">
        ${a.label ? `<li><strong>${escHtml(a.label)}</strong></li>` : ""}
        <li><strong>Bank:</strong> ${escHtml(a.bank_name)}</li>
        <li><strong>Account Name:</strong> ${escHtml(a.account_name)}</li>
        <li><strong>Account Number:</strong> ${escHtml(a.account_number)}</li>
      </ul>`,
    )
    .join("");
  return `<p>Please make payment to:</p>${blocks}<p>Please use <strong>${escHtml(reference)}</strong> as the payment reference.</p>`;
}

/** "Email: … | Phone: …" line, leaving out whatever isn't set. */
function contactLine(org: OrgDetails): string {
  return [
    `Email: ${escHtml(org.email || FROM_EMAIL)}`,
    org.phone ? `Phone: ${escHtml(org.phone)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

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

    // Email to client
    const clientEmailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: clientEmail,
      replyTo: org.email || undefined,
      subject: `Request Confirmation - ${requestNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            .brand + .header { border-radius: 0 !important; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .request-number { background: #3b82f6; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 8px; margin: 20px 0; font-family: monospace; }
            .info-box { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
            .info-row { display: flex; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .info-label { font-weight: bold; width: 150px; color: #6b7280; }
            .info-value { flex: 1; color: #111827; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
            .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
            <div class="header">
              <h1>Request Received!</h1>
              <p>Thank you for choosing Countrylab Laboratory</p>
            </div>
            <div class="content">
              <p>Dear ${clientName},</p>
              <p>We have successfully received your sample analysis request. Our team will review your request and contact you within 24 hours with a detailed quotation.</p>
              
              <div class="request-number">${requestNumber}</div>
              
              <p style="text-align: center; color: #6b7280; font-size: 14px;">Please save this number for tracking your request</p>
              
              <div class="info-box">
                <h3 style="margin-top: 0; color: #111827;">Request Details</h3>
                <div class="info-row">
                  <div class="info-label">Product:</div>
                  <div class="info-value">${productName}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Test Category:</div>
                  <div class="info-value">${testCategory.charAt(0).toUpperCase() + testCategory.slice(1)}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Submitted:</div>
                  <div class="info-value">${new Date().toLocaleString()}</div>
                </div>
              </div>
              
              <h3>What Happens Next?</h3>
              <ol>
                <li>Our team reviews your request</li>
                <li>We prepare a detailed quotation</li>
                <li>You receive the quotation via email</li>
                <li>Upon payment confirmation, we schedule sample collection/drop-off</li>
                <li>Testing begins and results are delivered</li>
              </ol>
              
              <p>If you have any questions, please don't hesitate to contact us.</p>
              
              <div style="text-align: center;">
                <a href="mailto:${org.email || FROM_EMAIL}" class="button">Contact Us</a>
              </div>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>ISO 17025 Accredited Laboratory</p>
              <p>${contactLine(org)}</p>
              <p style="font-size: 12px; color: #9ca3af;">This is an automated message. Please do not reply directly to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Email to representative (if different)
    let representativeEmailContent = null;
    if (representativeEmail && representativeEmail !== clientEmail) {
      representativeEmailContent = {
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: representativeEmail,
        replyTo: org.email || undefined,
        subject: `Request Confirmation - ${requestNumber}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              .brand + .header { border-radius: 0 !important; }
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .request-number { background: #3b82f6; color: white; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; border-radius: 8px; margin: 20px 0; font-family: monospace; }
              .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
              <div class="header">
                <h1>Request Received!</h1>
              </div>
              <div class="content">
                <p>Dear ${representativeName || "Representative"},</p>
                <p>A sample analysis request has been submitted on behalf of ${clientName}.</p>
                
                <div class="request-number">${requestNumber}</div>
                
                <p>Our team will contact you within 24 hours with a detailed quotation.</p>
                <p>For any inquiries, please reference the request number above.</p>
              </div>
              <div class="footer">
                <p><strong>Countrylab Laboratory</strong></p>
                <p>${contactLine(org)}</p>
              </div>
            </div>
          </body>
          </html>
        `,
      };
    }

    // Internal notification email to company
    const companyEmailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: COMPANY_EMAIL,
      subject: `New Sample Request - ${requestNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            .brand + .header { border-radius: 0 !important; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1f2937; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
            .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .info-table td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
            .info-table td:first-child { font-weight: bold; width: 150px; color: #6b7280; }
            .alert { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
            <div class="header">
              <h2 style="margin: 0;">🔔 New Sample Request</h2>
              <p style="margin: 5px 0 0 0; opacity: 0.9;">Action Required</p>
            </div>
            <div class="content">
              <div class="alert">
                <strong>⚠️ New request requires review and quotation</strong>
              </div>
              
              <table class="info-table">
                <tr>
                  <td>Request Number:</td>
                  <td><strong>${requestNumber}</strong></td>
                </tr>
                <tr>
                  <td>Client:</td>
                  <td>${clientName}</td>
                </tr>
                <tr>
                  <td>Email:</td>
                  <td>${clientEmail}</td>
                </tr>
                ${
                  representativeName
                    ? `
                <tr>
                  <td>Representative:</td>
                  <td>${representativeName}</td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td>Product:</td>
                  <td>${productName}</td>
                </tr>
                <tr>
                  <td>Test Category:</td>
                  <td>${testCategory.toUpperCase()}</td>
                </tr>
                <tr>
                  <td>Submitted:</td>
                  <td>${new Date().toLocaleString()}</td>
                </tr>
              </table>
              
              <p><strong>Next Steps:</strong></p>
              <ol>
                <li>Review the request in the system</li>
                <li>Prepare quotation</li>
                <li>Contact client within 24 hours</li>
              </ol>
              
              <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
                Login to the system to view full details and take action.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
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
    const org = await orgOrNull(data.tenantId);

    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: "Reset Your Countrylab Password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            .brand + .header { border-radius: 0 !important; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e40af; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #1e40af; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 13px; }
            .notice { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; font-size: 13px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
            <div class="header">
              <h2 style="margin:0;">Password Reset Request</h2>
              <p style="margin:6px 0 0; opacity:0.85;">Countrylab LMS</p>
            </div>
            <div class="content">
              <p>Hello <strong>${recipientName}</strong>,</p>
              <p>An administrator has requested a password reset for your account. Click the button below to set a new password:</p>
              <div style="text-align:center;">
                <a href="${resetLink}" class="button">Reset My Password</a>
              </div>
              <p style="font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:</p>
              <p style="font-size:12px;word-break:break-all;color:#374151;">${resetLink}</p>
              <div class="notice">
                <strong>Note:</strong> This link expires in 24 hours. If you did not expect this email, please contact your administrator.
              </div>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>This is an automated message — please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    logger.info(`Password reset email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    return false;
  }
}

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

    const emailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: clientEmail,
      replyTo: org.email || undefined,
      subject: `Request Approved - Quotation for ${requestNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            .brand + .header { border-radius: 0 !important; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .amount-box { background: white; border: 2px solid #10b981; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }
            .amount { font-size: 36px; font-weight: bold; color: #10b981; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
            <div class="header">
              <h1>✓ Request Approved!</h1>
              <p>Your quotation is ready</p>
            </div>
            <div class="content">
              <p>Dear ${clientName},</p>
              <p>Great news! Your sample analysis request <strong>${requestNumber}</strong> has been approved.</p>
              
              <div class="amount-box">
                <p style="margin: 0; color: #6b7280; font-size: 14px;">QUOTATION AMOUNT</p>
                <div class="amount">₦${quotationAmount.toLocaleString()}</div>
              </div>
              
              <h3>Payment Instructions:</h3>
              ${bankDetailsHtml(org, requestNumber)}
              
              <p>After payment, please send proof of payment to ${org.email || FROM_EMAIL} with your request number.</p>
              
              <p>Once payment is confirmed, we will schedule sample collection or provide drop-off instructions.</p>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>${contactLine(org)}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(emailContent);
    logger.info(`Approval email sent for ${requestNumber}`);
    return true;
  } catch (error) {
    logger.error("Failed to send approval email:", error);
    return false;
  }
}

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
    const org = await orgOrNull(data.tenantId);
    const signInUrl = `${process.env.FRONTEND_URL || ""}/login`;

    await transporter.sendMail({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: recipientEmail,
      subject: "You've been invited to Countrylab LMS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            .brand + .header { border-radius: 0 !important; }
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e40af; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #1e40af; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 13px; }
            .notice { background: #eff6ff; border-left: 4px solid #1e40af; padding: 12px 16px; border-radius: 4px; font-size: 13px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            ${emailLogoHtml(org?.logoUrl, org?.name || FROM_NAME)}
            <div class="header">
              <h2 style="margin:0;">Welcome to Countrylab LMS</h2>
              <p style="margin:6px 0 0; opacity:0.85;">Laboratory Management System</p>
            </div>
            <div class="content">
              <p>Hello <strong>${recipientName}</strong>,</p>
              <p>${inviterName} has added you to Countrylab LMS as <strong>${roleName}</strong>. Set your password to activate your account:</p>
              <div style="text-align:center;">
                <a href="${setPasswordLink}" class="button">Set My Password</a>
              </div>
              <p style="font-size:13px;color:#6b7280;">Or copy and paste this link into your browser:</p>
              <p style="font-size:12px;word-break:break-all;color:#374151;">${setPasswordLink}</p>
              <div class="notice">
                After setting your password, sign in at <a href="${signInUrl}">${signInUrl}</a> with <strong>${recipientEmail}</strong>.
                The link expires in 24 hours; if it does, ask your administrator to resend it.
              </div>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>This is an automated message — please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    logger.info(`Invitation email sent to ${recipientEmail}`);
    return true;
  } catch (error) {
    logger.error("Failed to send invitation email:", error);
    return false;
  }
}
