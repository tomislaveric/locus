import { mountAppShell } from "./components/app-shell.js";
import { mountAddRidePage } from "./components/add-ride-page.js";
import { mountHomePage } from "./components/home-page.js";
import { mountRideDetailPlaceholder } from "./components/ride-detail-placeholder.js";
import { mountRidesPage } from "./components/rides-page.js";

const shell = mountAppShell(document.querySelector("#app"), selectScreen);

function selectScreen(screen) {
  shell.setScreen(screen);
  if (screen === "add-ride") mountAddRidePage(shell.content);
  else if (screen === "rides") mountRidesPage(shell.content, selectRide);
  else if (screen === "ride-detail") mountRideDetailPlaceholder(shell.content, selectedActivityId);
  else mountHomePage(shell.content);
  shell.content.focus({ preventScroll: true });
}

let selectedActivityId;

function selectRide(activityId) {
  selectedActivityId = activityId;
  selectScreen("ride-detail");
}

selectScreen("home");
