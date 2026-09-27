const navItems = [
  ["home", "Home", "nav-home.svg"],
  ["rides", "Rides", "nav-rides.svg"],
  ["world", "World", "nav-world.svg"],
  ["progress", "Progress", "nav-progress.svg"],
  ["profile", "Profile", "nav-profile.svg"]
];

export const SidebarLogo = () => `
  <a class="sidebar-logo" href="/" aria-label="Trailhunt home">
    <img src="/assets/sidebar-logo-mark.svg" width="28" height="28" alt="">
    <span>TRAILHUNT</span>
  </a>
`;

export const NavItem = ([screen, label, icon]) => `
  <button class="sidebar-nav-item${screen === "home" ? " is-active" : ""}" type="button" data-screen="${screen}"${screen === "home" ? ' aria-current="page"' : ""}>
    <img src="/assets/${icon}" width="18" height="18" alt="">
    <span>${label}</span>
  </button>
`;

export const SidebarNavMenu = () => `
  <nav class="sidebar-nav-menu" aria-label="Primary navigation">
    ${navItems.map(NavItem).join("")}
  </nav>
`;

export const AddRideCTA = () => `
  <button class="add-ride-cta" type="button" data-screen="add-ride">
    <img src="/assets/add-ride-upload.svg" width="16" height="16" alt="">
    <span>ADD RIDE</span>
  </button>
`;

export const Sidebar = () => `
  <aside class="sidebar">
    <div class="sidebar-logo-region">${SidebarLogo()}</div>
    ${SidebarNavMenu()}
    <div class="sidebar-cta-region">${AddRideCTA()}</div>
  </aside>
`;

export const sidebar = Sidebar;

export const setSidebarScreen = (mountPoint, screen) => {
  for (const item of mountPoint.querySelectorAll(".sidebar-nav-item")) {
    const isActive = item.dataset.screen === (screen === "ride-detail" ? "rides" : screen);
    item.classList.toggle("is-active", isActive);
    item.toggleAttribute("aria-current", isActive);
  }
  mountPoint.querySelector(".add-ride-cta").classList.toggle("is-current", screen === "add-ride");
};
