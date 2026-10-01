"use strict";
document.querySelector("#consent").checked = false;
window.addEventListener("pageshow", () => {
  document.querySelector("#consent").checked = false;
});
const baseLogin = document.querySelector("#login").onclick;
document.querySelector("#login").onclick = () =>
  document.querySelector("#consent").checked
    ? baseLogin()
    : toast("Accept the pre-alpha data and training notice first");
let ownerExport = null;
function downloadRecord(name, value) {
  const link = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector("#adminUsers").addEventListener("click", (event) => {
  const button = event.target.closest("[data-owner-user]");
  if (!button) return;
  setTimeout(() => {
    document
      .querySelector("#adminChat")
      .insertAdjacentHTML(
        "beforeend",
        '<div class="toolbar"><button id="exportTester">Download original + redacted</button><button id="finalizeTester" class="danger">Finalize and delete original</button></div>',
      );
    document.querySelector("#exportTester").onclick = async () => {
      const result = await ownerRequest(
        "/api/field/admin/export/" +
          encodeURIComponent(button.dataset.ownerUser),
      );
      ownerExport = result.bundle;
      downloadRecord(
        ownerExport.username + "-original.json",
        ownerExport.original,
      );
      downloadRecord(
        ownerExport.username + "-redacted.json",
        ownerExport.redacted,
      );
      toast("Both portable records downloaded");
    };
    document.querySelector("#finalizeTester").onclick = async () => {
      if (!ownerExport || ownerExport.username !== button.dataset.ownerUser)
        return toast("Download both records first");
      if (
        !confirm(
          "Permanently delete this tester account and all original data? Only the redacted training copy will remain.",
        )
      )
        return;
      await ownerRequest("/api/field/admin/finalize", {
        username: ownerExport.username,
        digest: ownerExport.digest,
      });
      ownerExport = null;
      document.querySelector("#adminChat").innerHTML = "";
      await refreshOwner();
      toast("Original data deleted; redacted copy retained");
    };
  }, 80);
});
