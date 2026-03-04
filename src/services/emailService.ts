import { logger } from "../utils/logger";

// Email configuration - lazy load nodemailer to avoid import issues
let transporter: any = null;

function getTransporter() {
  if (!transporter) {
    try {
      const nodemailer = require("nodemailer");
      transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } catch (error) {
      logger.error("Failed to initialize email transporter:", error);
      return null;
    }
  }
  return transporter;
}

const FROM_EMAIL = process.env.FROM_EMAIL || "info@countrylab.com.ng";
const FROM_NAME = process.env.FROM_NAME || "Countrylab Laboratory";
const COMPANY_EMAIL = process.env.COMPANY_EMAIL || "info@countrylab.com.ng";

interface RequestConfirmationData {
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
      subject: `Request Confirmation - ${requestNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
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
                <a href="mailto:${FROM_EMAIL}" class="button">Contact Us</a>
              </div>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>ISO 17025 Accredited Laboratory</p>
              <p>Email: ${FROM_EMAIL} | Phone: +234 XXX XXX XXXX</p>
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
        subject: `Request Confirmation - ${requestNumber}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
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
                <p>Email: ${FROM_EMAIL}</p>
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
          <style>
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

export async function sendRequestApprovalEmail(data: {
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

    const emailContent = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: clientEmail,
      subject: `Request Approved - Quotation for ${requestNumber}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
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
              <p>Please make payment to:</p>
              <ul>
                <li><strong>Bank:</strong> [Your Bank Name]</li>
                <li><strong>Account Name:</strong> Countrylab Laboratory</li>
                <li><strong>Account Number:</strong> [Account Number]</li>
                <li><strong>Reference:</strong> ${requestNumber}</li>
              </ul>
              
              <p>After payment, please send proof of payment to ${FROM_EMAIL} with your request number.</p>
              
              <p>Once payment is confirmed, we will schedule sample collection or provide drop-off instructions.</p>
            </div>
            <div class="footer">
              <p><strong>Countrylab Laboratory</strong></p>
              <p>Email: ${FROM_EMAIL}</p>
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
