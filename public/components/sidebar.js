const navItems = [
  ["Home", "nav-home.svg", true],
  ["Rides", "nav-rides.svg", false],
  ["World", "nav-world.svg", false],
  ["Progress", "nav-progress.svg", false],
  ["Profile", "nav-profile.svg", false]
];

export const SidebarLogo = () => `
  <a class="sidebar-logo" href="/" aria-label="Trailhunt home">
    <img src="/assets/sidebar-logo-mark.svg" width="28" height="28" alt="">
    <span>TRAILHUNT</span>
  </a>
`;

export const NavItem = ([label, icon, active]) => `
  <button class="sidebar-nav-item${active ? " is-active" : ""}" type="button"${active ? ' aria-current="page"' : ""}>
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
  <button class="add-ride-cta" type="button">
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
