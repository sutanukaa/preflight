import { describe, it, expect } from "vitest";
import { BILLING_PLANS } from "../src/lib/polar";

describe("Polar SaaS Billing Plans", () => {
  it("should have Free, Pro, and Enterprise tiers with correct feature structures", () => {
    expect(BILLING_PLANS.length).toBe(3);

    const free = BILLING_PLANS.find((p) => p.name === "Free");
    expect(free).toBeDefined();
    expect(free?.price).toBe("$0");

    const pro = BILLING_PLANS.find((p) => p.name === "Pro");
    expect(pro).toBeDefined();
    expect(pro?.price).toBe("$29");
    expect(pro?.popular).toBe(true);

    const enterprise = BILLING_PLANS.find((p) => p.name === "Enterprise");
    expect(enterprise).toBeDefined();
    expect(enterprise?.price).toBe("$99");
  });
});
