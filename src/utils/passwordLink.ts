// Links straight to our own reset page instead of Supabase's action_link. That
// link redirects through Supabase's Site URL settings, and any visit spends the
// one-time token, so a WhatsApp or email link preview would burn it. Here the
// token is only spent when the form is submitted.
export function buildSetPasswordLink(hashedToken: string): string {
  const base = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  return `${base}/reset-password?token_hash=${encodeURIComponent(hashedToken)}`;
}
