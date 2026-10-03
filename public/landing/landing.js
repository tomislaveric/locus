/**
 * Landing page behaviour. Intentionally dependency-free and isolated from the
 * authenticated application bundle: no auth bootstrap, no API calls, no MapLibre.
 */

const toggle = document.querySelector(".nav__toggle");
const menu = document.querySelector("#nav-menu");

const setMenuOpen = (open) => {
  if (!toggle || !menu) return;
  menu.dataset.open = open ? "true" : "false";
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.setAttribute("aria-label", open ? toggle.dataset.closeLabel : toggle.dataset.openLabel);
};

if (toggle && menu) {
  setMenuOpen(false);
  toggle.addEventListener("click", () => {
    setMenuOpen(menu.dataset.open !== "true");
  });
  menu.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.dataset.open === "true") {
      setMenuOpen(false);
      toggle.focus();
    }
  });
}

const languageLinks = document.querySelectorAll(".language-switcher a");
const preserveLanguageFragment = () => {
  for (const link of languageLinks) {
    const destination = new URL(link.getAttribute("href") ?? link.href, window.location.origin);
    link.setAttribute("href", `${destination.pathname}${destination.search}${window.location.hash}`);
  }
};

preserveLanguageFragment();
window.addEventListener("hashchange", preserveLanguageFragment);

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

for (const anchor of document.querySelectorAll('a[href^="#"]')) {
  anchor.addEventListener("click", (event) => {
    const id = anchor.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    history.replaceState(null, "", id);
    preserveLanguageFragment();
  });
}
