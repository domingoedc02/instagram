import { describe, expect, it, vi } from "vitest";
import { signUpAttemptMessage, verifyEmailMessage } from "./index";
import { createMailer } from "./transport";

const message = { to: "maya@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" };

describe("createMailer", () => {
  it("posts to Resend with the API key when one is configured", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    await createMailer({ from: "INS <no-reply@ins.test>", resendApiKey: "re_123", fetch }).send(
      message,
    );

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer re_123");
    expect(JSON.parse(String(init.body))).toEqual({ from: "INS <no-reply@ins.test>", ...message });
  });

  it("throws when Resend refuses, so the caller logs the failure", async () => {
    const fetch = vi.fn(async () => new Response("nope", { status: 422 }));
    const mailer = createMailer({ from: "x@ins.test", resendApiKey: "re_123", fetch });
    await expect(mailer.send(message)).rejects.toThrow("Resend responded 422");
  });

  it("refuses to start without any transport", () => {
    expect(() => createMailer({ from: "x@ins.test" })).toThrow(/RESEND_API_KEY or SMTP_URL/);
  });

  it("builds an SMTP transport from a URL", () => {
    expect(createMailer({ from: "x@ins.test", smtpUrl: "smtp://localhost:1025" })).toHaveProperty(
      "send",
    );
  });
});

describe("messages", () => {
  it("renders the verification email with the link in both parts", async () => {
    const url = "https://ins.test/verify-email?token=abc_DEF-123";
    const msg = await verifyEmailMessage("maya@example.com", { name: "Maya", url });
    expect(msg.to).toBe("maya@example.com");
    expect(msg.subject).toBe("Confirm your email for INS");
    expect(msg.html).toContain(url);
    expect(msg.text).toContain(url);
    expect(msg.text).toContain("Maya");
  });

  it("escapes a hostile display name in the HTML", async () => {
    const msg = await verifyEmailMessage("x@example.com", {
      name: "<script>alert(1)</script>",
      url: "https://ins.test/verify-email?token=t",
    });
    expect(msg.html).not.toContain("<script>alert(1)</script>");
  });

  it("renders the sign-up attempt notice with sign-in and reset links", async () => {
    const msg = await signUpAttemptMessage("maya@example.com", {
      name: "Maya",
      loginUrl: "https://ins.test/login",
      resetUrl: "https://ins.test/reset-password",
    });
    expect(msg.subject).toBe("Someone tried to sign up with your email");
    expect(msg.text).toContain("https://ins.test/login");
    expect(msg.text).toContain("https://ins.test/reset-password");
  });
});
