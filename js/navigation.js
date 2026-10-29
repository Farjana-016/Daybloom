/**
 * Daybloom Navigation Controller
 * --------------------------------------------------------------------------
 * Handles active section state switching across desktop sidebar, mobile bottom
 * navigation bar, and main content panels. Supports URL hash routing.
 */

const DaybloomNav = (() => {
  // Valid application sections
  const SECTIONS = ['daily', 'scholar', 'growth', 'reflect'];
  const DEFAULT_SECTION = 'daily';

  /**
   * Switches the active view across the UI.
   * @param {string} sectionId - Target section: 'daily' | 'scholar' | 'growth' | 'reflect'
   */
  function switchSection(sectionId) {
    if (!SECTIONS.includes(sectionId)) {
      sectionId = DEFAULT_SECTION;
    }

    // 1. Update desktop sidebar nav links
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    sidebarLinks.forEach((link) => {
      const isTarget = link.getAttribute('data-section') === sectionId;
      link.classList.toggle('active', isTarget);
      link.setAttribute('aria-current', isTarget ? 'page' : 'false');
    });

    // 2. Update mobile bottom nav items
    const mobileLinks = document.querySelectorAll('.mobile-nav .mobile-nav-item');
    mobileLinks.forEach((link) => {
      const isTarget = link.getAttribute('data-section') === sectionId;
      link.classList.toggle('active', isTarget);
      link.setAttribute('aria-current', isTarget ? 'page' : 'false');
    });

    // 3. Update view panels in the main content area
    const viewPanels = document.querySelectorAll('.view-panel');
    viewPanels.forEach((panel) => {
      const isTarget = panel.id === `view-${sectionId}`;
      panel.classList.toggle('active', isTarget);
    });

    // 4. Update the URL hash without triggering extra scroll jump
    if (window.location.hash.replace('#', '') !== sectionId) {
      history.replaceState(null, '', `#${sectionId}`);
    }

    // Scroll main content to top when switching
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Attaches click event listeners to all navigation triggers in the document.
   */
  function bindEvents() {
    // Desktop and Mobile navigation links
    document.querySelectorAll('[data-section]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        const targetSection = element.getAttribute('data-section');
        switchSection(targetSection);
      });
    });

    // Pillar quick-links on the welcome card
    document.querySelectorAll('[data-target]').forEach((card) => {
      card.addEventListener('click', () => {
        const targetSection = card.getAttribute('data-target');
        switchSection(targetSection);
      });
    });

    // Handle browser back/forward or hash changes
    window.addEventListener('hashchange', () => {
      const hashSection = window.location.hash.replace('#', '');
      if (SECTIONS.includes(hashSection)) {
        switchSection(hashSection);
      }
    });
  }

  /**
   * Initializes the navigation state from the URL hash or defaults to 'daily'.
   */
  function init() {
    bindEvents();
    const hash = window.location.hash.replace('#', '');
    const initialSection = SECTIONS.includes(hash) ? hash : DEFAULT_SECTION;
    switchSection(initialSection);
  }

  return {
    init,
    switchSection
  };
})();
