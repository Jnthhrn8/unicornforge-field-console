const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const onboarding = fs.readFileSync(
  path.join(root, "field-onboarding.js"),
  "utf8",
);
const compliance = fs.readFileSync(
  path.join(root, "field-compliance.js"),
  "utf8",
);

test("field test is strictly 18+ with explicit unchecked attestation", () => {
  assert.match(html, /id="ageConfirmed" type="checkbox"/);
  assert.match(html, /People under 18 may not register for or use/);
  assert.doesNotMatch(html, /parent\/guardian permission/i);
  assert.match(compliance, /#ageConfirmed"\)\.checked = false/g);
});

test("consent and age are required for request, claim, and login", () => {
  assert.match(onboarding, /#consent/);
  assert.match(onboarding, /#ageConfirmed/);
  assert.match(onboarding, /ageConfirmed: true/);
  assert.match(compliance, /#consent/);
  assert.match(compliance, /#ageConfirmed/);
});

test("applicants without an invitation use the secure queue", () => {
  assert.match(
    onboarding,
    /https:\/\/messages\.tetheredunicorn\.com\/field-request/,
  );
  assert.match(onboarding, /Request sent privately · reference/);
  assert.doesNotMatch(onboarding, /mailto:/i);
  assert.doesNotMatch(onboarding, /new Blob/);
  assert.doesNotMatch(onboarding, /URL\.createObjectURL/);
});

test("testers use the public website without private addresses", () => {
  assert.doesNotMatch(html, /hasInvitationAddress|requestForgeUrl|tail0e71ff/);
  assert.doesNotMatch(onboarding, /tail0e71ff|private Tailscale HTTPS address/);
  assert.match(html, /id="ownerAccess" hidden/);
  const entry = fs.readFileSync(path.join(root, 'field-entry.js'), 'utf8');
  assert.match(entry, /forge\.tetheredunicorn\.com/);
  assert.match(entry, /#owner-login/);
});
