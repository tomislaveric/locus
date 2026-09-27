import { mainContent } from "./main-content.js";
import { setSidebarScreen, sidebar } from "./sidebar.js";

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
    if (screen === "home" || screen === "rides" || screen === "world" || screen === "add-ride") onScreenChange(screen);
  });
  return {
    content: mountPoint.querySelector(".main-content"),
    setScreen(screen) {
      setSidebarScreen(mountPoint, screen);
    }
  };
};
