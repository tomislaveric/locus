import { mainContent } from "./main-content.js";
import { setSidebarScreen, sidebar } from "./sidebar.js";

export const navigableScreens = new Set(["home", "rides", "world", "progress", "profile", "add-activity"]);

export const AppShell = () => `
  <div class="app-shell">
    ${sidebar()}
    ${mainContent()}
  </div>
`;

export const mountAppShell = (mountPoint, onScreenChange) => {
  mountPoint.innerHTML = AppShell();
  mountPoint.addEventListener("click", (event) => {
    const button = event.target.closest("[data-screen]");
    if (!button || !mountPoint.contains(button)) return;
    const { screen } = button.dataset;
    if (navigableScreens.has(screen)) onScreenChange(screen);
  });
  return {
    content: mountPoint.querySelector(".main-content"),
    setScreen(screen) {
      setSidebarScreen(mountPoint, screen);
    }
  };
};
