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
  if (name === "login" && location.hostname === "jnthhrn8.github.io" && location.hash !== "#owner-login") { location.assign("https://forge.tetheredunicorn.com/#login"); return; }
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
document
  .querySelector("#accessRequestForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!document.querySelector("#consent").checked)
      return toast("Read and accept the field-test notice before requesting access");
    if (!document.querySelector("#ageConfirmed").checked)
      return toast("You must confirm that you are at least 18 years old");
    const node = publicFieldAccess ? urls()[0] : null;
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
        consent: true,
        ageConfirmed: true,
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
  document.querySelector("#ownerAccess").hidden = false;
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
