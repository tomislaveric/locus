import { mountAppShell } from "./components/app-shell.js";
import { mountAddActivityPage } from "./components/add-activity-page.js";
import { mountHomePage } from "./components/home-page.js";
import { mountProgressPage } from "./components/progress-page.js";
import { mountActivityDetailPage } from "./components/activity-detail-page.js";
import { mountActivitiesPage } from "./components/activities-page.js";
import { mountWorldPage } from "./components/world-page.js";
import { mountProfilePage } from "./components/profile/profile-page.js";
import { startAuthentication, startRegistration } from "/shared/webauthn/index.js";
import { mountAuthFlow, mountAuthSessionLoading } from "./components/auth/auth-flow.js";

const app = document.querySelector("#app");
const nativeFetch = window.fetch.bind(window);
let csrfToken;
let currentSession;

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
    if (screen === "add-activity") mountAddActivityPage(shell.content, selectActivity);
    else if (screen === "activities") mountActivitiesPage(shell.content, selectActivity);
    else if (screen === "activity-detail") mountActivityDetailPage(shell.content, selectedActivityId, () => selectScreen("activities"));
    else if (screen === "world") mountWorldPage(shell.content);
    else if (screen === "progress") mountProgressPage(shell.content);
    else if (screen === "profile") mountProfilePage(shell.content, {
      fetch: authenticateFetch,
      session: currentSession,
      startRegistration,
      onUnauthenticated: () => {
        csrfToken = undefined;
        currentSession = undefined;
        window.fetch = nativeFetch;
        mountSignIn();
      }
    });
    else mountHomePage(shell.content, selectActivity);
    shell.content.focus({ preventScroll: true });
  }
  function selectActivity(activityId) {
    selectedActivityId = activityId;
    selectScreen("activity-detail");
  }
  selectScreen("home");
};

const configureSession = (session) => {
  csrfToken = session.csrfToken;
  currentSession = session;
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
