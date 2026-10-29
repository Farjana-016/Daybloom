/**
 * Daybloom Application Entry Point
 * --------------------------------------------------------------------------
 * Initializes app state, updates real-time date headers, and sets up
 * the client-side navigation.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize real-time date display in header
  updateDateDisplays();

  // 2. Initialize the navigation system
  DaybloomNav.init();

  // 3. Verify browser localStorage support for future phases
  checkStorageSupport();
});

/**
 * Formats and injects the current date into designated header badges.
 * Example format: "Thursday, Oct 29"
 */
function updateDateDisplays() {
  const dateElements = document.querySelectorAll('.current-date-text');
  const now = new Date();

  const options = {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  };

  const formattedDate = now.toLocaleDateString(undefined, options);

  dateElements.forEach((el) => {
    el.textContent = formattedDate;
  });
}

/**
 * Verifies localStorage availability for future persistence features.
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
