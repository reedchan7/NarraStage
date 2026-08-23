import { describe, expect, test } from "bun:test";
import { assertOperatorClaims } from "@/security/principal";

describe("operator authorization", () => {
  test("requires an explicit operator role for paid-submission reconciliation", () => {
    expect(() => assertOperatorClaims({ id: 42, role: "user" })).toThrow(
      "authorization.operator_required",
    );
    expect(() => assertOperatorClaims({ id: 1, role: "operator" })).not.toThrow();
    expect(() => assertOperatorClaims({ id: 1, name: "admin" })).toThrow(
      "authorization.operator_required",
    );
  });
});
