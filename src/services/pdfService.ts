import { db } from "../db";
import {
  results,
  samples,
  clients,
  users,
  tenants,
  result_templates,
} from "../db/schema";
import { eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface CoaData {
  result_id: string;
  tenant_id: string;
  qr_hash: string;
}

export async function generateCoaPdf(data: CoaData): Promise<string> {
  try {
    // Fetch all required data
    const [result] = await db
      .select()
      .from(results)
      .where(eq(results.id, data.result_id))
      .limit(1);

    const [sample] = await db
      .select()
      .from(samples)
      .where(eq(samples.id, result.sample_id))
      .limit(1);

    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, sample.client_id))
      .limit(1);

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, data.tenant_id))
      .limit(1);

    const [analyst] = await db
      .select()
      .from(users)
      .where(eq(users.id, result.analyst_id))
      .limit(1);

    // Fetch NIS standard reference from template if one was used
    let nisStandardRef: string | null = null;
    if (result.template_id) {
      const [template] = await db
        .select({ nis_standard_ref: result_templates.nis_standard_ref })
        .from(result_templates)
        .where(eq(result_templates.id, result.template_id))
        .limit(1);
      nisStandardRef = template?.nis_standard_ref ?? null;
    }

    const verifyUrl = `${process.env.FRONTEND_URL}/verify/${data.qr_hash}`;
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verifyUrl)}`;

    // Build HTML for CoA
    const html = buildCoaHtml({
      result,
      sample,
      client,
      tenant,
      analyst,
      qrImageUrl,
      verifyUrl,
      nisStandardRef,
    });

    // In production, use Puppeteer to render HTML to PDF
    // For MVP, generate HTML-based CoA and store as file
    const pdfBuffer = Buffer.from(html, "utf-8");
    const fileName = `coa/${data.tenant_id}/${data.result_id}.html`;

    const { error } = await supabase.storage
      .from(process.env.SUPABASE_STORAGE_BUCKET || "countrylab-files")
      .upload(fileName, pdfBuffer, {
        contentType: "text/html",
        upsert: true,
      });

    if (error) {
      logger.error("CoA upload error:", error);
    }

    // Always return the verify page URL — the HTML is stored in Supabase
    // for archival only. Serving HTML directly from Supabase breaks CSS/images.
    return verifyUrl;
  } catch (error) {
    logger.error("PDF generation error:", error);
    return `${process.env.FRONTEND_URL}/verify/${data.qr_hash}`;
  }
}

function buildCoaHtml(ctx: {
  result: any;
  sample: any;
  client: any;
  tenant: any;
  analyst: any;
  qrImageUrl: string;
  verifyUrl: string;
  nisStandardRef?: string | null;
}): string {
  const {
    result,
    sample,
    client,
    tenant,
    analyst,
    qrImageUrl,
    verifyUrl,
    nisStandardRef,
  } = ctx;
  const params = result.parameters as any[];

  const paramRows = params
    .map(
      (p) => `
    <tr>
      <td>${p.param_name}</td>
      <td>${p.calculated_value ?? p.raw_value ?? "—"}</td>
      <td>${p.unit || "—"}</td>
      <td>${p.spec_min !== undefined ? p.spec_min : "—"} – ${p.spec_max !== undefined ? p.spec_max : "—"}</td>
      <td style="color:${p.pass ? "#065f46" : "#dc2626"}; font-weight:600">
        ${p.data_type === "qualitative" ? p.raw_value || "—" : p.pass ? "PASS" : "FAIL"}
      </td>
    </tr>`,
    )
    .join("");

  const allPass = params.every((p) => p.pass !== false);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Certificate of Analysis – ${sample.ulid}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;600&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; padding: 48px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a56db; padding-bottom: 24px; margin-bottom: 24px; }
    .lab-name { font-family: 'DM Serif Display', serif; font-size: 28px; color: #1e429f; }
    .doc-title { font-size: 14px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-top: 4px; }
    .badge { background: ${allPass ? "#d1fae5" : "#fee2e2"}; color: ${allPass ? "#065f46" : "#dc2626"}; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; }
    .section { margin-bottom: 24px; }
    .section h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #64748b; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .field label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; display: block; }
    .field span { font-size: 14px; color: #1e293b; font-weight: 500; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #1e429f; color: #fff; text-align: left; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; }
    tr:nth-child(even) td { background: #f8fafc; }
    .qr-section { display: flex; align-items: center; gap: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 24px; }
    .qr-section img { width: 100px; height: 100px; }
    .qr-text { font-size: 11px; color: #64748b; }
    .qr-text strong { display: block; font-size: 13px; color: #1e293b; margin-bottom: 4px; }
    .signature { margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 24px; display: flex; justify-content: space-between; }
    .sig-block { text-align: center; min-width: 180px; }
    .sig-line { border-top: 1px solid #1e293b; padding-top: 6px; font-size: 11px; color: #64748b; }
    .watermark { color: ${allPass ? "#d1fae5" : "#fee2e2"}; font-size: 72px; font-weight: 900; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); opacity: 0.15; pointer-events: none; z-index: 0; }
  </style>
</head>
<body>
  <div class="watermark">${allPass ? "PASS" : "FAIL"}</div>
  
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${tenant?.logo_url ? `<img src="${tenant.logo_url}" alt="${tenant.name} logo" style="max-height:64px;max-width:140px;object-fit:contain;flex-shrink:0;">` : ""}
      <div>
        <div class="lab-name">${tenant?.name || "Countrylab"}</div>
        <div class="doc-title">Certificate of Analysis</div>
        ${tenant?.accreditation_number ? `<div style="font-size:11px;color:#64748b;margin-top:4px">Accreditation No: ${tenant.accreditation_number}</div>` : ""}
        ${nisStandardRef ? `<div style="font-size:11px;color:#64748b;margin-top:4px">Standard: ${nisStandardRef}</div>` : ""}
      </div>
    </div>
    <div style="text-align:right">
      <span class="badge">${allPass ? "All Tests Passed" : "Some Tests Failed"}</span>
      <div style="font-size:11px;color:#64748b;margin-top:8px">Report No: ${sample.ulid}</div>
      <div style="font-size:11px;color:#64748b">Date: ${new Date(result.approved_at || result.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}</div>
    </div>
  </div>

  <div class="section">
    <h3>Sample Information</h3>
    <div class="grid-2">
      <div class="field"><label>Sample ID</label><span>${sample.ulid}</span></div>
      <div class="field"><label>Sample Name</label><span>${sample.name}</span></div>
      <div class="field"><label>Matrix</label><span>${sample.matrix || "—"}</span></div>
      <div class="field"><label>Collection Date</label><span>${sample.collection_date ? new Date(sample.collection_date).toLocaleDateString("en-GB") : "—"}</span></div>
      <div class="field"><label>Date Received</label><span>${new Date(sample.received_at).toLocaleDateString("en-GB")}</span></div>
      <div class="field"><label>Storage Location</label><span>${sample.storage_location || "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h3>Client Information</h3>
    <div class="grid-2">
      <div class="field"><label>Client Name</label><span>${client?.name || "—"}</span></div>
      <div class="field"><label>Company</label><span>${client?.company || "—"}</span></div>
    </div>
  </div>

  <div class="section">
    <h3>Test Results</h3>
    <table>
      <thead>
        <tr>
          <th>Parameter</th><th>Result</th><th>Unit</th><th>Specification</th><th>Status</th>
        </tr>
      </thead>
      <tbody>${paramRows}</tbody>
    </table>
  </div>

  <div class="qr-section">
    <img src="${qrImageUrl}" alt="Verification QR Code" />
    <div class="qr-text">
      <strong>Scan to Verify Authenticity</strong>
      This QR code links to a secure verification page hosted by ${tenant?.name || "Countrylab"}.<br/>
      Verified at: <a href="${verifyUrl}" style="color:#1a56db">${verifyUrl}</a>
    </div>
  </div>

  <div class="signature">
    <div class="sig-block">
      <div style="margin-bottom:40px"></div>
      <div class="sig-line">${analyst?.full_name || "Laboratory Analyst"}<br/>Analyst</div>
    </div>
    <div class="sig-block">
      <div style="margin-bottom:40px"></div>
      <div class="sig-line">Medical Director / Approver<br/>Authorized Signatory</div>
    </div>
  </div>

  <div style="margin-top:24px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px">
    This report shall not be reproduced without written approval from ${tenant?.name || "Countrylab"}. 
    Results relate only to the sample(s) tested. Generated by Countrylab LMS.
  </div>
</body>
</html>`;
}
