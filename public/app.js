import { mountAppShell } from "./components/app-shell.js";
import { mountAddActivityPage } from "./components/add-activity-page.js";
import { mountHomePage } from "./components/home-page.js";
import { mountProgressPage } from "./components/progress-page.js";
import { mountRideDetailPage } from "./components/ride-detail-page.js";
import { mountRidesPage } from "./components/rides-page.js";
import { mountWorldPage } from "./components/world-page.js";
import { startAuthentication, startRegistration } from "/shared/webauthn/index.js";

const app = document.querySelector("#app");
const nativeFetch = window.fetch.bind(window);
let csrfToken;

const authenticateFetch = (input, init = {}) => {
  const method = (init.method ?? "GET").toUpperCase();
  const url = typeof input === "string" ? input : input.url;
  if (csrfToken && url.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const headers = new Headers(init.headers);
    headers.set("X-CSRF-Token", csrfToken);
    return nativeFetch(input, { ...init, headers });
  }
  return nativeFetch(input, init);
};

const registerPasskey = async () => {
  const optionsResponse = await authenticateFetch("/api/auth/passkeys/register/options", { method: "POST" });
  const options = await optionsResponse.json();
  if (!optionsResponse.ok) throw new Error(options.error ?? "Unable to begin passkey setup.");
  const credential = await startRegistration({ optionsJSON: options });
  const response = await authenticateFetch("/api/auth/passkeys/register/verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential)
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error ?? "Passkey setup failed.");
  }
};

const authScreen = (message = "") => {
  app.innerHTML = `
    <main class="auth-screen">
      <section class="auth-card" aria-labelledby="auth-title">
        <p class="eyebrow">TRAILHUNT</p><h1 id="auth-title">Sign in to continue</h1>
        <p>Use a passkey when available, or get a one-time email code.</p>
        <button type="button" data-passkey>Continue with passkey</button>
        <form data-email-login>
          <label>Email <input required type="email" name="email" autocomplete="email"></label>
          <label data-code hidden>Code <input inputmode="numeric" pattern="[0-9]{6}" name="code" autocomplete="one-time-code"></label>
          <button type="submit">Email me a code</button>
        </form>
        <p>No account yet? <button type="button" data-register>Create one with email</button></p>
        <p data-auth-message>${message}</p>
      </section>
    </main>`;
  const form = app.querySelector("[data-email-login]");
  const codeLabel = app.querySelector("[data-code]");
  const messageElement = app.querySelector("[data-auth-message]");
  let registration = false;
  app.querySelector("[data-register]").addEventListener("click", () => {
    registration = true;
    requested = false;
    codeLabel.hidden = true;
    form.querySelector("button").textContent = "Email me a registration code";
    messageElement.textContent = "Enter your email to create an account.";
  });
  let requested = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const email = data.get("email");
    try {
      if (!requested) {
        await nativeFetch(registration ? "/api/auth/register/code" : "/api/auth/email-code/request", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
        });
        requested = true;
        codeLabel.hidden = false;
        messageElement.textContent = "Check your email for a six-digit code.";
        form.querySelector("button").textContent = "Sign in with code";
      } else {
        const response = await nativeFetch(registration ? "/api/auth/register/verify" : "/api/auth/email-code/verify", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code: data.get("code") })
        });
        const body = await response.json();
        if (!response.ok || (!registration && !body.authenticated)) throw new Error(body.error ?? "The code is invalid or expired.");
        csrfToken = body.csrfToken;
        window.fetch = authenticateFetch;
        if (registration && body.passkeySetupRequired) {
          try {
            await registerPasskey();
          } catch (error) {
            messageElement.textContent = error instanceof Error ? error.message : "Your account was created, but passkey setup was skipped.";
          }
        }
        mountPrivateApp();
      }
    } catch (error) {
      messageElement.textContent = error instanceof Error ? error.message : "Unable to sign in.";
    }
  });
  app.querySelector("[data-passkey]").addEventListener("click", async () => {
    try {
      const optionsResponse = await nativeFetch("/api/auth/passkeys/login/options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error ?? "Unable to begin passkey sign-in.");
      const credential = await startAuthentication({ optionsJSON: options });
      const response = await nativeFetch("/api/auth/passkeys/login/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credential)
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Passkey sign-in failed.");
      csrfToken = body.csrfToken;
      window.fetch = authenticateFetch;
      mountPrivateApp();
    } catch (error) {
      messageElement.textContent = error instanceof Error ? error.message : "Passkey sign-in failed.";
    }
  });
};

const mountPrivateApp = () => {
  const shell = mountAppShell(app, selectScreen);
  let selectedActivityId;
  function selectScreen(screen) {
    shell.setScreen(screen);
    if (screen === "add-activity") mountAddActivityPage(shell.content, selectRide);
    else if (screen === "rides") mountRidesPage(shell.content, selectRide);
    else if (screen === "ride-detail") mountRideDetailPage(shell.content, selectedActivityId, () => selectScreen("rides"));
    else if (screen === "world") mountWorldPage(shell.content);
    else if (screen === "progress") mountProgressPage(shell.content);
    else mountHomePage(shell.content, selectRide);
    shell.content.focus({ preventScroll: true });
  }
  function selectRide(activityId) {
    selectedActivityId = activityId;
    selectScreen("ride-detail");
  }
  selectScreen("home");
};

app.innerHTML = "<main class=\"auth-screen\"><p>Loading your session…</p></main>";
nativeFetch("/api/auth/session").then((response) => response.json()).then((session) => {
  if (!session.authenticated) return authScreen();
  csrfToken = session.csrfToken;
  window.fetch = authenticateFetch;
  mountPrivateApp();
}).catch(() => authScreen("Unable to check your session."));
