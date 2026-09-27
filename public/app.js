import { mountAppShell } from "./components/app-shell.js";
import { mountAddRidePage } from "./components/add-ride-page.js";
import { mountHomePage } from "./components/home-page.js";

const shell = mountAppShell(document.querySelector("#app"), selectScreen);

function selectScreen(screen) {
  shell.setScreen(screen);
  if (screen === "add-ride") mountAddRidePage(shell.content);
  else mountHomePage(shell.content);
  shell.content.focus({ preventScroll: true });
}

selectScreen("home");
