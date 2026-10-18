import test from "node:test";
import assert from "node:assert/strict";
import {
  apps,
  email,
  assertAccess,
  assertLastAdmin,
  contactInput,
  subjectPart,
} from "../policy.js";
test("access requires an invited or active profile and admin privileges cannot be supplied by client", () => {
  assert.throws(() => assertAccess(undefined));
  assert.throws(() => assertAccess({ status: "disabled", role: "admin" }));
  assert.throws(() => assertAccess({ status: "active", role: "member" }, true));
  assert.throws(() => assertAccess({ status: "invited", role: "admin" }, true));
  assert.doesNotThrow(() =>
    assertAccess({ status: "active", role: "admin" }, true),
  );
});
test("last administrator cannot be disabled", () => {
  assert.throws(() =>
    assertLastAdmin({ role: "admin", status: "active" }, "disabled", 1),
  );
  assert.doesNotThrow(() =>
    assertLastAdmin({ role: "admin", status: "active" }, "disabled", 2),
  );
});
test("only registered app IDs and valid email addresses are accepted", () => {
  assert.deepEqual(apps(["oil-gas", "oil-gas"]), ["oil-gas"]);
  assert.throws(() => apps(["admin"]));
  assert.equal(email(" USER@example.com "), "user@example.com");
  assert.throws(() => email("bad\n@example.com"));
});
test("contact validation rejects malformed, oversized and unknown inputs", () => {
  const input = {
    name: "A",
    email: "a@example.com",
    company: "",
    industry: "Oil & Gas",
    message: "A meaningful enquiry",
    requestId: "00000000-0000-0000-0000-000000000000",
  };
  assert.equal(contactInput(input).industry, "Oil & Gas");
  assert.throws(() => contactInput({ ...input, message: "x" }));
  assert.throws(() => contactInput({ ...input, message: "x".repeat(5001) }));
  assert.throws(() => contactInput({ ...input, industry: "Anything" }));
  assert.throws(() => contactInput({ ...input, requestId: "bad" }));
});
test("email subject parts are single-line and length-capped", () => {
  assert.equal(subjectPart("  Kirk\r\nBcc: x@y.z\t Smith "), "Kirk Bcc: x@y.z Smith");
  assert.equal(subjectPart("a\u2028b"), "a b");
  const long = subjectPart("x".repeat(200));
  assert.equal(long.length, 60);
  assert.ok(long.endsWith("…"));
  assert.equal(subjectPart(undefined), "");
});
