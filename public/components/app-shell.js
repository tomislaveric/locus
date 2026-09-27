import { mainContent } from "./main-content.js";
import { sidebar } from "./sidebar.js";

export const AppShell = () => `
  <div class="app-shell">
    ${sidebar()}
    ${mainContent()}
  </div>
`;

export const mountAppShell = (mountPoint) => {
  mountPoint.innerHTML = AppShell();
};
