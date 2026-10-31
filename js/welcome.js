/**
 * Daybloom Personalized Welcome Experience
 * --------------------------------------------------------------------------
 * Handles first-time user onboarding, name validation, error handling,
 * localStorage persistence with in-memory session fallback, zero-flicker state
 * management, and deterministic, time-based Home greetings.
 */

const DaybloomWelcome = (() => {
  const STORAGE_KEY = 'daybloom_user_name';
  const MAX_NAME_LENGTH = 50;

  // Session state variables
  let sessionUserName = null;
  let isStorageHealthy = true;
  let writeFailed = false;

  /**
   * Tests whether browser localStorage is operational for writes.
   * @returns {boolean} True if read/write succeeds, false if blocked or throwing.
   */
  function probeStorageWritable() {
    try {
      const probeKey = '__daybloom_probe__';
      localStorage.setItem(probeKey, probeKey);
      localStorage.removeItem(probeKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Safely reads the stored name from localStorage.
   * Distinguishes between null (no name), valid name, and read exceptions.
   * @returns {string|null} The trimmed valid name, or null if absent/invalid/unreadable.
   */
  function readStoredName() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.length > 0 && trimmed.length <= MAX_NAME_LENGTH) {
          return trimmed;
        }
      }
      return null;
    } catch (err) {
      console.warn('DaybloomWelcome: Storage read exception.', err);
      isStorageHealthy = false;
      return null;
    }
  }

  /**
   * Safely writes the user's name to localStorage with session fallback.
   * @param {string} name - The validated trimmed name
   * @returns {boolean} True if saved permanently, false if fallen back to session.
   */
  function persistName(name) {
    if (!isStorageHealthy) {
      sessionUserName = name;
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEY, name);
      return true;
    } catch (err) {
      console.warn('DaybloomWelcome: Storage write exception. Falling back to session memory.', err);
      writeFailed = true;
      isStorageHealthy = false;
      sessionUserName = name;
      return false;
    }
  }

  /**
   * Returns the active user name from session memory or localStorage.
   * @returns {string|null}
   */
  function getUserName() {
    if (sessionUserName) {
      return sessionUserName;
    }
    return readStoredName();
  }

  /**
   * Pure, deterministic time-based greeting generator.
   * Independently testable by passing an explicit hour (0-23) or Date object.
   *
   * Rules (Local Device Time):
   * - 5:00 AM to 11:59 AM: "Good morning, [Name]!"
   * - 12:00 PM to 4:59 PM: "Good afternoon, [Name]!"
   * - 5:00 PM to 4:59 AM:  "Good evening, [Name]!"
   *
   * @param {string} name - User's name
   * @param {number|Date} [referenceTime] - Optional hour (0-23) or Date for unit testing
   * @returns {string} Formatted personalized greeting
   */
  function getGreetingText(name, referenceTime) {
    let hour;
    if (typeof referenceTime === 'number') {
      hour = referenceTime;
    } else if (referenceTime instanceof Date) {
      hour = referenceTime.getHours();
    } else {
      hour = new Date().getHours();
    }

    let salutation;
    if (hour >= 5 && hour < 12) {
      salutation = 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      salutation = 'Good afternoon';
    } else {
      salutation = 'Good evening';
    }

    return `${salutation}, ${name}!`;
  }

  /**
   * Safely updates the Home personalized greeting using textContent.
   * @param {number|Date} [referenceTime] - Optional reference time for testing
   */
  function updateGreeting(referenceTime) {
    const name = getUserName();

    // Update Home section greeting
    const homeTitleEl = document.getElementById('home-greeting-title');
    if (homeTitleEl) {
      homeTitleEl.textContent = name
        ? getGreetingText(name, referenceTime)
        : 'Welcome to Daybloom';
    }
  }

  /**
   * Displays an inline validation error message on the welcome form.
   * @param {string} message
   */
  function showValidationError(message) {
    const errorEl = document.getElementById('welcome-name-error');
    const inputEl = document.getElementById('welcome-name-input');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (inputEl) {
      inputEl.setAttribute('aria-invalid', 'true');
    }
  }

  /**
   * Clears any active validation error message.
   */
  function clearValidationError() {
    const errorEl = document.getElementById('welcome-name-error');
    const inputEl = document.getElementById('welcome-name-input');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.hidden = true;
    }
    if (inputEl) {
      inputEl.removeAttribute('aria-invalid');
    }
  }

  /**
   * Displays the storage status notice when storage is restricted.
   * Never claims permanent storage when it has not been saved.
   * @param {string} message
   */
  function showStorageNotice(message) {
    const noticeContainer = document.getElementById('welcome-storage-notice');
    const noticeText = document.getElementById('welcome-storage-notice-text');
    if (noticeContainer && noticeText) {
      noticeText.textContent = message;
      noticeContainer.hidden = false;
    }
  }

  /**
   * Transitions from the welcome screen to the main application shell.
   */
  function enterApplication() {
    // Switch document classes to reveal app shell without layout breakage
    document.documentElement.classList.remove('daybloom-user-new');
    document.documentElement.classList.add('daybloom-user-returning');

    // Update greeting safely
    updateGreeting();

    // Ensure navigation is in sync defaulting to Home
    if (typeof DaybloomNav !== 'undefined' && DaybloomNav.switchSection) {
      const hash = window.location.hash.replace('#', '');
      const validSections = ['home', 'daily', 'scholar', 'growth', 'reflect'];
      const target = validSections.includes(hash) ? hash : 'home';
      DaybloomNav.switchSection(target, false);
    }
  }

  /**
   * Handles the submission of the welcome form.
   * @param {Event} [event]
   */
  function handleFormSubmit(event) {
    if (event) {
      event.preventDefault();
    }

    const input = document.getElementById('welcome-name-input');
    if (!input) return;

    const rawValue = input.value;
    const trimmed = rawValue.trim();

    // 1. Validate non-empty after trimming whitespace
    if (!trimmed) {
      showValidationError('Please enter your name to continue.');
      input.focus();
      return;
    }

    // 2. Validate max length (reject names > 50 characters, do not silently truncate)
    if (trimmed.length > MAX_NAME_LENGTH) {
      showValidationError(`Name cannot exceed ${MAX_NAME_LENGTH} characters.`);
      input.focus();
      return;
    }

    clearValidationError();

    // Persist or fallback to session
    const isSavedPermanently = persistName(trimmed);

    if (!isSavedPermanently) {
      showStorageNotice('Continuing for this session. Your name could not be saved permanently due to a browser storage restriction.');
    }

    enterApplication();
  }

  /**
   * Binds UI events for form submission, input validation, and focus updates.
   */
  function bindEvents() {
    const form = document.getElementById('welcome-form');
    if (form) {
      form.addEventListener('submit', handleFormSubmit);
    }

    const input = document.getElementById('welcome-name-input');
    if (input) {
      input.addEventListener('input', () => {
        clearValidationError();
      });
    }

    // Refresh greeting when the browser tab/window regains focus
    window.addEventListener('focus', () => {
      updateGreeting();
    });
  }

  /**
   * Initializes the welcome experience controller.
   */
  function init() {
    try {
      // 1. Probe storage health
      const storageOk = probeStorageWritable();
      if (!storageOk || document.documentElement.classList.contains('daybloom-storage-error')) {
        isStorageHealthy = false;
        showStorageNotice('Browser storage is disabled or unavailable. You can enter your name for this session, but it cannot be saved permanently.');
      }

      // 2. Check for an existing valid saved name
      const storedName = readStoredName();

      if (storedName) {
        // Returning user with valid name: skip welcome screen immediately
        document.documentElement.classList.remove('daybloom-user-new');
        document.documentElement.classList.add('daybloom-user-returning');
        updateGreeting();
      } else {
        // First-time visitor or invalid/empty stored name: show welcome screen
        document.documentElement.classList.remove('daybloom-user-returning');
        document.documentElement.classList.add('daybloom-user-new');

        // Auto-focus input on desktop/laptop
        const input = document.getElementById('welcome-name-input');
        if (input && window.innerWidth > 768) {
          setTimeout(() => {
            try {
              input.focus();
            } catch (e) {}
          }, 50);
        }
      }

      bindEvents();
    } catch (err) {
      console.error('DaybloomWelcome: Initialization error handled defensively.', err);
      // Failsafe: Ensure app remains accessible
      document.documentElement.classList.remove('daybloom-user-new');
      document.documentElement.classList.add('daybloom-user-returning');
    }
  }

  return {
    init,
    getUserName,
    readStoredName,
    persistName,
    getGreetingText,
    updateGreeting,
    updateDailyGreeting: updateGreeting,
    handleFormSubmit,
    isStorageAvailable: () => isStorageHealthy
  };
})();

if (typeof window !== 'undefined') {
  window.DaybloomWelcome = DaybloomWelcome;
}
