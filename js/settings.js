/**
 * Daybloom Settings, Data Backup & Restore Module
 * --------------------------------------------------------------------------
 * Handles user preferences, display formats, week-start configuration,
 * comprehensive JSON backup export, deep record schema validation,
 * atomic-guarded per-key restore with rollback, and selective storage cleanup.
 */

const DaybloomSettings = (() => {
  const SETTINGS_STORAGE_KEY = 'daybloom_settings';
  const USER_NAME_STORAGE_KEY = 'daybloom_user_name';

  const DEFAULT_SETTINGS = {
    name: null,
    defaultSection: 'home',
    weekStartsOn: 'sunday',
    dateFormat: 'MMM D, YYYY',
    timeFormat: '12h',
    confirmDelete: true
  };

  const VALID_DEFAULT_SECTIONS = ['home', 'daily', 'scholar', 'growth', 'reflect'];
  const VALID_WEEK_STARTS = ['sunday', 'monday'];
  const VALID_DATE_FORMATS = [
    'MMM D, YYYY',
    'D MMM YYYY',
    'YYYY-MM-DD',
    'MM/DD/YYYY',
    'DD/MM/YYYY'
  ];
  const VALID_TIME_FORMATS = ['12h', '24h'];

  // Canonical scholar categories and reflect moods at module scope
  const SCHOLAR_CATEGORIES = [
    'Exams',
    'Tests',
    'Records',
    'Assignments',
    'Skill Building',
    'Projects'
  ];
  const SCHOLAR_DATE_TYPES = ['event', 'deadline', 'due'];
  const REFLECT_MOODS = ['excited', 'happy', 'calm', 'neutral', 'low', 'tired'];

  // Canonical strict ISO 8601 regex for application-generated timestamps (YYYY-MM-DDTHH:mm:ss.sssZ)
  const ISO_TIMESTAMP_REGEX =
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/;

  // In-memory settings cache loaded synchronously on script evaluation
  let currentSettings = { ...DEFAULT_SETTINGS };
  let isInitialized = false;
  let emergencySnapshot = null;
  let previousSectionBeforeSettings = 'home';

  /* ---------------- Synchronous Cache Loader ---------------- */
  function loadCachedSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (VALID_DEFAULT_SECTIONS.includes(parsed.defaultSection)) {
            currentSettings.defaultSection = parsed.defaultSection;
          }
          const weekStart = parsed.weekStartsOn || parsed.weekStartDay;
          if (VALID_WEEK_STARTS.includes(weekStart)) {
            currentSettings.weekStartsOn = weekStart;
          }
          if (VALID_DATE_FORMATS.includes(parsed.dateFormat)) {
            currentSettings.dateFormat = parsed.dateFormat;
          }
          if (VALID_TIME_FORMATS.includes(parsed.timeFormat)) {
            currentSettings.timeFormat = parsed.timeFormat;
          }
          if (typeof parsed.confirmDelete === 'boolean') {
            currentSettings.confirmDelete = parsed.confirmDelete;
          }
        }
      }

      // Sync name from daybloom_user_name if present
      const rawName = localStorage.getItem(USER_NAME_STORAGE_KEY);
      if (rawName && typeof rawName === 'string') {
        const trimmed = rawName.trim();
        if (trimmed.length > 0 && trimmed.length <= 50) {
          currentSettings.name = trimmed;
        }
      }
    } catch (err) {
      console.warn('DaybloomSettings: Failed to load cached settings, using defaults.', err);
    }
  }

  // Load immediately on evaluation
  loadCachedSettings();

  /**
   * Persists the current in-memory settings to localStorage.
   */
  function saveSettings() {
    try {
      const payload = {
        defaultSection: currentSettings.defaultSection,
        weekStartsOn: currentSettings.weekStartsOn,
        dateFormat: currentSettings.dateFormat,
        timeFormat: currentSettings.timeFormat,
        confirmDelete: currentSettings.confirmDelete
      };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (err) {
      console.error('DaybloomSettings: Failed to save settings to localStorage.', err);
      return false;
    }
  }

  /* ---------------- Calendar & Timestamp Validation Helpers ---------------- */

  /**
   * Pure UTC Gregorian leap year check.
   */
  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
  }

  /**
   * Days in a given Gregorian month (1-12).
   */
  function getDaysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
    return 31;
  }

  /**
   * Validates a calendar date string (YYYY-MM-DD).
   * Range: 0001 to 9999. Year 0000 rejected.
   */
  function isValidCalendarDate(dateStr) {
    if (typeof dateStr !== 'string') return false;
    const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(dateStr);
    if (!match) return false;

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (year < 1 || year > 9999) return false;

    const maxDay = getDaysInMonth(year, month);
    return day >= 1 && day <= maxDay;
  }

  /**
   * Validates a canonical application-generated ISO 8601 timestamp string.
   * Exact format: YYYY-MM-DDTHH:mm:ss.sssZ
   */
  function isValidIsoTimestamp(isoStr) {
    if (typeof isoStr !== 'string') return false;
    if (!ISO_TIMESTAMP_REGEX.test(isoStr)) return false;

    const datePortion = isoStr.substring(0, 10);
    if (!isValidCalendarDate(datePortion)) return false;

    const parsed = Date.parse(isoStr);
    return Number.isFinite(parsed);
  }

  /**
   * Validates a 24-hour time string (HH:MM).
   */
  function isValidTimeStr(timeStr) {
    if (typeof timeStr !== 'string') return false;
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
  }

  /* ---------------- Date & Time Formatting Utilities ---------------- */

  const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /**
   * Formats a date object, ISO string, or YYYY-MM-DD string according to the selected format.
   * @param {Date|string|number} dateInput
   * @param {string} [formatOverride]
   * @returns {string}
   */
  function formatDate(dateInput, formatOverride) {
    if (!dateInput) return '';

    let d;
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      const parts = dateInput.split('-');
      d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      d = new Date(dateInput);
    }

    if (isNaN(d.getTime())) return '';

    const format = formatOverride || currentSettings.dateFormat || 'MMM D, YYYY';

    const y = d.getFullYear();
    const mIndex = d.getMonth();
    const mShort = MONTH_NAMES_SHORT[mIndex];
    const m2 = String(mIndex + 1).padStart(2, '0');
    const dNum = d.getDate();
    const d2 = String(dNum).padStart(2, '0');

    switch (format) {
      case 'D MMM YYYY':
        return `${dNum} ${mShort} ${y}`;
      case 'YYYY-MM-DD':
        return `${y}-${m2}-${d2}`;
      case 'MM/DD/YYYY':
        return `${m2}/${d2}/${y}`;
      case 'DD/MM/YYYY':
        return `${d2}/${m2}/${y}`;
      case 'MMM D, YYYY':
      default:
        return `${mShort} ${dNum}, ${y}`;
    }
  }

  /**
   * Formats a time string (HH:MM) or Date object according to the selected format.
   * Restricted to 12h or 24h.
   * @param {string|Date} timeInput - "HH:MM" or Date object
   * @param {string} [formatOverride]
   * @returns {string}
   */
  function formatTime(timeInput, formatOverride) {
    if (!timeInput) return '';

    let hours, minutes;
    if (typeof timeInput === 'string' && isValidTimeStr(timeInput)) {
      const parts = timeInput.split(':');
      hours = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
    } else if (timeInput instanceof Date) {
      hours = timeInput.getHours();
      minutes = timeInput.getMinutes();
    } else {
      return '';
    }

    const format = formatOverride || currentSettings.timeFormat || '12h';
    const mStr = String(minutes).padStart(2, '0');

    if (format === '24h') {
      return `${String(hours).padStart(2, '0')}:${mStr}`;
    }
    // '12h' default
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${mStr} ${ampm}`;
  }

  /* ---------------- Category D: Deep Backup Payload Validator ---------------- */

  /**
   * Validates a backup JSON payload against real application schemas.
   * @param {any} payload
   * @returns {{ isValid: boolean, error?: string }}
   */
  function validateBackupPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return { isValid: false, error: 'Backup data must be a valid JSON object.' };
    }

    // 1. Root structure and version
    const version = payload.version !== undefined ? payload.version : payload.backupVersion;
    if (version !== 1) {
      return { isValid: false, error: `Unsupported backup version: ${version}. Only version 1 is supported.` };
    }

    const exportTime = payload.exportDate || payload.exportedAt;
    if (!exportTime || !isValidIsoTimestamp(exportTime)) {
      return { isValid: false, error: 'Backup has an invalid or malformed export timestamp.' };
    }

    if (payload.app !== undefined && payload.app !== 'Daybloom') {
      return { isValid: false, error: `Invalid app identifier: "${payload.app}". Expected "Daybloom".` };
    }

    if (!payload.data || typeof payload.data !== 'object') {
      return { isValid: false, error: 'Backup file is missing the required "data" property.' };
    }

    const data = payload.data;

    // 2. Mandatory Array Presence Policy (Zero Silent Data Erasure)
    if (!Array.isArray(data.daily)) {
      return { isValid: false, error: 'Backup is missing the mandatory "daily" tasks array. Restoration cancelled to prevent data loss.' };
    }
    if (!Array.isArray(data.scholar)) {
      return { isValid: false, error: 'Backup is missing the mandatory "scholar" tasks array. Restoration cancelled to prevent data loss.' };
    }
    if (!Array.isArray(data.reflect)) {
      return { isValid: false, error: 'Backup is missing the mandatory "reflect" entries array. Restoration cancelled to prevent data loss.' };
    }

    // 3. User Name validation (optional string, accepts user_name or userName)
    const rawUserName = data.user_name !== undefined ? data.user_name : data.userName;
    if (rawUserName !== null && rawUserName !== undefined) {
      if (typeof rawUserName !== 'string' || rawUserName.trim().length > 50) {
        return { isValid: false, error: 'User name must be a string up to 50 characters or null.' };
      }
    }

    // 4. Settings validation (optional object with graceful fallback for legacy exports)
    if (data.settings !== null && data.settings !== undefined) {
      if (typeof data.settings !== 'object') {
        return { isValid: false, error: 'Settings property must be an object.' };
      }
      if (data.settings.defaultSection && typeof data.settings.defaultSection !== 'string') {
        return { isValid: false, error: 'Settings defaultSection must be a string.' };
      }
      const weekStart = data.settings.weekStartsOn || data.settings.weekStartDay;
      if (weekStart && typeof weekStart !== 'string') {
        return { isValid: false, error: 'Settings weekStartsOn must be a string.' };
      }
      if (data.settings.dateFormat && typeof data.settings.dateFormat !== 'string') {
        return { isValid: false, error: 'Settings dateFormat must be a string.' };
      }
      if (data.settings.timeFormat && typeof data.settings.timeFormat !== 'string') {
        return { isValid: false, error: 'Settings timeFormat must be a string.' };
      }
      if (data.settings.confirmDelete !== undefined && typeof data.settings.confirmDelete !== 'boolean') {
        return { isValid: false, error: 'confirmDelete setting must be a boolean.' };
      }
    }

    // 5. Daily Lists & Checklist Items Validation
    for (let i = 0; i < data.daily.length; i++) {
      const list = data.daily[i];
      if (!list || typeof list !== 'object') {
        return { isValid: false, error: `Daily list at index ${i} is not a valid object.` };
      }
      if (typeof list.id !== 'string' || !list.id.trim()) {
        return { isValid: false, error: `Daily list at index ${i} has an invalid or empty id.` };
      }
      if (typeof list.title !== 'string' || !list.title.trim()) {
        return { isValid: false, error: `Daily list "${list.id}" has an invalid or empty title.` };
      }
      if (list.dueDate !== null && list.dueDate !== undefined && !isValidCalendarDate(list.dueDate)) {
        return { isValid: false, error: `Daily list "${list.title}" has an invalid dueDate: "${list.dueDate}".` };
      }
      if (list.dueTime !== null && list.dueTime !== undefined && !isValidTimeStr(list.dueTime)) {
        return { isValid: false, error: `Daily list "${list.title}" has an invalid dueTime: "${list.dueTime}".` };
      }

      // Daily list createdAt: integer milliseconds or canonical ISO or numeric string
      const createdAt = list.createdAt;
      const isValidCreatedAtNumber = typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0;
      const isValidCreatedAtIso = typeof createdAt === 'string' && isValidIsoTimestamp(createdAt);
      const isValidCreatedAtNumStr = typeof createdAt === 'string' && /^\d+$/.test(createdAt);
      if (!isValidCreatedAtNumber && !isValidCreatedAtIso && !isValidCreatedAtNumStr) {
        return { isValid: false, error: `Daily list "${list.title}" has an invalid createdAt timestamp.` };
      }

      if (!Array.isArray(list.items)) {
        return { isValid: false, error: `Daily list "${list.title}" items property must be an array.` };
      }

      for (let j = 0; j < list.items.length; j++) {
        const item = list.items[j];
        if (!item || typeof item !== 'object') {
          return { isValid: false, error: `Item at index ${j} in list "${list.title}" is not an object.` };
        }
        if (typeof item.id !== 'string' || !item.id.trim()) {
          return { isValid: false, error: `Item at index ${j} in list "${list.title}" has an invalid id.` };
        }
        if (typeof item.text !== 'string' || !item.text.trim()) {
          return { isValid: false, error: `Item "${item.id}" in list "${list.title}" has empty text.` };
        }
        if (typeof item.completed !== 'boolean') {
          return { isValid: false, error: `Item "${item.id}" in list "${list.title}" completed must be boolean.` };
        }
        if (item.completedAt !== null && item.completedAt !== undefined && !isValidIsoTimestamp(item.completedAt)) {
          return { isValid: false, error: `Item "${item.id}" in list "${list.title}" has an invalid completedAt timestamp.` };
        }
      }
    }

    // 6. Scholar Tasks Validation (Exact existing schema from js/scholar.js)
    const SCHOLAR_CATEGORIES = [
      'Exams',
      'Tests',
      'Records',
      'Assignments',
      'Skill Building',
      'Projects'
    ];
    const SCHOLAR_DATE_TYPES = ['event', 'deadline'];

    for (let i = 0; i < data.scholar.length; i++) {
      const task = data.scholar[i];
      if (!task || typeof task !== 'object') {
        return { isValid: false, error: `Scholar task at index ${i} is not a valid object.` };
      }
      if (typeof task.id !== 'string' || !task.id.trim()) {
        return { isValid: false, error: `Scholar task at index ${i} has an invalid or empty id.` };
      }
      if (typeof task.title !== 'string' || !task.title.trim()) {
        return { isValid: false, error: `Scholar task "${task.id}" has an invalid or empty title.` };
      }
      const catMatch = SCHOLAR_CATEGORIES.find(c => c.toLowerCase() === (task.category || '').toLowerCase());
      if (!catMatch) {
        return { isValid: false, error: `Scholar task "${task.title}" has invalid category: "${task.category}".` };
      }
      const dtLower = (task.dateType || '').toLowerCase();
      if (dtLower !== 'event' && dtLower !== 'deadline' && dtLower !== 'due') {
        return { isValid: false, error: `Scholar task "${task.title}" has invalid dateType: "${task.dateType}".` };
      }
      if (task.dueDate !== null && task.dueDate !== undefined && !isValidCalendarDate(task.dueDate)) {
        return { isValid: false, error: `Scholar task "${task.title}" has an invalid dueDate: "${task.dueDate}".` };
      }
      if (task.dueTime !== null && task.dueTime !== undefined && task.dueTime !== '' && !isValidTimeStr(task.dueTime)) {
        return { isValid: false, error: `Scholar task "${task.title}" has an invalid dueTime: "${task.dueTime}".` };
      }
      if (task.course !== undefined && task.course !== null && typeof task.course !== 'string') {
        return { isValid: false, error: `Scholar task "${task.title}" course must be string or null.` };
      }
      if (task.courseCode !== undefined && task.courseCode !== null && typeof task.courseCode !== 'string') {
        return { isValid: false, error: `Scholar task "${task.title}" courseCode must be string or null.` };
      }
      if (task.notes !== undefined && task.notes !== null && typeof task.notes !== 'string') {
        return { isValid: false, error: `Scholar task "${task.title}" notes must be string or null.` };
      }
      if (typeof task.completed !== 'boolean') {
        return { isValid: false, error: `Scholar task "${task.title}" completed must be boolean.` };
      }

      // Scholar task createdAt: integer milliseconds (Date.now()), canonical ISO string (new Date().toISOString()), or numeric string
      const scCreatedAt = task.createdAt;
      const isValidScCreatedNumber = typeof scCreatedAt === 'number' && Number.isFinite(scCreatedAt) && scCreatedAt > 0;
      const isValidScCreatedIso = typeof scCreatedAt === 'string' && isValidIsoTimestamp(scCreatedAt);
      const isValidScCreatedNumStr = typeof scCreatedAt === 'string' && /^\d+$/.test(scCreatedAt);
      if (!isValidScCreatedNumber && !isValidScCreatedIso && !isValidScCreatedNumStr) {
        return { isValid: false, error: `Scholar task "${task.title}" has an invalid createdAt timestamp.` };
      }

      if (task.updatedAt !== undefined && task.updatedAt !== null) {
        const scUpdatedAt = task.updatedAt;
        const isValidScUpdatedNumber = typeof scUpdatedAt === 'number' && Number.isFinite(scUpdatedAt) && scUpdatedAt > 0;
        const isValidScUpdatedIso = typeof scUpdatedAt === 'string' && isValidIsoTimestamp(scUpdatedAt);
        const isValidScUpdatedNumStr = typeof scUpdatedAt === 'string' && /^\d+$/.test(scUpdatedAt);
        if (!isValidScUpdatedNumber && !isValidScUpdatedIso && !isValidScUpdatedNumStr) {
          return { isValid: false, error: `Scholar task "${task.title}" has an invalid updatedAt timestamp.` };
        }
      }

      if (task.completedAt !== null && task.completedAt !== undefined && !isValidIsoTimestamp(task.completedAt)) {
        return { isValid: false, error: `Scholar task "${task.title}" has an invalid completedAt timestamp.` };
      }
    }

    // 7. Reflect Entries Validation (Exact existing schema from js/reflect.js)
    const REFLECT_MOODS = ['excited', 'happy', 'calm', 'neutral', 'low', 'tired'];

    for (let i = 0; i < data.reflect.length; i++) {
      const entry = data.reflect[i];
      if (!entry || typeof entry !== 'object') {
        return { isValid: false, error: `Reflect entry at index ${i} is not a valid object.` };
      }
      if (typeof entry.id !== 'string' || !entry.id.trim()) {
        return { isValid: false, error: `Reflect entry at index ${i} has an invalid or empty id.` };
      }
      const dateKey = entry.dateKey || entry.date;
      if (!dateKey || !isValidCalendarDate(dateKey)) {
        return { isValid: false, error: `Reflect entry at index ${i} has an invalid dateKey: "${dateKey}".` };
      }
      const moodLower = typeof entry.mood === 'string' ? entry.mood.toLowerCase() : '';
      if (!REFLECT_MOODS.includes(moodLower)) {
        return { isValid: false, error: `Reflect entry for ${dateKey} has an invalid mood: "${entry.mood}".` };
      }
      const content = entry.content !== undefined ? entry.content : entry.journalText;
      if (typeof content !== 'string' || !content.trim()) {
        return { isValid: false, error: `Reflect entry for ${dateKey} has invalid or empty content.` };
      }
      if (!isValidIsoTimestamp(entry.createdAt)) {
        return { isValid: false, error: `Reflect entry for ${entry.dateKey} has an invalid createdAt timestamp.` };
      }
      if (entry.updatedAt !== undefined && entry.updatedAt !== null && !isValidIsoTimestamp(entry.updatedAt)) {
        return { isValid: false, error: `Reflect entry for ${entry.dateKey} has an invalid updatedAt timestamp.` };
      }
    }

    return { isValid: true };
  }

  /* ---------------- Category D: Export, Restore & Clear All Data ---------------- */

  /**
   * Generates and downloads a clean, un-mutated JSON backup of all Daybloom data.
   */
  function exportBackup() {
    try {
      const currentStoredName = localStorage.getItem(USER_NAME_STORAGE_KEY) || null;
      const exportTimestamp = new Date().toISOString();

      const backupPayload = {
        app: 'Daybloom',
        version: 1,
        backupVersion: 1,
        exportDate: exportTimestamp,
        exportedAt: exportTimestamp,
        data: {
          user_name: currentStoredName,
          userName: currentStoredName,
          settings: {
            defaultSection: currentSettings.defaultSection,
            weekStartsOn: currentSettings.weekStartsOn,
            dateFormat: currentSettings.dateFormat,
            timeFormat: currentSettings.timeFormat,
            confirmDelete: currentSettings.confirmDelete
          },
          daily: JSON.parse(localStorage.getItem('daybloom_daily_tasks') || '[]'),
          scholar: JSON.parse(localStorage.getItem('daybloom_scholar_tasks') || '[]'),
          reflect: JSON.parse(localStorage.getItem('daybloom_reflect_entries') || '[]')
        }
      };

      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const now = new Date();
      const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const fileName = `daybloom_backup_${datePart}.json`;

      const downloadAnchor = document.createElement('a');
      downloadAnchor.href = url;
      downloadAnchor.download = fileName;
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      document.body.removeChild(downloadAnchor);
      URL.revokeObjectURL(url);

      showFeedbackMessage('Backup exported successfully!', 'success');
      return true;
    } catch (err) {
      console.error('DaybloomSettings: Export failed.', err);
      showFeedbackMessage('Export failed: ' + (err.message || 'Unknown error'), 'error');
      return false;
    }
  }

  /**
   * Restores data from a backup JSON payload with staged per-key verification
   * and double-fault emergency recovery interface.
   * @param {string} jsonText
   */
  function restoreBackup(jsonText) {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      showFeedbackMessage('Invalid file format: Not valid JSON.', 'error');
      return false;
    }

    // Deep validation against real schemas
    const validation = validateBackupPayload(parsed);
    if (!validation.isValid) {
      showFeedbackMessage('Validation failed: ' + validation.error, 'error');
      return false;
    }

    // 1. Transactional Pre-Restore Snapshot (Captures existing values and originally absent keys)
    const TARGET_KEYS = [
      USER_NAME_STORAGE_KEY,
      'daybloom_daily_tasks',
      'daybloom_scholar_tasks',
      'daybloom_reflect_entries',
      SETTINGS_STORAGE_KEY
    ];

    const snapshot = {};
    TARGET_KEYS.forEach(k => {
      snapshot[k] = localStorage.getItem(k);
    });

    // 2. Prepare serialized strings for new data
    const pendingWrites = {};
    const targetUserName = parsed.data.user_name !== undefined ? parsed.data.user_name : parsed.data.userName;
    if (targetUserName) {
      pendingWrites[USER_NAME_STORAGE_KEY] = targetUserName.trim();
    } else {
      pendingWrites[USER_NAME_STORAGE_KEY] = null; // To be removed
    }

    pendingWrites['daybloom_daily_tasks'] = JSON.stringify(parsed.data.daily);

    // Normalize scholar task categories to canonical case and map legacy 'due' to 'deadline'
    const safeScholar = parsed.data.scholar.map(task => {
      const copy = { ...task };
      const catMatch = SCHOLAR_CATEGORIES.find(c => c.toLowerCase() === (copy.category || '').toLowerCase());
      if (catMatch) copy.category = catMatch;
      if ((copy.dateType || '').toLowerCase() === 'due') copy.dateType = 'deadline';
      return copy;
    });
    pendingWrites['daybloom_scholar_tasks'] = JSON.stringify(safeScholar);

    // Normalize reflect fields: map legacy date -> dateKey, journalText -> content, lowercase mood
    const REFLECT_MOODS_LIST = ['excited', 'happy', 'calm', 'neutral', 'low', 'tired'];
    const safeReflect = parsed.data.reflect.map(entry => {
      const copy = { ...entry };
      if (!copy.dateKey && copy.date) copy.dateKey = copy.date;
      if (copy.content === undefined && copy.journalText) copy.content = copy.journalText;
      if (typeof copy.mood === 'string') copy.mood = copy.mood.toLowerCase();
      return copy;
    });
    pendingWrites['daybloom_reflect_entries'] = JSON.stringify(safeReflect);

    // Merge and safely normalize settings with full backward/forward compatibility
    const mergedSettings = { ...DEFAULT_SETTINGS, ...(parsed.data.settings || {}) };
    if (!VALID_DEFAULT_SECTIONS.includes(mergedSettings.defaultSection)) {
      mergedSettings.defaultSection = 'home';
    }
    const rawDateFormat = mergedSettings.dateFormat;
    if (rawDateFormat === 'system' || !rawDateFormat) {
      mergedSettings.dateFormat = 'MMM D, YYYY';
    } else if (rawDateFormat === 'yyyy-mm-dd') {
      mergedSettings.dateFormat = 'YYYY-MM-DD';
    } else if (rawDateFormat === 'dd-mm-yyyy') {
      mergedSettings.dateFormat = 'DD/MM/YYYY';
    } else if (rawDateFormat === 'mm-dd-yyyy') {
      mergedSettings.dateFormat = 'MM/DD/YYYY';
    } else if (!VALID_DATE_FORMATS.includes(rawDateFormat)) {
      mergedSettings.dateFormat = 'MMM D, YYYY';
    }

    const rawTimeFormat = mergedSettings.timeFormat;
    if (rawTimeFormat === 'system' || !VALID_TIME_FORMATS.includes(rawTimeFormat)) {
      mergedSettings.timeFormat = '12h';
    }

    if (mergedSettings.weekStartDay && !mergedSettings.weekStartsOn) {
      mergedSettings.weekStartsOn = mergedSettings.weekStartDay;
      delete mergedSettings.weekStartDay;
    }
    if (!VALID_WEEK_STARTS.includes(mergedSettings.weekStartsOn)) {
      mergedSettings.weekStartsOn = 'sunday';
    }
    pendingWrites[SETTINGS_STORAGE_KEY] = JSON.stringify(mergedSettings);

    // 3. Staged per-key write and immediate read-back verification
    let writeFailedKey = null;

    for (const key of TARGET_KEYS) {
      const val = pendingWrites[key];
      try {
        if (val === null) {
          localStorage.removeItem(key);
          const verify = localStorage.getItem(key);
          if (verify !== null) {
            writeFailedKey = key;
            break;
          }
        } else {
          localStorage.setItem(key, val);
          const verify = localStorage.getItem(key);
          if (verify !== val) {
            writeFailedKey = key;
            break;
          }
        }
      } catch (writeErr) {
        writeFailedKey = key;
        break;
      }
    }

    // 4. Handle failure with verified rollback
    if (writeFailedKey) {
      console.error(`DaybloomSettings: Restore write verification failed on key "${writeFailedKey}". Triggering rollback.`);

      let rollbackFailedKey = null;
      for (const key of TARGET_KEYS) {
        const origVal = snapshot[key];
        try {
          if (origVal === null) {
            localStorage.removeItem(key);
            if (localStorage.getItem(key) !== null) rollbackFailedKey = key;
          } else {
            localStorage.setItem(key, origVal);
            if (localStorage.getItem(key) !== origVal) rollbackFailedKey = key;
          }
        } catch (rollErr) {
          rollbackFailedKey = key;
        }
      }

      if (rollbackFailedKey) {
        // Double fault! In-memory recovery interface
        emergencySnapshot = snapshot;
        openEmergencyRecoveryModal(
          `A storage failure occurred during restore on key "${writeFailedKey}", and rollback also failed on key "${rollbackFailedKey}". Your original data is preserved in memory.`
        );
      } else {
        showFeedbackMessage(
          `Restore failed during write verification for key "${writeFailedKey}". All original data has been safely rolled back.`,
          'error'
        );
      }
      return false;
    }

    // 5. Success! Refresh state cleanly
    currentSettings = mergedSettings;
    loadCachedSettings();

    try {
      sessionStorage.setItem('daybloom_restore_feedback', 'Data restored successfully! All records and settings have been loaded.');
    } catch (e) {}

    showFeedbackMessage('Data restored successfully! Refreshing view...', 'success');

    setTimeout(() => {
      window.location.reload();
    }, 800);

    return true;
  }

  /**
   * Discovers and clears all Daybloom-owned localStorage keys.
   */
  function clearAllData() {
    // 1. Dynamic discovery of all Daybloom keys
    const discoveredKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^(__)?daybloom_/.test(key)) {
        discoveredKeys.push(key);
      }
    }

    // 2. Snapshot in case of removal failure
    const snapshot = {};
    discoveredKeys.forEach(k => {
      snapshot[k] = localStorage.getItem(k);
    });

    // 3. Verified per-key removal
    let failedKey = null;
    for (const key of discoveredKeys) {
      try {
        localStorage.removeItem(key);
        if (localStorage.getItem(key) !== null) {
          failedKey = key;
          break;
        }
      } catch (err) {
        failedKey = key;
        break;
      }
    }

    if (failedKey) {
      // Rollback
      discoveredKeys.forEach(k => {
        if (snapshot[k] !== null) localStorage.setItem(k, snapshot[k]);
      });
      showFeedbackMessage(`Failed to clear storage key "${failedKey}". Deletion cancelled and rolled back.`, 'error');
      return false;
    }

    // Reset settings in memory
    currentSettings = { ...DEFAULT_SETTINGS };

    showFeedbackMessage('All Daybloom data has been cleared. Restarting...', 'success');

    setTimeout(() => {
      window.location.reload();
    }, 800);

    return true;
  }

  /**
   * Computes human-readable storage size of all Daybloom keys.
   */
  function calculateStorageUsage() {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^(__)?daybloom_/.test(key)) {
        const val = localStorage.getItem(key) || '';
        bytes += (key.length + val.length) * 2; // UTF-16 approx
      }
    }

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /* ---------------- Modal & Alert Helpers ---------------- */

  let feedbackBannerTimer = null;
  function showFeedbackMessage(text, type = 'info') {
    const banner = document.getElementById('settings-feedback-banner');
    const inlineStatus = document.getElementById('settings-restore-inline-status');

    if (feedbackBannerTimer) {
      clearTimeout(feedbackBannerTimer);
      feedbackBannerTimer = null;
    }

    if (banner) {
      banner.textContent = text;
      banner.className = `settings-feedback-banner ${type}`;
      banner.removeAttribute('hidden');
      banner.hidden = false;
      banner.style.display = 'block';
    }

    if (inlineStatus) {
      inlineStatus.textContent = text;
      inlineStatus.style.display = 'block';
      if (type === 'success') {
        inlineStatus.style.color = '#047857';
        inlineStatus.style.backgroundColor = '#ecfdf5';
        inlineStatus.style.border = '1px solid #a7f3d0';
        inlineStatus.style.padding = '8px 12px';
        inlineStatus.style.borderRadius = 'var(--radius-md)';
      } else if (type === 'error') {
        inlineStatus.style.color = '#b91c1c';
        inlineStatus.style.backgroundColor = '#fef2f2';
        inlineStatus.style.border = '1px solid #fecaca';
        inlineStatus.style.padding = '8px 12px';
        inlineStatus.style.borderRadius = 'var(--radius-md)';
      } else {
        inlineStatus.style.color = '#1d4ed8';
        inlineStatus.style.backgroundColor = '#eff6ff';
        inlineStatus.style.border = '1px solid #bfdbfe';
        inlineStatus.style.padding = '8px 12px';
        inlineStatus.style.borderRadius = 'var(--radius-md)';
      }
    }

    feedbackBannerTimer = setTimeout(() => {
      if (banner) {
        banner.style.display = 'none';
        banner.setAttribute('hidden', '');
        banner.hidden = true;
        banner.className = 'settings-feedback-banner';
      }
      if (inlineStatus) {
        inlineStatus.style.display = 'none';
        inlineStatus.textContent = '';
      }
      feedbackBannerTimer = null;
    }, 6000);
  }

  function openClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    const checkbox = document.getElementById('clear-data-confirm-checkbox');
    const confirmBtn = document.getElementById('clear-data-confirm-btn');

    if (modal && checkbox && confirmBtn) {
      checkbox.checked = false;
      confirmBtn.disabled = true;
      modal.classList.add('active');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function openEmergencyRecoveryModal(reason) {
    const modal = document.getElementById('emergency-recovery-modal');
    const descEl = document.getElementById('emergency-recovery-desc');
    const jsonEl = document.getElementById('emergency-recovery-json');

    if (modal && descEl && jsonEl && emergencySnapshot) {
      descEl.textContent = reason;
      jsonEl.value = JSON.stringify(emergencySnapshot, null, 2);
      modal.classList.add('active');
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeEmergencyRecoveryModal() {
    const modal = document.getElementById('emergency-recovery-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  function updateLiveDateTimePreview() {
    const previewEl = document.getElementById('settings-datetime-preview');
    if (!previewEl) return;

    const now = new Date();
    const formattedDate = formatDate(now);
    const formattedTime = formatTime(now);

    previewEl.textContent = `${formattedDate} • ${formattedTime}`;
  }

  /* ---------------- Event Binding & View Setup ---------------- */

  function bindEvents() {
    // 1. Back button returns to prior active view
    const backBtn = document.getElementById('settings-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof DaybloomNav !== 'undefined') {
          const navFn = DaybloomNav.navigateTo || DaybloomNav.switchSection;
          if (navFn) {
            const target = previousSectionBeforeSettings && VALID_DEFAULT_SECTIONS.includes(previousSectionBeforeSettings)
              ? previousSectionBeforeSettings
              : currentSettings.defaultSection;
            navFn(target);
          }
        }
      });
    }

    // 2. Personalisation Name input & save button
    const nameInput = document.getElementById('settings-name-input') || document.getElementById('settings-user-name-input');
    const nameSaveBtn = document.getElementById('settings-name-save-btn') || document.getElementById('settings-save-name-btn');

    const handleNameSave = () => {
      if (!nameInput) return;
      const raw = nameInput.value.trim();
      if (!raw) {
        showFeedbackMessage('Please enter a name between 1 and 50 characters.', 'error');
        return;
      }
      if (raw.length > 50) {
        showFeedbackMessage('Name cannot exceed 50 characters.', 'error');
        return;
      }

      currentSettings.name = raw;
      localStorage.setItem(USER_NAME_STORAGE_KEY, raw);

      // Instantly refresh greetings across the app
      if (typeof DaybloomWelcome !== 'undefined' && DaybloomWelcome.updateGreetings) {
        DaybloomWelcome.updateGreetings(raw);
      }
      const homeGreeting = document.getElementById('home-greeting-title');
      if (homeGreeting) {
        const hour = new Date().getHours();
        let greeting = 'Good morning';
        if (hour >= 12 && hour < 17) greeting = 'Good afternoon';
        else if (hour >= 17) greeting = 'Good evening';
        homeGreeting.textContent = `${greeting}, ${raw}!`;
      }

      showFeedbackMessage('Preferred name saved successfully!', 'success');
    };

    if (nameSaveBtn) {
      nameSaveBtn.addEventListener('click', handleNameSave);
    }
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleNameSave();
        }
      });
    }

    // 3. Default Opening Section Select
    const defaultSecSelect = document.getElementById('settings-default-section-select');
    if (defaultSecSelect) {
      defaultSecSelect.value = currentSettings.defaultSection;
      defaultSecSelect.addEventListener('change', () => {
        if (VALID_DEFAULT_SECTIONS.includes(defaultSecSelect.value)) {
          currentSettings.defaultSection = defaultSecSelect.value;
          saveSettings();
          showFeedbackMessage('Default opening section saved.', 'success');
        }
      });
    }

    // 4. Week Start Day Select (Scholar Calendar)
    const weekStartSelect = document.getElementById('settings-week-start-select');
    if (weekStartSelect) {
      weekStartSelect.value = currentSettings.weekStartsOn;
      weekStartSelect.addEventListener('change', () => {
        if (VALID_WEEK_STARTS.includes(weekStartSelect.value)) {
          currentSettings.weekStartsOn = weekStartSelect.value;
          saveSettings();
          if (typeof DaybloomScholar !== 'undefined' && DaybloomScholar.render) {
            DaybloomScholar.render();
          }
          showFeedbackMessage('Scholar calendar starting day updated.', 'success');
        }
      });
    }

    // 5. Date Format Select
    const dateFormatSelect = document.getElementById('settings-date-format-select');
    if (dateFormatSelect) {
      dateFormatSelect.value = currentSettings.dateFormat;
      dateFormatSelect.addEventListener('change', () => {
        if (VALID_DATE_FORMATS.includes(dateFormatSelect.value)) {
          currentSettings.dateFormat = dateFormatSelect.value;
          saveSettings();
          updateLiveDateTimePreview();
          if (typeof updateDateDisplays === 'function') updateDateDisplays();
          if (typeof DaybloomDaily !== 'undefined' && DaybloomDaily.render) DaybloomDaily.render();
          if (typeof DaybloomScholar !== 'undefined' && DaybloomScholar.render) DaybloomScholar.render();
          if (typeof DaybloomReflect !== 'undefined' && DaybloomReflect.render) DaybloomReflect.render();
          showFeedbackMessage('Date format preference updated.', 'success');
        }
      });
    }

    // 6. Time Format Select
    const timeFormatSelect = document.getElementById('settings-time-format-select');
    if (timeFormatSelect) {
      timeFormatSelect.value = currentSettings.timeFormat;
      timeFormatSelect.addEventListener('change', () => {
        if (VALID_TIME_FORMATS.includes(timeFormatSelect.value)) {
          currentSettings.timeFormat = timeFormatSelect.value;
          saveSettings();
          updateLiveDateTimePreview();
          if (typeof DaybloomDaily !== 'undefined' && DaybloomDaily.render) DaybloomDaily.render();
          if (typeof DaybloomScholar !== 'undefined' && DaybloomScholar.render) DaybloomScholar.render();
          showFeedbackMessage('Time format preference updated.', 'success');
        }
      });
    }

    // 7. Confirm Delete Checkbox
    const confirmDeleteCheck = document.getElementById('settings-confirm-delete-checkbox');
    if (confirmDeleteCheck) {
      confirmDeleteCheck.checked = currentSettings.confirmDelete;
      confirmDeleteCheck.addEventListener('change', () => {
        currentSettings.confirmDelete = Boolean(confirmDeleteCheck.checked);
        saveSettings();
        showFeedbackMessage('Deletion confirmation preference updated.', 'success');
      });
    }

    // 8. Export Backup Button
    const exportBtn = document.getElementById('settings-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        exportBackup();
      });
    }

    // 9. Import / Restore File Input & Label
    const fileInput = document.getElementById('settings-restore-file-input');
    const restoreTriggerBtn = document.getElementById('settings-restore-btn');

    if (restoreTriggerBtn && fileInput) {
      restoreTriggerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.value = '';
        fileInput.click();
      });

      restoreTriggerBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileInput.value = '';
          fileInput.click();
        }
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) {
          return;
        }

        const reader = new FileReader();
        reader.onload = (readEvt) => {
          try {
            const contents = readEvt.target.result;
            restoreBackup(contents);
          } catch (err) {
            console.error('DaybloomSettings: Restore execution failed:', err);
            showFeedbackMessage('Failed to restore backup: ' + (err.message || 'Unknown error'), 'error');
          } finally {
            fileInput.value = '';
          }
        };
        reader.onerror = (err) => {
          console.error('DaybloomSettings: FileReader failed:', err);
          fileInput.value = '';
          showFeedbackMessage('Failed to read file from disk.', 'error');
        };
        reader.readAsText(file);
      });
    }

    // 10. Clear All Data Modal Flow
    const clearTriggerBtn = document.getElementById('settings-clear-all-btn') || document.getElementById('settings-clear-data-btn');
    const clearCancelBtn = document.getElementById('clear-data-cancel-btn');
    const clearConfirmBtn = document.getElementById('clear-data-confirm-btn');
    const clearCheckbox = document.getElementById('clear-data-confirm-checkbox');
    const clearModal = document.getElementById('clear-data-modal');

    if (clearTriggerBtn) {
      clearTriggerBtn.addEventListener('click', openClearDataModal);
    }
    if (clearCancelBtn) {
      clearCancelBtn.addEventListener('click', closeClearDataModal);
    }
    if (clearModal) {
      clearModal.addEventListener('click', (e) => {
        if (e.target === clearModal) {
          closeClearDataModal();
        }
      });
    }
    if (clearCheckbox && clearConfirmBtn) {
      clearCheckbox.addEventListener('change', () => {
        clearConfirmBtn.disabled = !clearCheckbox.checked;
      });
      clearConfirmBtn.addEventListener('click', () => {
        closeClearDataModal();
        clearAllData();
      });
    }

    // 11. Emergency Recovery Modal Actions
    const emergencyCloseBtn = document.getElementById('emergency-recovery-close-btn');
    const emergencyDownloadBtn = document.getElementById('emergency-recovery-download-btn');

    if (emergencyCloseBtn) {
      emergencyCloseBtn.addEventListener('click', closeEmergencyRecoveryModal);
    }
    const emergencyModal = document.getElementById('emergency-recovery-modal');
    if (emergencyModal) {
      emergencyModal.addEventListener('click', (e) => {
        if (e.target === emergencyModal) {
          closeEmergencyRecoveryModal();
        }
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeClearDataModal();
        closeEmergencyRecoveryModal();
      }
    });
    if (emergencyDownloadBtn) {
      emergencyDownloadBtn.addEventListener('click', () => {
        if (!emergencySnapshot) return;
        const blob = new Blob([JSON.stringify(emergencySnapshot, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daybloom_emergency_recovery_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }
  }

  /**
   * Renders settings form fields with current values.
   */
  function render() {
    const nameInput = document.getElementById('settings-name-input') || document.getElementById('settings-user-name-input');
    if (nameInput) {
      nameInput.value = currentSettings.name || localStorage.getItem(USER_NAME_STORAGE_KEY) || '';
    }

    const defaultSecSelect = document.getElementById('settings-default-section-select');
    if (defaultSecSelect) {
      defaultSecSelect.value = currentSettings.defaultSection;
    }

    const weekStartSelect = document.getElementById('settings-week-start-select');
    if (weekStartSelect) {
      weekStartSelect.value = currentSettings.weekStartsOn;
    }

    const dateFormatSelect = document.getElementById('settings-date-format-select');
    if (dateFormatSelect) {
      dateFormatSelect.value = currentSettings.dateFormat;
    }

    const timeFormatSelect = document.getElementById('settings-time-format-select');
    if (timeFormatSelect) {
      timeFormatSelect.value = currentSettings.timeFormat;
    }

    const confirmDeleteCheck = document.getElementById('settings-confirm-delete-checkbox');
    if (confirmDeleteCheck) {
      confirmDeleteCheck.checked = currentSettings.confirmDelete;
    }

    const storageUsageEl = document.getElementById('settings-storage-usage-text');
    if (storageUsageEl) {
      storageUsageEl.textContent = calculateStorageUsage();
    }

    updateLiveDateTimePreview();
  }

  /**
   * Initializes the settings module with idempotency check.
   */
  function init() {
    if (isInitialized) return;

    try {
      loadCachedSettings();
      bindEvents();
      render();
      isInitialized = true;

      // Surface post-reload restore confirmation
      try {
        const flashFeedback = sessionStorage.getItem('daybloom_restore_feedback');
        if (flashFeedback) {
          sessionStorage.removeItem('daybloom_restore_feedback');
          setTimeout(() => {
            showFeedbackMessage(flashFeedback, 'success');
          }, 150);
        }
      } catch (e) {}
    } catch (err) {
      console.error('DaybloomSettings: Failed to initialize.', err);
    }
  }

  return {
    init,
    render,
    get: (key) => (key ? currentSettings[key] : { ...currentSettings }),
    set: (key, val) => {
      currentSettings[key] = val;
      saveSettings();
    },
    formatDate,
    formatTime,
    shouldConfirmDelete: () => currentSettings.confirmDelete !== false,
    getWeekStartsOn: () => currentSettings.weekStartsOn || 'sunday',
    getWeekStartDay: () => currentSettings.weekStartsOn || 'sunday',
    setPreviousSection: (sec) => {
      if (VALID_DEFAULT_SECTIONS.includes(sec)) previousSectionBeforeSettings = sec;
    },
    validateBackupPayload,
    exportBackup,
    restoreBackup,
    clearAllData,
    calculateStorageUsage
  };
})();

if (typeof window !== 'undefined') {
  window.DaybloomSettings = DaybloomSettings;
}
