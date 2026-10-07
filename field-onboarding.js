"use strict";
const PUBLIC_REQUEST_ENDPOINT =
  "https://messages.tetheredunicorn.com/field-request";
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
if (publicFieldAccess) {
  invitationToggle.closest("label").hidden = true;
  document.querySelector("#noInvitationAddress").textContent = "Request access here. Once approved, use your enrollment code to create a password and log in on this website.";
}
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
    if (!document.querySelector("#ageConfirmed").checked)
      return toast("You must confirm that you are at least 18 years old");
    const hasInvitationAddress = !publicFieldAccess && invitationToggle.checked;
    const invitationAddress = String(new FormData(event.currentTarget).get("requestForgeUrl") || "").trim().replace(/\/$/, "");
    let node = publicFieldAccess ? urls()[0] : null;
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
    const requestPayload = {
      ...identity,
      deliveryMethod: "private",
      consent: true,
      ageConfirmed: true,
      onboarding,
      feedback,
    };
    if (!node) {
      try {
        const response = await fetch(PUBLIC_REQUEST_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...requestPayload,
            consent: true,
            ageConfirmed: true,
            website: "",
          }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(result.error || "The private request channel is unavailable");
        event.currentTarget.reset();
        document.querySelector("#invitationAddressFields").hidden = true;
        document.querySelector("#noInvitationAddress").hidden = false;
        toast(`Request sent privately · reference ${result.reference}`);
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    try {
      await raw(node, "/api/field/access-request", {
        ...requestPayload,
      });
      event.currentTarget.reset();
      toast("Request sent. Once approved, use your enrollment code here.");
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
    if (!document.querySelector("#ageConfirmed").checked)
      return toast("You must confirm that you are at least 18 years old");
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
  if (publicFieldAccess && !active) return;
  document.querySelector("#welcomePanel").hidden = true;
  document.querySelector("#detailsPanel").hidden = true;
  document.querySelector("#creditsPanel").hidden = true;
  document.querySelector("#consentNotice").hidden = true;
  document.querySelector("#onboardingPanel").hidden = true;
  document.body.classList.add("chat-open");
};


// Keep owner authentication on its registered origin.
function showOwnerLogin() {
  if (location.hash !== "#owner-login") return;
  if (document.documentElement.dataset.publicField === "true") {
    location.assign("https://jnthhrn8.github.io/unicornforge-field-console/#owner-login");
    return;
  }
  showPublicView("login");
  document.querySelector("#consentNotice").hidden = true;
  const ownerButton = document.querySelector("#ownerConsole");
  ownerButton.closest("details").open = true;
  const address = document.querySelector("#tufUrl");
  if (!address.value.trim()) address.value = "https://tuf-unicorn.tail0e71ff.ts.net:3211";
  ownerButton.focus();
  ownerButton.scrollIntoView({ block: "center" });
}
window.addEventListener("hashchange", showOwnerLogin);
document.querySelectorAll('a[href$="#owner-login"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    if (location.origin === "https://jnthhrn8.github.io") {
      event.preventDefault();
      location.hash = "owner-login";
      showOwnerLogin();
    }
  });
});
showOwnerLogin();
