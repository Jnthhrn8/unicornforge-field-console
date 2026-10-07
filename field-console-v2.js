"use strict";
const publicFieldAccess = document.documentElement.dataset.publicField === "true";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let nodes = [],
  active = null,
  profile = { messages: [] },
  personalityDrafts = [],
  editingPersonalityId = "",
  shownFeedbackToken = "",
  ownerDebugUser = "", ownerReplyBusy = false, ownerLoading = false, ownerRefreshBusy = false,
  timer, refreshing = false, refreshFailures = 0;
function normalizedPersonalities(value = profile) {
  const source = Array.isArray(value.personalities) && value.personalities.length
    ? value.personalities.slice(0, 4)
    : [{ id: "forge", name: "Forge", instructions: value.personality || value.onboarding?.assistantStyle || "" }];
  return source.map((item, index) => ({ id: String(item.id || `personality-${index + 1}`), name: String(item.name || `Personality ${index + 1}`).slice(0, 40), instructions: String(item.instructions || "").slice(0, 4000), createdAt: Number(item.createdAt || Date.now()) }));
}
function capturePersonalityEditor() {
  const item = personalityDrafts.find((entry) => entry.id === editingPersonalityId);
  if (!item || !$("#personalityName")) return;
  item.name = $("#personalityName").value.trim().slice(0, 40) || "Unnamed personality";
  item.instructions = $("#personalityDescription").value.trim().slice(0, 4000);
}
function renderPersonalityControls() {
  if (!personalityDrafts.length) personalityDrafts = normalizedPersonalities();
  if (!personalityDrafts.some((item) => item.id === editingPersonalityId)) editingPersonalityId = personalityDrafts[0].id;
  const available = [...personalityDrafts, ...(profile.learnedPersonality ? [profile.learnedPersonality] : [])];
  if (!available.some((item) => item.id === profile.activePersonalityId)) profile.activePersonalityId = personalityDrafts[0].id;
  const options = personalityDrafts.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
  const activeOptions = `${options}${profile.learnedPersonality ? `<option value="${esc(profile.learnedPersonality.id)}">${esc(profile.learnedPersonality.name)}</option>` : ''}`;
  $("#chatPersonality").innerHTML = activeOptions;
  $("#chatPersonality").value = profile.activePersonalityId;
  $("#personalityEditor").innerHTML = options;
  $("#personalityEditor").value = editingPersonalityId;
  const current = personalityDrafts.find((item) => item.id === editingPersonalityId);
  $("#personalityName").value = current?.name || "";
  $("#personalityDescription").value = current?.instructions || "";
  $("#personalityCount").textContent = `${personalityDrafts.length} of 4`;
  $("#newPersonality").disabled = personalityDrafts.length >= 4;
  $("#deletePersonality").disabled = personalityDrafts.length <= 1;
}
async function persistPersonalities(message = "Profile saved") {
  capturePersonalityEditor();
  const r = await api(active, "/api/field/profile", { memory: $("#memory").value, personalities: personalityDrafts, activePersonalityId: profile.activePersonalityId });
  profile = r.profile;
  personalityDrafts = normalizedPersonalities(profile);
  renderPersonalityControls();
  toast(message);
}
const b64ToBuf = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const bufToB64 = (b) =>
  btoa(String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
function toast(t) {
  if (t === "Login failed on both Forge computers")
    t =
      "The Unicorn Forge server is not running or is overloaded. Try again shortly.";
  $("#toast").textContent = t;
  $("#toast").classList.add("show");
  setTimeout(() => $("#toast").classList.remove("show"), 2500);
}
function urls() {
  if (publicFieldAccess) return [{ id: "tuf", name: "Unicorn Forge", url: location.origin }];
  return ["tuf", "strix"]
    .map((id) => ({
      id,
      name: id.toUpperCase(),
      url: $("#" + id + "Url")
        .value.trim()
        .replace(/\/$/, ""),
    }))
    .filter((n) => n.url);
}
async function raw(n, p, body, headers = {}) {
  const r = await fetch(n.url + p, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    credentials: publicFieldAccess ? "same-origin" : "omit",
  });
  let x;
  try { x = await r.json(); } catch {
    throw Error("Forge is temporarily unreachable. Your draft is still here; reconnecting shortly.");
  }
  if (!r.ok) {
    if (publicFieldAccess && active && (r.status === 401 || r.status === 403) && p !== "/api/field/login") {
      clearInterval(timer);
      active = null;
      nodes = [];
      profile = { messages: [] };
      $("#messages").replaceChildren();
      for (const id of ["consolePanel", "profilePanel", "feedbackPanel", "onboardingPanel"]) $("#" + id).hidden = true;
      $("#loginPanel").hidden = false;
      $("#consentNotice").hidden = false;
      $("#connectionState").textContent = "Please log in again";
    }
    throw Error(x.error || "Request failed");
  }
  return x;
}
async function api(n, p, body) {
  if (ownerDebugUser) {
    if (p === '/api/field/profile' && body === undefined) return ownerRequest('/api/field/admin/tester/profile?username=' + encodeURIComponent(ownerDebugUser));
    if (p === '/api/field/chat') return ownerRequest('/api/field/admin/tester/chat', { ...body, username: ownerDebugUser });
    throw Error('This action is unavailable while debugging a tester. Return to owner controls.');
  }
  return raw(n, p, body, publicFieldAccess ? {} : { Authorization: "Bearer " + n.token });
}
async function login() {
  const username = $("#username").value.trim(),
    password = $("#password").value;
  if (!username || !password) return toast("Enter username and password");
  const checked = await Promise.all(
    urls().map(async (n) => {
      try {
        const s = await raw(n, "/api/field/status");
        const l = await raw(n, "/api/field/login", { username, password });
        return { ...n, ...s, ...l, online: true };
      } catch (e) {
        return { ...n, error: e.message };
      }
    }),
  );
  nodes = checked.filter((n) => n.online);
  for (const n of checked)
    $("#" + n.id + "State").textContent = n.online
      ? "Online · " + n.computer
      : "Unavailable · " + n.error;
  if (!nodes.length) return toast(publicFieldAccess ? checked[0]?.error || "The tester server is unavailable" : "Login failed on both Forge computers");
  if (!publicFieldAccess) sessionStorage.setItem("unicornforge.field.tokens", JSON.stringify(nodes));
  if (!publicFieldAccess && $("#rememberAddresses").checked)
    localStorage.setItem(
      "unicornforge.field.addresses",
      JSON.stringify(Object.fromEntries(nodes.map((n) => [n.id, n.url]))),
    );
  $("#password").value = "";
  openConsole();
}
async function openConsole() {
  active = nodes[0];
  $("#computer").innerHTML = nodes
    .map(
      (n) => `<option value="${n.id}">${n.name} · ${esc(n.computer)}</option>`,
    )
    .join("");
  $("#loginPanel").hidden = true;
  $("#consolePanel").hidden = false;
  $("#connectionState").textContent = (ownerDebugUser ? "OWNER DEBUG · " + ownerDebugUser : active.name + " · " + active.username);
  await api(active, "/api/field/device", {
    browser: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform,
    language: navigator.language,
    screen: `${screen.width}x${screen.height} @${window.devicePixelRatio || 1}x`,
    cpuThreads: navigator.hardwareConcurrency || 0,
    deviceMemoryGb: navigator.deviceMemory || 0,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    touchPoints: navigator.maxTouchPoints || 0,
  }).catch(() => {});
  await refresh();
  if (!active) return;

}
async function refresh() {
  if (!active || refreshing) return;
  clearTimeout(timer);
  refreshing = true;
  const requestNode = active;
  try {
    const editingProfile = $("#profilePanel").contains(document.activeElement);
    const r = await api(active, "/api/field/profile");
    if (active !== requestNode) return;
    refreshFailures = 0;
    $("#connectionState").textContent = active.name + " · " + active.username;
    profile = r.profile;
    if (r.feedbackPrompt && r.feedbackPrompt.token !== shownFeedbackToken) {
      shownFeedbackToken = r.feedbackPrompt.token;
      $("#feedbackQuestion").textContent = r.feedbackPrompt.question;
      $("#feedbackPanel").hidden = false;
    }
    $("#model").innerHTML = r.models
      .map((m) => `<option value="${esc(m.name)}">${esc(m.name)}</option>`)
      .join("");
    if (profile.model) $("#model").value = profile.model;
    if (!editingProfile) {
      $("#memory").value = profile.memory || "";
      personalityDrafts = normalizedPersonalities(profile);
      editingPersonalityId = personalityDrafts.some((item) => item.id === editingPersonalityId) ? editingPersonalityId : profile.activePersonalityId;
      renderPersonalityControls();
    }
    $("#profileRole").hidden = profile.role !== "owner";
    $("#profileRole").textContent = profile.role === "owner" ? "THE UNICORN · OWNER" : "";
    $("#ownerFromChat").hidden = publicFieldAccess || profile.role !== "owner";
    $("#send").disabled = r.running;
    render();
  } catch (e) {
    refreshFailures += 1;
    if (active) $("#connectionState").textContent = "Connection interrupted · retrying automatically";
  } finally {
    refreshing = false;
    if (active) timer = setTimeout(refresh, Math.min(30000, 1500 * 2 ** refreshFailures));
  }
}
function render() {
  const m = profile.messages || [];
  const signature = JSON.stringify(m);
  if ($("#messages").dataset.signature === signature) return;
  $("#messages").dataset.signature = signature;
  const nearBottom = $("#messages").scrollHeight - $("#messages").scrollTop - $("#messages").clientHeight < 100;
  $("#messages").innerHTML = m.length
    ? m
        .map(
          (x) =>
            `<article class="message ${esc(x.role)}${x.human ? " human" : ""}"><small>${x.role === "user" ? (x.ownerTest ? "THE UNICORN · OWNER TEST" : "YOU") : x.human ? "THE UNICORN · HUMAN REPLY" : `${esc(x.personalityName || "FORGE")} · ${esc(x.model || "LOCAL MODEL")}`}${x.pending ? " · LIVE" : ""}</small>${esc(x.text)}${
              x.activity?.length
                ? `<div class="activity">${x.activity
                    .slice(-10)
                    .map(
                      (a) =>
                        `<div><b>${esc(a.tool || a.event)}</b>${a.command ? `<code>${esc(a.command)}</code>` : ""}${a.reply ? `<code>${esc(a.reply)}</code>` : ""}</div>`,
                    )
                    .join("")}</div>`
                : ""
            }</article>`,
        )
        .join("")
    : '<p class="empty">What would you like to work on? Forge adapts as you talk; no personality questionnaire needed.</p>';
  if (nearBottom) $("#messages").scrollTop = $("#messages").scrollHeight;
}
function credentialJSON(c) {
  return {
    id: c.id,
    rawId: bufToB64(c.rawId),
    type: c.type,
    response: {
      clientDataJSON: bufToB64(c.response.clientDataJSON),
      attestationObject: c.response.attestationObject
        ? bufToB64(c.response.attestationObject)
        : undefined,
      authenticatorData: c.response.authenticatorData
        ? bufToB64(c.response.authenticatorData)
        : undefined,
      signature: c.response.signature
        ? bufToB64(c.response.signature)
        : undefined,
      userHandle: c.response.userHandle
        ? bufToB64(c.response.userHandle)
        : undefined,
      transports: c.response.getTransports?.() || [],
    },
    clientExtensionResults: c.getClientExtensionResults(),
  };
}
function publicKey(o) {
  return {
    ...o,
    challenge: b64ToBuf(o.challenge),
    user: o.user ? { ...o.user, id: b64ToBuf(o.user.id) } : undefined,
    excludeCredentials: o.excludeCredentials?.map((c) => ({
      ...c,
      id: b64ToBuf(c.id),
    })),
    allowCredentials: o.allowCredentials?.map((c) => ({
      ...c,
      id: b64ToBuf(c.id),
    })),
  };
}
async function adminToken(n) {
  const o = await raw(n, "/api/field/fido/auth-options", {}),
    c = await navigator.credentials.get({ publicKey: publicKey(o.options) });
  return (
    await raw(n, "/api/field/fido/auth-verify", {
      id: o.id,
      response: credentialJSON(c),
    })
  ).adminToken;
}
$("#login").onclick = login;
$("#computer").onchange = () => {
  active = nodes.find((n) => n.id === $("#computer").value);
  refresh();
};
$("#settings").onclick = () =>
  ($("#profilePanel").hidden = !$("#profilePanel").hidden);
