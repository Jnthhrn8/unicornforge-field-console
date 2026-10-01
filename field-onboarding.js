"use strict";
const publicViews = {
  welcome: document.querySelector("#welcomePanel"),
  details: document.querySelector("#detailsPanel"),
  login: document.querySelector("#loginPanel"),
  credits: document.querySelector("#creditsPanel"),
};
function showPublicView(name) {
  Object.values(publicViews).forEach((view) => (view.hidden = true));
  document.querySelector("#consentNotice").hidden = name !== "login";
  if (publicViews[name]) publicViews[name].hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => showPublicView(button.dataset.view)),
  );
const invitationToggle = document.querySelector("#hasInvitationAddress");
invitationToggle.addEventListener("change", () => {
  document.querySelector("#invitationAddressFields").hidden = !invitationToggle.checked;
  document.querySelector("#noInvitationAddress").hidden = invitationToggle.checked;
  document.querySelector('[name="requestForgeUrl"]').required = invitationToggle.checked;
});
document
  .querySelector("#accessRequestForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!document.querySelector("#consent").checked)
      return toast("Read and accept the field-test notice before requesting access");
    const hasInvitationAddress = invitationToggle.checked;
    const invitationAddress = String(new FormData(event.currentTarget).get("requestForgeUrl") || "").trim().replace(/\/$/, "");
    let node = null;
    if (hasInvitationAddress) {
      let parsedInvitationAddress;
      try { parsedInvitationAddress = new URL(invitationAddress); }
      catch { return toast("Paste the complete private address from your invitation"); }
      if (parsedInvitationAddress.protocol !== "https:" || !parsedInvitationAddress.hostname.toLowerCase().endsWith(".ts.net")) return toast("The invitation must use a private Tailscale HTTPS address");
      document.querySelector("#tufUrl").value = invitationAddress;
      node = urls()[0];
    }
    const identity = formRecord(event.currentTarget, [
      "name",
      "email",
      "phone",
      "username",
      "reason",
    ]);
    const onboarding = formRecord(event.currentTarget, [
      "goals",
      "communicationStyle",
      "experience",
      "assistantStyle",
      "accessibility",
    ]);
    const feedback = formRecord(event.currentTarget, [
      "devices",
      "workflows",
      "frustrations",
      "mustHave",
      "privacyComfort",
      "testingAvailability",
      "other",
    ]);
    const requestPayload = { ...identity, deliveryMethod: "private", onboarding, feedback };
    if (!hasInvitationAddress) {
      const blob = new Blob([JSON.stringify({ type: "unicorn-forge-access-request", version: 1, createdAt: new Date().toISOString(), ...requestPayload }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `UnicornForge-access-request-${identity.username}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      location.href = `mailto:TetheredUnicorn@gmail.com?subject=${encodeURIComponent(`Private Unicorn Forge access request · @${identity.username}`)}&body=${encodeURIComponent("Hello The Unicorn,\n\nI would like to request private field-test access. I have attached the UnicornForge access-request JSON file that was just downloaded. I understand approval is not automatic or guaranteed.\n\nThank you.")}`;
      return toast("Request file downloaded; attach it to the private email that opened");
    }
    try {
      await raw(node, "/api/field/access-request", {
        ...requestPayload,
      });
      event.currentTarget.reset();
      toast("Request sent to The Unicorn through ntfy");
    } catch (error) {
      toast(error.message);
    }
  });
document
  .querySelector("#claimAccessForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!document.querySelector("#consent").checked)
      return toast("Read and accept the field-test notice before claiming access");
    const node = urls()[0],
      values = formRecord(event.currentTarget, [
        "username",
        "code",
        "password",
        "confirmPassword",
      ]);
    if (!node) return toast("A Forge address is required");
    if (values.password !== values.confirmPassword)
      return toast("Passwords do not match");
    try {
      await raw(node, "/api/field/claim", {
        username: values.username,
        code: values.code,
        password: values.password,
      });
      document.querySelector("#username").value = values.username;
      document.querySelector("#password").value = values.password;
      event.currentTarget.reset();
      toast("Account claimed. You can now log in.");
    } catch (error) {
      toast(error.message);
    }
  });
function formRecord(form, names) {
  const data = new FormData(form);
  return Object.fromEntries(
    names.map((name) => [
      name,
      name === "creditConsent"
        ? data.has(name)
        : String(data.get(name) || "").trim(),
    ]),
  );
}
document
  .querySelector("#onboardingForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!active) return toast("Log in before saving your profile");
    const form = event.currentTarget,
      onboarding = formRecord(form, [
        "name",
        "email",
        "phone",
        "pronouns",
        "timezone",
        "occupation",
        "goals",
        "communicationStyle",
        "assistantStyle",
        "accessibility",
        "experience",
      ]),
      feedback = formRecord(form, [
        "devices",
        "workflows",
        "frustrations",
        "mustHave",
        "privacyComfort",
        "testingAvailability",
        "other",
      ]),
      acknowledgments = formRecord(form, ["displayName", "creditConsent"]);
    try {
      profile = (
        await api(active, "/api/field/profile", {
          memory: `Goals: ${onboarding.goals}\nCommunication: ${onboarding.communicationStyle}\nAssistant style: ${onboarding.assistantStyle}\nAccessibility: ${onboarding.accessibility}`,
          personality: onboarding.assistantStyle,
          onboarding,
          feedback,
          acknowledgments,
        })
      ).profile;
      document.querySelector("#onboardingPanel").hidden = true;
      document.querySelector("#consolePanel").hidden = false;
      toast("Welcome to the First Testers");
      render();
    } catch (error) {
      toast(error.message);
    }
  });
const openFieldConsole = openConsole;
openConsole = async function () {
  await openFieldConsole();
  document.querySelector("#welcomePanel").hidden = true;
  document.querySelector("#detailsPanel").hidden = true;
  document.querySelector("#creditsPanel").hidden = true;
  document.querySelector("#consentNotice").hidden = true;
  if (!profile.onboarding?.name) {
    document.querySelector("#consolePanel").hidden = true;
    document.querySelector("#onboardingPanel").hidden = false;
  }
};
