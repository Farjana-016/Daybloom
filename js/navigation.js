/**
 * Daybloom Navigation Controller
 * --------------------------------------------------------------------------
 * Handles active section state switching across desktop sidebar, mobile bottom
 * navigation bar, main content panels, and the top-level Settings panel.
 * Supports full browser history traversal (Back and Forward buttons) using
 * pushState, popstate, and hashchange.
 */

const DaybloomNav = (() => {
  // Valid application sections in strict order: Home -> Daily -> Scholar -> Growth -> Reflect + Settings
  const SECTIONS = ['home', 'daily', 'scholar', 'growth', 'reflect', 'settings'];
  const VALID_DEFAULT_SECTIONS = ['home', 'daily', 'scholar', 'growth', 'reflect'];
  const DEFAULT_SECTION = 'home';
  let currentActiveSection = DEFAULT_SECTION;

  /**
   * Switches the active view across the UI.
   * @param {string} sectionId - Target section: 'home' | 'daily' | 'scholar' | 'growth' | 'reflect' | 'settings'
   * @param {boolean} [shouldPushHistory=true] - True for user clicks; false for popstate/hashchange/init
   */
  function switchSection(sectionId, shouldPushHistory = true) {
    if (!SECTIONS.includes(sectionId)) {
      sectionId = getDefaultOpeningSection();
    }

    // If entering settings, remember previous regular section
    if (sectionId === 'settings' && VALID_DEFAULT_SECTIONS.includes(currentActiveSection)) {
      if (typeof DaybloomSettings !== 'undefined' && DaybloomSettings.setPreviousSection) {
        DaybloomSettings.setPreviousSection(currentActiveSection);
      }
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

    // 3. Update Header Settings button state
    const headerSettingsBtn = document.getElementById('header-settings-btn');
    if (headerSettingsBtn) {
      const isSettings = sectionId === 'settings';
      headerSettingsBtn.classList.toggle('active', isSettings);
      headerSettingsBtn.setAttribute('aria-pressed', isSettings ? 'true' : 'false');
    }

    // 4. Update view panels in the main content area
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

    // Notify Settings view when activated
    if (sectionId === 'settings' && typeof DaybloomSettings !== 'undefined' && DaybloomSettings.render) {
      DaybloomSettings.render();
    }

    // 5. Update browser history without duplicate steps
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
   * Resolves the configured default opening section from settings.
   * Fallback is strictly 'home'. Settings can never be the default opening section.
   * @returns {string}
   */
  function getDefaultOpeningSection() {
    if (typeof DaybloomSettings !== 'undefined' && DaybloomSettings.get) {
      const savedDefault = DaybloomSettings.get('defaultSection');
      if (VALID_DEFAULT_SECTIONS.includes(savedDefault)) {
        return savedDefault;
      }
    }
    return DEFAULT_SECTION;
  }

  /**
   * Handles browser Back/Forward navigation (popstate) and hash changes.
   * The state guard (targetSection !== currentActiveSection) prevents duplicate
   * executions when browsers emit both popstate and hashchange in succession.
   */
  function handleHistoryTraversal() {
    const hash = window.location.hash.replace('#', '');
    const targetSection = SECTIONS.includes(hash) ? hash : getDefaultOpeningSection();

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

    // Header Settings button
    const headerSettingsBtn = document.getElementById('header-settings-btn');
    if (headerSettingsBtn) {
      headerSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        switchSection('settings', true);
      });
    }

    // Browser Back and Forward navigation triggers popstate
    window.addEventListener('popstate', handleHistoryTraversal);

    // Direct URL hash changes trigger hashchange
    window.addEventListener('hashchange', handleHistoryTraversal);
  }

  /**
   * Initializes navigation state.
   * Distinguishes between direct valid hash link and clean launch without hash.
   */
  function init() {
    bindEvents();
    const hash = window.location.hash.replace('#', '');

    // If valid hash is present in URL (deep link or bookmark), respect it
    if (hash && SECTIONS.includes(hash)) {
      switchSection(hash, false);
    } else {
      // Normal application launch: read saved default opening section
      const defaultSec = getDefaultOpeningSection();
      switchSection(defaultSec, false);
    }
  }

  return {
    init,
    switchSection,
    navigateTo: switchSection,
    getActiveSection: () => currentActiveSection,
    getDefaultOpeningSection,
    SECTIONS
  };
})();

if (typeof window !== 'undefined') {
  window.DaybloomNav = DaybloomNav;
}
