import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isEmailProviderConfigured,
  sendEmail,
  sendPasswordResetEmail,
} from "./email";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

describe("sendEmail", () => {
  it("logs to the console without calling zsend when no API key is set", async () => {
    vi.stubEnv("ZSEND_API_KEY", "");

    const result = await sendEmail({ to: "a@b.dev", subject: "Hi", text: "x" });

    expect(result).toEqual({ success: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the email to the zsend emails endpoint with a bearer token", async () => {
    vi.stubEnv("ZSEND_API_KEY", "zs_test");
    vi.stubEnv("ZSEND_FROM_EMAIL", "noreply@alloydb.net");
    vi.stubEnv("ZSEND_FROM_NAME", "AlloyDB");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ emailId: "e1" }), { status: 200 }),
    );

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Code",
      text: "123456",
    });

    expect(result).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://zsend.dev/api/v1/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer zs_test");
    expect(JSON.parse(init.body)).toEqual({
      from: "AlloyDB <noreply@alloydb.net>",
      to: ["user@example.com"],
      subject: "Code",
      text: "123456",
    });
  });

  it("uses ZSEND_BASE_URL for a self-hosted instance", async () => {
    vi.stubEnv("ZSEND_API_KEY", "zs_test");
    vi.stubEnv("ZSEND_BASE_URL", "https://mail.example.com/api/v1/");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    await sendEmail({ to: "a@b.dev", subject: "Hi", text: "x" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://mail.example.com/api/v1/emails",
    );
  });

  it("returns the zsend error message on a rejected send", async () => {
    vi.stubEnv("ZSEND_API_KEY", "zs_test");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "Domain not verified" } }),
        { status: 422 },
      ),
    );

    const result = await sendEmail({ to: "a@b.dev", subject: "Hi", text: "x" });

    expect(result).toEqual({ success: false, error: "Domain not verified" });
  });

  it("reports a network failure instead of throwing", async () => {
    vi.stubEnv("ZSEND_API_KEY", "zs_test");
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await sendEmail({ to: "a@b.dev", subject: "Hi", text: "x" });

    expect(result).toEqual({ success: false, error: "connect ECONNREFUSED" });
  });
});

describe("sendPasswordResetEmail", () => {
  it("refuses to log reset links in production when zsend is not configured", async () => {
    vi.stubEnv("ZSEND_API_KEY", "");
    vi.stubEnv("VERCEL_ENV", "production");

    const result = await sendPasswordResetEmail({
      to: "a@b.dev",
      resetUrl: "https://console.alloydb.net/reset?token=secret",
    });

    expect(result.success).toBe(false);
    expect(console.log).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isEmailProviderConfigured", () => {
  it("is true only when ZSEND_API_KEY is set", () => {
    vi.stubEnv("ZSEND_API_KEY", "");
    expect(isEmailProviderConfigured()).toBe(false);
    vi.stubEnv("ZSEND_API_KEY", "zs_test");
    expect(isEmailProviderConfigured()).toBe(true);
  });
});
