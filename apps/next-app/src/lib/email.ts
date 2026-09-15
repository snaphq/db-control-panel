import { Resend } from "resend";

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
}

interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Get the configured Resend client, or null if not configured
 */
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

/**
 * Get the from email address from environment
 */
function getFromEmail(): string {
  const fromName = process.env.RESEND_FROM_NAME || "Your App";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "noreply@example.com";
  return `${fromName} <${fromEmail}>`;
}

/**
 * Log email to console with formatted output (development fallback)
 */
function logEmailToConsole(params: SendEmailParams): void {
  const border = "═".repeat(64);

  console.log("");
  console.log(`╔${border}╗`);
  console.log(`║${"PASSWORD RESET EMAIL".padStart(42).padEnd(64)}║`);
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
    "\x1b[36mTo send real emails, configure RESEND_API_KEY in your .env.local\x1b[0m",
  );
  console.log('\x1b[36mRun "npm run setup" to configure email settings\x1b[0m');
  console.log("");
}

/**
 * Send an email using Resend, or log to console if not configured
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const resend = getResendClient();

  // If Resend is not configured, log to console
  if (!resend) {
    logEmailToConsole(params);
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: getFromEmail(),
      to: params.to,
      subject: params.subject,
      text: params.text,
    });

    if (error) {
      console.error("[Email] Failed to send email:", error);
      return {
        success: false,
        error: error.message,
      };
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
  if (production && !process.env.RESEND_API_KEY) {
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
  return !!process.env.RESEND_API_KEY;
}
