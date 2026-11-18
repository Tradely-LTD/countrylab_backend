// ─── Email design system ──────────────────────────────────────────────────────
// One layout for every email the LMS sends, built around the Countrylab logo:
// the header is the logo's own navy (#002863) so the logo tile sits seamlessly
// in it, with a thin orange (#F58634) brand rule beneath. Orange is decoration
// only — on white it fails text contrast, so all text is navy/slate.
//
// Email-client constraints: table layout, inline styles, 600px max width,
// web-safe fonts (Outlook ignores web fonts), no CSS gradients, hosted images.

export const BRAND = {
  navy: "#002863", // logo background — header, buttons, headings
  orange: "#F58634", // logo accent — rules and markers only, never text
  silver: "#BEBFC1", // logo tagline — eyebrow text on navy (7.9:1)
  ink: "#0F172A", // primary text (17.9:1 on white)
  body: "#334155", // paragraph text (10.4:1)
  muted: "#64748B", // labels, footer (4.8:1)
  line: "#E2E8F0", // dividers
  wash: "#F4F7FB", // tinted panels
  page: "#EEF2F7", // outer background
  white: "#FFFFFF",
  font: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Building blocks (return trusted HTML; they escape their own inputs) ─────

export function paragraph(text: string, opts: { html?: boolean } = {}): string {
  return `<p style="margin:0 0 16px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.body}">${
    opts.html ? text : esc(text)
  }</p>`;
}

export function sectionTitle(title: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 10px">
    <tr>
      <td width="4" style="width:4px;background:${BRAND.orange};font-size:0;line-height:0">&nbsp;</td>
      <td style="padding:0 0 0 10px;font-family:${BRAND.font};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.navy}">${esc(title)}</td>
    </tr>
  </table>`;
}

export type DetailRow = [label: string, value: unknown];

/** Label/value rows; empty values are left out. Returns "" when nothing to show. */
export function detailRows(rows: DetailRow[]): string {
  const visible = rows.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "");
  if (visible.length === 0) return "";
  const trs = visible
    .map(
      ([label, value], i) => `
      <tr>
        <td valign="top" style="padding:11px 16px 11px 0;width:42%;font-family:${BRAND.font};font-size:14px;line-height:1.4;color:${BRAND.muted};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${esc(label)}</td>
        <td valign="top" style="padding:11px 0;font-family:${BRAND.font};font-size:14px;line-height:1.4;font-weight:600;color:${BRAND.ink};${i ? `border-top:1px solid ${BRAND.line};` : ""}">${esc(value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${trs}</table>`;
}

export function detailSection(title: string, rows: DetailRow[]): string {
  const body = detailRows(rows);
  return body ? sectionTitle(title) + body : "";
}

/** Large reference or amount, e.g. a request number or quotation total. */
export function highlight(label: string, value: string, opts: { mono?: boolean } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
    <tr><td style="background:${BRAND.wash};border-left:4px solid ${BRAND.navy};padding:16px 20px">
      <div style="font-family:${BRAND.font};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${BRAND.muted}">${esc(label)}</div>
      <div style="margin-top:4px;font-family:${opts.mono ? BRAND.mono : BRAND.font};font-size:24px;font-weight:700;color:${BRAND.navy}">${esc(value)}</div>
    </td></tr>
  </table>`;
}

/** Bulletproof button (renders in Outlook too). */
export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px">
    <tr><td align="center" bgcolor="${BRAND.navy}" style="border-radius:6px;background:${BRAND.navy}">
      <a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${BRAND.font};font-size:15px;font-weight:600;color:${BRAND.white};text-decoration:none;border-radius:6px">${esc(label)}</a>
    </td></tr>
  </table>`;
}

/** Tinted callout. "warning" uses the orange rule; text stays dark for contrast. */
export function notice(html: string, tone: "info" | "warning" = "info"): string {
  const rule = tone === "warning" ? BRAND.orange : BRAND.navy;
  const bg = tone === "warning" ? "#FFF7ED" : BRAND.wash;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    <tr><td style="background:${bg};border-left:4px solid ${rule};padding:14px 18px;font-family:${BRAND.font};font-size:14px;line-height:1.55;color:${BRAND.ink}">${html}</td></tr>
  </table>`;
}

/** Numbered steps (e.g. "What happens next"). */
export function steps(items: string[]): string {
  const trs = items
    .map(
      (text, i) => `
      <tr>
        <td valign="top" width="28" style="padding:6px 0;width:28px">
          <div style="width:22px;height:22px;border-radius:11px;background:${BRAND.navy};color:${BRAND.white};font-family:${BRAND.font};font-size:12px;font-weight:700;line-height:22px;text-align:center">${i + 1}</div>
        </td>
        <td valign="top" style="padding:7px 0 6px 8px;font-family:${BRAND.font};font-size:14px;line-height:1.5;color:${BRAND.body}">${esc(text)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${trs}</table>`;
}

/** Itemised table with right-aligned money columns and a totals block. */
export function itemsTable(opts: {
  columns: { label: string; align?: "left" | "center" | "right"; width?: string }[];
  rows: string[][];
  totals: { label: string; value: string; strong?: boolean }[];
}): string {
  const th = opts.columns
    .map(
      (c) => `<th align="${c.align ?? "left"}" style="padding:10px 12px;${c.width ? `width:${c.width};` : ""}background:${BRAND.wash};border-bottom:2px solid ${BRAND.navy};font-family:${BRAND.font};font-size:12px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:${BRAND.navy};text-align:${c.align ?? "left"}">${esc(c.label)}</th>`,
    )
    .join("");
  const body = opts.rows
    .map(
      (r) =>
        `<tr>${r
          .map(
            (cell, i) =>
              `<td align="${opts.columns[i]?.align ?? "left"}" style="padding:12px;border-bottom:1px solid ${BRAND.line};font-family:${BRAND.font};font-size:14px;line-height:1.4;color:${BRAND.ink};text-align:${opts.columns[i]?.align ?? "left"}">${esc(cell)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  const span = opts.columns.length - 1;
  const totals = opts.totals
    .map(
      (t) => `<tr>
        <td colspan="${span}" align="right" style="padding:${t.strong ? "14px" : "8px"} 12px ${t.strong ? "14px" : "4px"};font-family:${BRAND.font};font-size:${t.strong ? "15px" : "14px"};${t.strong ? `font-weight:700;color:${BRAND.navy};border-top:2px solid ${BRAND.navy};` : `color:${BRAND.muted};`}text-align:right">${esc(t.label)}</td>
        <td align="right" style="padding:${t.strong ? "14px" : "8px"} 12px ${t.strong ? "14px" : "4px"};font-family:${BRAND.font};font-size:${t.strong ? "17px" : "14px"};${t.strong ? `font-weight:700;color:${BRAND.navy};border-top:2px solid ${BRAND.navy};` : `color:${BRAND.ink};`}text-align:right;white-space:nowrap">${esc(t.value)}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:8px">
    <thead><tr>${th}</tr></thead><tbody>${body}${totals}</tbody>
  </table>`;
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export interface ShellOptions {
  orgName: string;
  logoUrl?: string | null;
  /** Small label in the header, e.g. "Invoice" or "Sample Notification" */
  eyebrow?: string;
  title: string;
  /** Inbox preview text (hidden in the email body) */
  preheader?: string;
  /** Trusted HTML built from the blocks above */
  content: string;
  /** Footer lines (trusted HTML); defaults to the organisation name */
  footer?: string;
}

export function emailShell(o: ShellOptions): string {
  const logo = o.logoUrl
    ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.orgName)}" height="44" style="display:block;height:44px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none" />`
    : `<span style="font-family:${BRAND.font};font-size:20px;font-weight:700;color:${BRAND.white}">${esc(o.orgName)}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${esc(o.title)}</title>
<style>
  @media (max-width: 620px) {
    .cl-card { width: 100% !important; }
    .cl-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .cl-eyebrow { display: none !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND.page}">${esc(o.preheader ?? o.title)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page}">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" class="cl-card" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${BRAND.white};border:1px solid #DCE3EC;border-radius:10px;overflow:hidden">
        <tr><td class="cl-pad" bgcolor="${BRAND.navy}" style="background:${BRAND.navy};padding:22px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle">${logo}</td>
            ${
              o.eyebrow
                ? `<td class="cl-eyebrow" valign="middle" align="right" style="font-family:${BRAND.font};font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:${BRAND.silver};text-align:right">${esc(o.eyebrow)}</td>`
                : ""
            }
          </tr></table>
        </td></tr>
        <tr><td height="4" bgcolor="${BRAND.orange}" style="height:4px;background:${BRAND.orange};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="cl-pad" style="padding:32px 32px 28px">
          <h1 style="margin:0 0 16px;font-family:${BRAND.font};font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink}">${esc(o.title)}</h1>
          ${o.content}
        </td></tr>
        <tr><td class="cl-pad" style="background:#F8FAFC;border-top:1px solid ${BRAND.line};padding:20px 32px;font-family:${BRAND.font};font-size:12px;line-height:1.6;color:${BRAND.muted}">
          ${o.footer ?? `<strong style="color:${BRAND.navy}">${esc(o.orgName)}</strong>`}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Standard footer: organisation, address, contacts, and a closing line. */
export function orgFooter(org: { name: string; address?: string | null; email?: string | null; phone?: string | null }, closing: string): string {
  const contacts = [org.email, org.phone].filter(Boolean).map(esc).join(" &nbsp;·&nbsp; ");
  return [
    `<strong style="color:${BRAND.navy}">${esc(org.name)}</strong>`,
    org.address ? esc(org.address) : "",
    contacts,
    `<span style="color:#94A3B8">${esc(closing)}</span>`,
  ]
    .filter(Boolean)
    .join("<br/>");
}
