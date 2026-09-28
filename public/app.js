import { mountAppShell } from "./components/app-shell.js";
import { mountAddActivityPage } from "./components/add-activity-page.js";
import { mountHomePage } from "./components/home-page.js";
import { mountProgressPage } from "./components/progress-page.js";
import { mountRideDetailPage } from "./components/ride-detail-page.js";
import { mountRidesPage } from "./components/rides-page.js";
import { mountWorldPage } from "./components/world-page.js";
import { startAuthentication, startRegistration } from "/shared/webauthn/index.js";
import { mountAuthFlow, mountAuthSessionLoading } from "./components/auth/auth-flow.js";

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

const configureSession = (session) => {
  csrfToken = session.csrfToken;
  window.fetch = authenticateFetch;
};

const mountSignIn = (message = "") => mountAuthFlow(app, {
  fetch: authenticateFetch,
  startAuthentication,
  startRegistration,
  onSession: configureSession,
  onAuthenticated: mountPrivateApp,
  initialMessage: message
});

mountAuthSessionLoading(app);
nativeFetch("/api/auth/session").then((response) => response.json()).then((session) => {
  if (!session.authenticated) return mountSignIn();
  configureSession(session);
  mountPrivateApp();
}).catch(() => mountSignIn("Unable to check your session."));
