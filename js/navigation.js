/**
 * Daybloom Navigation Controller
 * --------------------------------------------------------------------------
 * Handles active section state switching across desktop sidebar, mobile bottom
 * navigation bar, and main content panels. Supports full browser history traversal
 * (Back and Forward buttons) using pushState, popstate, and hashchange.
 */

const DaybloomNav = (() => {
  // Valid application sections in strict order: Home -> Daily -> Scholar -> Growth -> Reflect
  const SECTIONS = ['home', 'daily', 'scholar', 'growth', 'reflect'];
  const DEFAULT_SECTION = 'home';
  let currentActiveSection = DEFAULT_SECTION;

  /**
   * Switches the active view across the UI.
   * @param {string} sectionId - Target section: 'home' | 'daily' | 'scholar' | 'growth' | 'reflect'
   * @param {boolean} [shouldPushHistory=true] - True for user clicks; false for popstate/hashchange/init
   */
  function switchSection(sectionId, shouldPushHistory = true) {
    if (!SECTIONS.includes(sectionId)) {
      sectionId = DEFAULT_SECTION;
    }

    currentActiveSection = sectionId;

    // 1. Update desktop sidebar nav links
    const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    sidebarLinks.forEach((link) => {
      const isTarget = link.getAttribute('data-section') === sectionId;
      link.classList.toggle('active', isTarget);
      link.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      if (isTarget) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // 2. Update mobile bottom nav items
    const mobileLinks = document.querySelectorAll('.mobile-nav .mobile-nav-item');
    mobileLinks.forEach((link) => {
      const isTarget = link.getAttribute('data-section') === sectionId;
      link.classList.toggle('active', isTarget);
      link.setAttribute('aria-selected', isTarget ? 'true' : 'false');
      if (isTarget) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    // 3. Update view panels in the main content area
    const viewPanels = document.querySelectorAll('.view-panel');
    viewPanels.forEach((panel) => {
      const isTarget = panel.id === `view-${sectionId}`;
      panel.classList.toggle('active', isTarget);
    });

    // Notify Home view to refresh personalized greeting when activated
    if (sectionId === 'home' && typeof DaybloomWelcome !== 'undefined' && DaybloomWelcome.updateGreeting) {
      DaybloomWelcome.updateGreeting();
    }

    // Also notify Daily view if active
    if (sectionId === 'daily' && typeof DaybloomWelcome !== 'undefined' && DaybloomWelcome.updateDailyGreeting) {
      DaybloomWelcome.updateDailyGreeting();
    }

    // Notify Growth view to re-render fresh calculations when activated
    if (sectionId === 'growth' && typeof DaybloomGrowth !== 'undefined' && DaybloomGrowth.render) {
      DaybloomGrowth.render();
    }

    // Notify Reflect view to refresh calendar & active states when activated
    if (sectionId === 'reflect' && typeof DaybloomReflect !== 'undefined' && DaybloomReflect.render) {
      DaybloomReflect.render();
    }

    // 4. Update browser history without duplicate steps
    const currentHash = window.location.hash.replace('#', '');
    if (currentHash !== sectionId) {
      try {
        if (shouldPushHistory) {
          history.pushState({ section: sectionId }, '', `#${sectionId}`);
        } else {
          history.replaceState({ section: sectionId }, '', `#${sectionId}`);
        }
      } catch (err) {
        // Safe fallback in restricted iframe/file environments
        location.hash = sectionId;
      }
    }

    // Scroll main content to top when switching
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Handles browser Back/Forward navigation (popstate) and hash changes.
   * The state guard (targetSection !== currentActiveSection) prevents duplicate
   * executions when browsers emit both popstate and hashchange in succession.
   */
  function handleHistoryTraversal() {
    const hash = window.location.hash.replace('#', '');
    const targetSection = SECTIONS.includes(hash) ? hash : DEFAULT_SECTION;

    if (targetSection !== currentActiveSection) {
      switchSection(targetSection, false);
    }
  }

  /**
   * Attaches click event listeners to all navigation triggers in the document.
   */
  function bindEvents() {
    // Desktop and Mobile navigation links (data-section)
    document.querySelectorAll('[data-section]').forEach((element) => {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        const targetSection = element.getAttribute('data-section');
        switchSection(targetSection, true);
      });
    });

    // Home shortcut cards (data-target only — prevents duplicate listeners)
    document.querySelectorAll('[data-target]').forEach((card) => {
      card.addEventListener('click', () => {
        const targetSection = card.getAttribute('data-target');
        switchSection(targetSection, true);
      });
    });

    // Browser Back and Forward navigation triggers popstate
    window.addEventListener('popstate', handleHistoryTraversal);

    // Direct URL hash changes trigger hashchange
    window.addEventListener('hashchange', handleHistoryTraversal);
  }

  /**
   * Initializes the navigation state from the URL hash or defaults to 'home'.
   */
  function init() {
    bindEvents();
    const hash = window.location.hash.replace('#', '');
    const initialSection = SECTIONS.includes(hash) ? hash : DEFAULT_SECTION;
    switchSection(initialSection, false);
  }

  return {
    init,
    switchSection,
    getActiveSection: () => currentActiveSection
  };
})();
