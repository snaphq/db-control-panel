interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
}

interface SendEmailResult {
  success: boolean;
  error?: string;
}

const ZSEND_DEFAULT_BASE_URL = "https://zsend.dev/api/v1";
const ZSEND_TIMEOUT_MS = 10_000;

interface ZsendConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Get the zsend settings, or null when no API key is configured.
 * API: https://zsend.dev/.well-known/agent-skills/zsend-api/SKILL.md
 */
function getZsendConfig(): ZsendConfig | null {
  const apiKey = process.env.ZSEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  const baseUrl = (
    process.env.ZSEND_BASE_URL || ZSEND_DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/**
 * Get the from address. Its domain must be verified in the zsend account.
 */
function getFromEmail(): string {
  const fromName = process.env.ZSEND_FROM_NAME || "AlloyDB";
  const fromEmail = process.env.ZSEND_FROM_EMAIL || "noreply@example.com";
  return `${fromName} <${fromEmail}>`;
}

/**
 * Log email to console with formatted output (development fallback)
 */
function logEmailToConsole(params: SendEmailParams): void {
  const border = "═".repeat(64);

  console.log("");
  console.log(`╔${border}╗`);
  console.log(`║${"EMAIL (NOT SENT)".padStart(40).padEnd(64)}║`);
  console.log(`╠${border}╣`);
  console.log(`║  To: ${params.to.padEnd(57)}║`);
  console.log(`║  Subject: ${params.subject.padEnd(52)}║`);
  console.log(`╠${border}╣`);

  // Split text into lines and display
  const lines = params.text.split("\n");
  for (const line of lines) {
    // Truncate long lines and pad short ones
    const displayLine = line.length > 62 ? `${line.slice(0, 59)}...` : line;
    console.log(`║  ${displayLine.padEnd(61)}║`);
  }

  console.log(`╚${border}╝`);
  console.log("");
  console.log("\x1b[33m[Email Provider Not Configured]\x1b[0m");
  console.log(
    "\x1b[36mTo send real emails, set ZSEND_API_KEY and ZSEND_FROM_EMAIL in your .env.local\x1b[0m",
  );
  console.log("");
}

/**
 * Pull a readable message out of a zsend error response body.
 */
async function readErrorMessage(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  try {
    const parsed = JSON.parse(body) as {
      message?: unknown;
      error?: unknown;
    };
    const nested =
      parsed.error && typeof parsed.error === "object"
        ? (parsed.error as { message?: unknown }).message
        : parsed.error;
    const message = parsed.message ?? nested;
    if (typeof message === "string" && message) return message;
  } catch {
    // Not JSON: fall through to the raw body.
  }
  return body.slice(0, 200) || `zsend responded with HTTP ${response.status}`;
}

/**
 * Send an email through zsend, or log it to the console if not configured
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const zsend = getZsendConfig();

  // If zsend is not configured, log to console
  if (!zsend) {
    logEmailToConsole(params);
    return { success: true };
  }

  try {
    const response = await fetch(`${zsend.baseUrl}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${zsend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromEmail(),
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
      signal: AbortSignal.timeout(ZSEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response);
      console.error(
        `[Email] zsend rejected the email (HTTP ${response.status}):`,
        message,
      );
      return { success: false, error: message };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[Email] Exception sending email:", message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  resetUrl: string;
  token?: string;
}): Promise<SendEmailResult> {
  const production =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production";
  // The development fallback prints the reset URL to make local setup easy,
  // but doing that in production would put a live credential in platform
  // logs. Fail closed for delivery while keeping the caller's anti-enumeration
  // response unchanged.
  if (production && !isEmailProviderConfigured()) {
    console.error(
      "[Email] Password reset email provider is not configured; refusing to log reset credentials",
    );
    return {
      success: false,
      error: "Password reset email provider is not configured",
    };
  }
  const text = `You requested to reset your password.

Click the link below to reset your password:
${params.resetUrl}

This link will expire in 1 hour.

If you did not request this password reset, you can safely ignore this email.`;

  return sendEmail({
    to: params.to,
    subject: "Reset your password",
    text,
  });
}

/**
 * Check if email provider is configured
 */
export function isEmailProviderConfigured(): boolean {
  return !!process.env.ZSEND_API_KEY;
}
