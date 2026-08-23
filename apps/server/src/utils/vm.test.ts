import { expect, test } from "bun:test";
import runCode from "./vm";

test("executes a vendor adapter and returns its exports", () => {
  const result = runCode('exports.vendor = { id: "demo" };');

  expect(result.vendor).toEqual({ id: "demo" });
});

test("disables string code generation inside vendor adapters", () => {
  const result = runCode(`
    try {
      exports.value = Function("return 1")();
    } catch {
      exports.value = "blocked";
    }
  `);

  expect(result.value).toBe("blocked");
});
