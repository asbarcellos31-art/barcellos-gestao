import { describe, it, expect } from "vitest";

describe("SendGrid API Key validation", () => {
  it("should have SENDGRID_API_KEY set in environment", () => {
    const key = process.env.SENDGRID_API_KEY;
    expect(key).toBeDefined();
    expect(key).not.toBe("");
    expect(key?.startsWith("SG.")).toBe(true);
  });

  it("should have SENDGRID_FROM_EMAIL set", () => {
    const email = process.env.SENDGRID_FROM_EMAIL;
    expect(email).toBeDefined();
    expect(email).toContain("@");
  });

  it("should have SENDGRID_FROM_NAME set", () => {
    const name = process.env.SENDGRID_FROM_NAME;
    expect(name).toBeDefined();
    expect(name).not.toBe("");
  });

  it("should be able to reach SendGrid API with the provided key", async () => {
    const key = process.env.SENDGRID_API_KEY;
    if (!key) {
      throw new Error("SENDGRID_API_KEY not set");
    }

    const res = await fetch("https://api.sendgrid.com/v3/user/profile", {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    });

    // 200 = valid key, 401 = invalid key
    expect(res.status).toBe(200);
  }, 20000);
});
