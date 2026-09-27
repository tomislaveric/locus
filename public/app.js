import { mountAppShell } from "./components/app-shell.js";
import { mountAddRidePage } from "./components/add-ride-page.js";
import { mountHomePage } from "./components/home-page.js";
import { mountRideDetailPage } from "./components/ride-detail-page.js";
import { mountRidesPage } from "./components/rides-page.js";
import { mountWorldPage } from "./components/world-page.js";

const shell = mountAppShell(document.querySelector("#app"), selectScreen);

function selectScreen(screen) {
  shell.setScreen(screen);
  if (screen === "add-ride") mountAddRidePage(shell.content);
  else if (screen === "rides") mountRidesPage(shell.content, selectRide);
  else if (screen === "ride-detail") mountRideDetailPage(shell.content, selectedActivityId, () => selectScreen("rides"));
  else if (screen === "world") mountWorldPage(shell.content);
  else mountHomePage(shell.content);
  shell.content.focus({ preventScroll: true });
}

let selectedActivityId;

function selectRide(activityId) {
  selectedActivityId = activityId;
  selectScreen("ride-detail");
}

selectScreen("home");
