/**
 * Daybloom Application Entry Point
 * --------------------------------------------------------------------------
 * Initializes app state, updates real-time date headers, and sets up
 * client-side navigation and modular feature managers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 0. Initialize Settings & Preferences (Phase 9)
  if (typeof DaybloomSettings !== 'undefined') {
    DaybloomSettings.init();
  }

  // 1. Initialize real-time date display in header
  updateDateDisplays();

  // 1b. Initialize Personalized Welcome Experience
  if (typeof DaybloomWelcome !== 'undefined') {
    DaybloomWelcome.init();
  }

  // 2. Initialize the navigation system
  DaybloomNav.init();

  // 3. Initialize the Daily task manager (Phase 2)
  if (typeof DaybloomDaily !== 'undefined') {
    DaybloomDaily.init();
  }

  // 4. Initialize Scholar academic manager (Phase 3)
  if (typeof DaybloomScholar !== 'undefined') {
    DaybloomScholar.init();
  }

  // 5. Initialize Growth productivity dashboard (Phase 4)
  if (typeof DaybloomGrowth !== 'undefined') {
    DaybloomGrowth.init();
  }

  // 6. Initialize Reflect journaling manager (Phase 5)
  if (typeof DaybloomReflect !== 'undefined') {
    DaybloomReflect.init();
  }

  // 7. Verify browser localStorage support
  checkStorageSupport();
});

/**
 * Formats and injects the current date into designated header badges.
 */
function updateDateDisplays() {
  const dateElements = document.querySelectorAll('.current-date-text');
  const now = new Date();

  let formattedDate;
  if (typeof DaybloomSettings !== 'undefined' && DaybloomSettings.get) {
    const format = DaybloomSettings.get('dateFormat');
    if (format && format !== 'system') {
      formattedDate = DaybloomSettings.formatDate(now);
    }
  }

  if (!formattedDate) {
    const options = {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    };
    formattedDate = now.toLocaleDateString(undefined, options);
  }

  dateElements.forEach((el) => {
    el.textContent = formattedDate;
  });
}

/**
 * Verifies localStorage availability for persistence features.
 */
function checkStorageSupport() {
  try {
    const testKey = '__daybloom_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    console.log('Daybloom: Browser localStorage is available.');
  } catch (error) {
    console.warn('Daybloom: localStorage is not accessible in this environment.', error);
  }
}