$("#feedback").onclick = () => { $("#feedbackQuestion").textContent = "What should Unicorn Forge improve?"; $("#feedbackPanel").hidden = false; $("#feedbackMessage").focus(); };
$("#closeFeedback").onclick = () => ($("#feedbackPanel").hidden = true);
$("#feedbackForm").onsubmit = async (event) => { event.preventDefault(); try { await api(active, "/api/field/feedback", { question: $("#feedbackQuestion").textContent, message: $("#feedbackMessage").value }); $("#feedbackMessage").value = ""; $("#feedbackPanel").hidden = true; toast("Feedback sent privately to The Unicorn"); } catch (error) { toast(error.message); } };
$("#dismissFeedback").onclick = async () => { try { await api(active, "/api/field/feedback", { dismiss: true }); $("#feedbackPanel").hidden = true; toast("Feedback question dismissed"); } catch (error) { toast(error.message); } };
$("#saveProfile").onclick = () => persistPersonalities("Memory and personalities saved").catch((error) => toast(error.message));
$("#personalityEditor").onchange = () => { capturePersonalityEditor(); editingPersonalityId = $("#personalityEditor").value; renderPersonalityControls(); };
$("#newPersonality").onclick = () => {
  capturePersonalityEditor();
  if (personalityDrafts.length >= 4) return toast("Each tester can have up to four personalities");
  const id = `personality-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  personalityDrafts.push({ id, name: `Personality ${personalityDrafts.length + 1}`, instructions: "", createdAt: Date.now() });
  editingPersonalityId = id;
  renderPersonalityControls();
  $("#personalityDescription").focus();
};
$("#deletePersonality").onclick = async () => {
  if (personalityDrafts.length <= 1) return toast("Keep at least one personality");
  const current = personalityDrafts.find((item) => item.id === editingPersonalityId);
  if (!confirm(`Delete ${current?.name || "this personality"}?`)) return;
  personalityDrafts = personalityDrafts.filter((item) => item.id !== editingPersonalityId);
  editingPersonalityId = personalityDrafts[0].id;
  if (!personalityDrafts.some((item) => item.id === profile.activePersonalityId)) profile.activePersonalityId = editingPersonalityId;
  await persistPersonalities("Personality deleted").catch((error) => toast(error.message));
};
$("#usePersonality").onclick = async () => { capturePersonalityEditor(); profile.activePersonalityId = editingPersonalityId; await persistPersonalities("Active personality changed").catch((error) => toast(error.message)); };
$("#chatPersonality").onchange = async () => { capturePersonalityEditor(); profile.activePersonalityId = $("#chatPersonality").value; await persistPersonalities("Active personality changed").catch((error) => toast(error.message)); };
$("#namePersonality").onclick = async () => {
  capturePersonalityEditor();
  const item = personalityDrafts.find((entry) => entry.id === editingPersonalityId);
  if (!item?.instructions) return toast("Describe the personality first");
  const button = $("#namePersonality"); button.disabled = true; button.textContent = "Choosing a name…";
  try { const result = await api(active, "/api/field/personality/name", { description: item.instructions, model: $("#model").value }); item.name = result.name; renderPersonalityControls(); toast(`${result.name} chose its name`); }
  catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = "Let this AI name itself"; }
};
$("#clear").onclick = async () => {
  if (confirm("Clear your field-test chat?")) {
    profile = (await api(active, "/api/field/chat/clear", {})).profile;
    render();
  }
};
$("#logout").onclick = async () => {
  try { await Promise.all(nodes.map(node => api(node, "/api/field/logout", {}))); }
  catch (error) { return toast("Could not log out. Check your connection and try again."); }
  clearInterval(timer);
  sessionStorage.removeItem("unicornforge.field.tokens");
  location.reload();
};
$("#composer").onsubmit = async (e) => {
  e.preventDefault();
  const message = $("#prompt").value.trim();
  if (!message) return;
  $("#send").disabled = true;
  try {
    await api(active, "/api/field/chat", {
      message,
      model: $("#model").value,
      runMode: $("#runMode").value,
    });
    $("#prompt").value = "";
    refresh();
  } catch (x) {
    toast(x.message);
    $("#send").disabled = false;
  }
};
const a = JSON.parse(
  (!publicFieldAccess && localStorage.getItem("unicornforge.field.addresses")) || "{}",
);
for (const id of ["tuf", "strix"]) if (a[id]) $("#" + id + "Url").value = a[id];
try {
  nodes = JSON.parse(
    (!publicFieldAccess && sessionStorage.getItem("unicornforge.field.tokens")) || "[]",
  );
  if (nodes.length) openConsole();
} catch {}
if (publicFieldAccess) {
  $("#loginPanel .connections").hidden = true;
  $("#rememberAddresses").closest("label").hidden = true;
  $("#ownerConsole").closest("details").hidden = true;
  $("#computer").hidden = true;
  $("#runMode").innerHTML = '<option value="single">Chat</option>';
  $("#runMode").value = "single";
  $("#publicTesterNotice").hidden = false;
  window.addEventListener("DOMContentLoaded", async () => {
    try {
      const node = urls()[0];
      const session = await raw(node, "/api/field/session");
      nodes = [{ ...node, ...session, online: true }];
      await openConsole();
    } catch { if (!active) showPublicView("login"); }
  });
}
let ownerNode = null,
  ownerToken = "",
  selectedOwnerUser = "",
  lastEnrollmentCode = "",
  ownerTimer;
const ownerReplyDrafts = new Map();
async function ownerRequest(path, body) {
  return raw(ownerNode, path, body, { "X-Field-Admin": ownerToken });
}
async function openTesterDebug(username) {
  await ownerRequest('/api/field/admin/tester/profile?username=' + encodeURIComponent(username));
  clearInterval(ownerTimer); clearTimeout(timer);
  ownerDebugUser = username;
  active = { ...ownerNode, username, name: 'Owner debugging' };
  document.body.classList.add('chat-open');
  $('#adminPanel').hidden = true; $('#consolePanel').hidden = false;
  for (const id of ['settings','feedback','clear','logout','ownerFromChat','profilePanel','feedbackPanel']) $('#'+id).hidden = true;
  $('#computer').closest('label').hidden = true; $('#runMode').closest('label').hidden = true; $('#chatPersonality').closest('label').hidden = true;
  let banner = document.querySelector('#ownerDebugBanner');
  if (!banner) { banner = document.createElement('aside'); banner.id='ownerDebugBanner'; banner.className='legal-card'; $('#consolePanel').prepend(banner); }
  banner.hidden=false;
  banner.innerHTML='<strong>Owner debugging · '+esc(username)+'</strong><p>This is the tester’s actual conversation. Your prompts are labeled as owner tests and do not train their personality.</p><button type="button" id="returnToOwner">Return to owner controls</button>';
  $('#returnToOwner').onclick=async()=>{
    clearTimeout(timer); ownerDebugUser=''; active=null; banner.hidden=true;
    $('#consolePanel').hidden=true; $('#adminPanel').hidden=false; document.body.classList.remove('chat-open', 'chat-expanded');
    if ($('#expandChat')) { $('#expandChat').textContent='Expand chat'; $('#expandChat').setAttribute('aria-pressed','false'); }
    await refreshOwner(); ownerTimer=setInterval(()=>refreshOwner().catch(()=>{}),2000);
  };
  await refresh();
}
async function loadOwnerUser(username = selectedOwnerUser) {
  if (!username) return;
  if (ownerLoading || ownerReplyBusy || ownerDebugUser) return;
  const reply = document.querySelector('#ownerReplyForm textarea');
  if (reply && selectedOwnerUser) ownerReplyDrafts.set(selectedOwnerUser, { message: reply.value, requestId: $('#ownerReplyForm').dataset.requestId || '' });
  if (username === selectedOwnerUser && reply && (reply.value || document.activeElement === reply)) return;
  selectedOwnerUser = username;
  ownerLoading = true;
  try {
  const r = await ownerRequest(
      "/api/field/admin/user/" + encodeURIComponent(username),
    ),
    p = r.profile,
    sessions = r.sessions || [],
    readiness = r.tailoredReadiness || { messages: 0, words: 0, sessions: 0, requirements: { messages: 18, words: 700, sessions: 3 } },
    requirements = readiness.requirements || { messages: 18, words: 700, sessions: 3 },
    tailoredStatus = p.learnedPersonality ? `<article class="admin-record"><strong>${esc(p.learnedPersonality.name)} · tailoring complete</strong><p><b>Adaptation rationale:</b> ${esc(p.learnedPersonality.rationale || "No rationale recorded.")}</p><small>Evidence at last adaptation: ${p.learnedPersonality.evidence?.messages || 0} messages · ${p.learnedPersonality.evidence?.words || 0} words · ${p.learnedPersonality.evidence?.sessions || 0} sessions</small></article>` : `<article class="admin-record"><strong>Tailoring readiness</strong><p>${readiness.messages || 0}/${requirements.messages} messages · ${readiness.words || 0}/${requirements.words} words · ${readiness.sessions || 0}/${requirements.sessions} sessions</p><small>The tester sees no preview or progress indicator.</small></article>`;
  if (selectedOwnerUser !== username || ownerDebugUser) return;
  $("#adminChat").innerHTML =
    `<div class="owner-chat-heading"><div><h3>Live chat · ${esc(username)}</h3><p>${p.ownerTakeover ? "Human takeover active · model replies paused" : "Model replies active"} · ${r.access.enabled ? "Access enabled" : "Access disabled"} · ${sessions.length} live session(s)</p></div><div class="toolbar"><button class="ghost" data-owner-action="debug">Open tester view</button><button class="ghost" data-owner-action="takeover">${p.ownerTakeover ? "Return to model" : "Take over chat"}</button><button class="ghost" data-owner-action="sessions">Revoke sessions</button><button class="danger" data-owner-action="access">${r.access.enabled ? "Disable access" : "Enable access"}</button></div></div><section><h3>Tailored personality</h3>${tailoredStatus}</section><div class="owner-live-chat">${(
      p.messages || []
    )
      .map(
        (m) =>
          `<article class="message ${esc(m.role)}${m.human ? " human" : ""}"><small>${m.role === "user" ? (m.ownerTest ? "THE UNICORN · OWNER TEST" : "TESTER") : m.human ? "THE UNICORN · HUMAN" : esc(m.model || "MODEL")} · ${new Date(m.timestamp || Date.now()).toLocaleString()}</small>${esc(m.text)}${
            m.activity?.length
              ? `<div class="activity">${m.activity
                  .slice(-20)
                  .map(
                    (a) =>
                      `<div><b>${esc(a.tool || a.event)}</b>${a.command ? `<code>${esc(a.command)}</code>` : ""}${a.reply ? `<code>${esc(a.reply)}</code>` : ""}</div>`,
                  )
                  .join("")}</div>`
              : ""
          }</article>`,
      )
      .join(
        "",
      )}</div><section><h3>Tester feedback</h3>${(p.testerFeedback||[]).slice().reverse().map(item=>`<article class="admin-record"><strong>${new Date(item.createdAt).toLocaleString()}</strong><p><b>${esc(item.question)}</b><br>${esc(item.message)}</p><small>${esc(item.model||"Model unavailable")} · ${esc(item.personality||"Personality unavailable")}</small></article>`).join("")||'<p class="empty">No direct feedback yet.</p>'}</section><form id="ownerReplyForm"><label>Reply as The Unicorn<textarea name="message" maxlength="12000" required placeholder="The tester will clearly see that this is a human reply."></textarea></label><p class="empty">Human replies are labeled. Use Take over chat separately to pause AI replies.</p><button type="submit">Send human reply</button></form>`;
  const draft = ownerReplyDrafts.get(username);
  const replyInput = $('#ownerReplyForm textarea');
  if (draft) { replyInput.value=draft.message; $('#ownerReplyForm').dataset.requestId=draft.requestId; }
  replyInput.oninput=()=>{ delete $('#ownerReplyForm').dataset.requestId; ownerReplyDrafts.set(username,{message:replyInput.value,requestId:''}); };
  $("#ownerReplyForm").onsubmit = async (event) => {
    event.preventDefault();
    if (ownerReplyBusy) return;
    const form = event.currentTarget, message = new FormData(form).get("message");
    form.dataset.requestId ||= crypto.randomUUID();
    ownerReplyBusy = true;
    form.querySelector('button[type="submit"]').disabled = true;
    form.querySelector('textarea').readOnly = true;
    try {
      await ownerRequest("/api/field/admin/reply", { username, message, requestId: form.dataset.requestId });
      form.reset(); delete form.dataset.requestId; ownerReplyDrafts.delete(username);
      form.querySelector('textarea').blur();
      toast('Human reply sent');
    } catch (error) { toast(error.message); }
    finally { ownerReplyBusy = false; form.querySelector('textarea').readOnly = false; form.querySelector('button[type="submit"]').disabled = false; }
    await loadOwnerUser(username);
  };
  document.querySelector('[data-owner-action="debug"]').onclick = () => openTesterDebug(username).catch(error => toast(error.message));
  document.querySelector('[data-owner-action="takeover"]').onclick =
    async () => {
      await ownerRequest("/api/field/admin/takeover", {
        username,
        enabled: !p.ownerTakeover,
      });
      await loadOwnerUser(username);
    };
  document.querySelector('[data-owner-action="sessions"]').onclick =
    async () => {
      await ownerRequest("/api/field/admin/sessions/revoke", { username });
      await refreshOwner();
    };
  document.querySelector('[data-owner-action="access"]').onclick = async () => {
    await ownerRequest("/api/field/admin/access", {
      username,
      enabled: !r.access.enabled,
    });
    await refreshOwner();
  };
  } finally { ownerLoading = false; }
}
async function refreshOwner() {
  if (ownerRefreshBusy || ownerDebugUser || ownerReplyBusy) return;
  ownerRefreshBusy = true;
  try {
  const v = await ownerRequest("/api/field/admin/overview");
  $("#toggleTraffic").textContent = v.trafficEnabled
    ? "Stop all tester traffic"
    : "Resume tester traffic";
  $("#toggleTraffic").dataset.enabled = String(v.trafficEnabled);
  const pending = (v.requests || []).filter((r) => r.status === "pending");
  $("#messagingStatus").textContent = v.ntfy?.configured ? (v.ntfy.running ? "Private ntfy is connected." : v.ntfy.error || "Private ntfy is stopped.") : "Private ntfy is not configured.";
  $("#adminStats").innerHTML =
    `<p><strong>${v.trafficEnabled ? "ACCEPTING TRAFFIC" : "TRAFFIC STOPPED"}</strong> · ${v.running.length} running jobs · ${v.sessions.length} connected devices · ${pending.length} pending requests</p><section><h3>Access requests</h3><div id="accessRequests">${pending.map((r) => `<article class="admin-record"><strong>${esc(r.name)} · @${esc(r.username)}</strong><small>${esc(r.email)} · ${esc(r.phone || "No phone")} · private ntfy enrollment · ${new Date(r.createdAt).toLocaleString()}</small><p><b>Why:</b> ${esc(r.reason)}</p><p><b>Goals:</b> ${esc(r.onboarding?.goals)}<br><b>Style / experience:</b> ${esc(r.onboarding?.communicationStyle)} · ${esc(r.onboarding?.experience)}<br><b>Devices:</b> ${esc(r.feedback?.devices)}<br><b>Workflows:</b> ${esc(r.feedback?.workflows)}<br><b>Frustrations:</b> ${esc(r.feedback?.frustrations)}<br><b>Must-have:</b> ${esc(r.feedback?.mustHave)}<br><b>Data comfort:</b> ${esc(r.feedback?.privacyComfort)} · <b>Availability:</b> ${esc(r.feedback?.testingAvailability)}</p><button data-approve-request="${esc(r.id)}">Approve & create ntfy package</button><button class="danger" data-deny-request="${esc(r.id)}">Deny</button></article>`).join("") || '<p class="empty">No pending requests.</p>'}</div><div id="enrollmentCode">${lastEnrollmentCode}</div></section>`;
  $("#adminDevices").innerHTML =
    v.sessions
      .map(
        (s) =>
          `<article class="admin-record"><strong>${esc(s.username)}</strong><small>Connected ${new Date(s.createdAt).toLocaleString()} · Last activity ${new Date(s.lastSeen).toLocaleString()}</small><p>${esc(s.address)} · ${esc(s.diagnostics?.browser || s.device)}<br>${esc(s.diagnostics?.platform || "Platform unavailable")} · ${esc(s.diagnostics?.screen || "Display unavailable")} · ${s.diagnostics?.cpuThreads || "?"} threads · ${s.diagnostics?.deviceMemoryGb || "?"} GB reported memory · ${esc(s.diagnostics?.timeZone || "Timezone unavailable")}</p></article>`,
      )
      .join("") || '<p class="empty">No connected devices.</p>';
  $("#adminUsers").innerHTML =
    v.users
      .map(
        (u) =>
          `<button class="ghost admin-user" data-owner-user="${esc(u.username)}">${esc(u.username)} · ${u.messages} messages · ${u.accessEnabled ? "enabled" : "disabled"}${u.ownerTakeover ? " · HUMAN" : ""}<small>Last activity ${u.lastMessageAt ? new Date(u.lastMessageAt).toLocaleString() : "never"}</small></button>`,
      )
      .join("") || '<p class="empty">No testers.</p>';
  $("#adminAudit").innerHTML = v.audit
    .map(
      (x) =>
        `<small>${new Date(x.timestamp).toLocaleString()} · ${esc(x.event)} · ${esc(x.username || "system")} · ${esc(x.address)}${Object.keys(x.details || {}).length ? " · " + esc(JSON.stringify(x.details)) : ""}</small>`,
    )
    .join("<br>");
  document
    .querySelectorAll("[data-owner-user]")
    .forEach((b) => (b.onclick = () => loadOwnerUser(b.dataset.ownerUser)));
  document
    .querySelectorAll("[data-approve-request]")
    .forEach((b) => (b.textContent = "Approve & create ntfy package"));
  document.querySelectorAll("[data-approve-request]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          const r = await ownerRequest(
            "/api/field/admin/access-request/approve",
            { id: b.dataset.approveRequest },
          );
          lastEnrollmentCode = `<div class="enrollment-code"><strong>@${esc(r.request.username)} approved</strong><p>The private ntfy enrollment package was created at ${new Date(r.delivery.sentAt).toLocaleString()}. Send it only to the approved user.</p><label>Private welcome letter<textarea id="approvedEnrollmentLetter" readonly>${esc(r.enrollment?.letter || "Open the private ntfy notification to retrieve the enrollment package.")}</textarea></label><button type="button" data-copy-enrollment>Copy private letter</button><p class="empty">Do not publish this letter, address, or one-time code.</p></div>`;
          await refreshOwner();
          document.querySelector("[data-copy-enrollment]")?.addEventListener("click", async () => {
            await navigator.clipboard.writeText(document.querySelector("#approvedEnrollmentLetter")?.value || "");
            toast("Private welcome letter copied");
          });
        } catch (error) {
          toast(error.message);
        }
      }),
  );
  document.querySelectorAll("[data-deny-request]").forEach(
    (b) =>
      (b.onclick = async () => {
        await ownerRequest("/api/field/admin/access-request/deny", {
          id: b.dataset.denyRequest,
        });
        await refreshOwner();
      }),
  );
  if (selectedOwnerUser) await loadOwnerUser(selectedOwnerUser);
  } finally { ownerRefreshBusy = false; }
}
$("#ownerConsole").onclick = async () => {
  ownerNode = urls()[0];
  if (!ownerNode) return toast("Enter a Forge address first");
  try {
    ownerToken = await adminToken(ownerNode);
    $("#loginPanel").hidden = true;
    $("#consentNotice").hidden = true;
    $("#adminPanel").hidden = false;
    $("#connectionState").textContent = "Private owner session";
    await refreshOwner();
    clearInterval(ownerTimer);
    ownerTimer = setInterval(() => refreshOwner().catch(() => {}), 2000);
  } catch (e) {
    toast(e.message);
  }
};
$("#ownerFromChat").onclick = () => $("#ownerConsole").click();
$("#refreshAdmin").onclick = refreshOwner;
$("#refreshNtfyAdmin").onclick = async () => {
  const button = $("#refreshNtfyAdmin");
  button.disabled = true;
  button.textContent = "Refreshing ntfy…";
  try {
    const result = await ownerRequest("/api/field/admin/ntfy/refresh", {});
    $("#adminNtfyChannels").innerHTML = (result.channels || []).map(item => `<span class="${item.ok ? "ok" : "bad"}">${item.ok ? "✓" : "×"} ${esc(item.label)} · ${esc(item.detail)}</span>`).join("");
    toast(result.ok ? "All ntfy channels connected" : result.stderr || "Some ntfy channels need attention");
    await refreshOwner();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; button.textContent = "Refresh ntfy channels"; }
};
$("#toggleTraffic").onclick = async () => {
  await ownerRequest("/api/field/admin/traffic", {
    enabled: $("#toggleTraffic").dataset.enabled !== "true",
  });
  await refreshOwner();
};
$("#closeAdmin").onclick = () => {
  clearInterval(ownerTimer);
  $("#adminPanel").hidden = true;
  $("#loginPanel").hidden = false;
  $("#consentNotice").hidden = false;
  ownerToken = "";
  selectedOwnerUser = "";
  lastEnrollmentCode = "";
  $("#connectionState").textContent = "Logged out";
};

const expandChatButton = document.querySelector('#expandChat');
if (expandChatButton) expandChatButton.onclick = () => {
  const expanded = document.body.classList.toggle('chat-expanded');
  expandChatButton.textContent = expanded ? 'Restore layout' : 'Expand chat';
  expandChatButton.setAttribute('aria-pressed', String(expanded));
};
