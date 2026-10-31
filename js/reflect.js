/**
 * Daybloom Reflect: Daily Mood Tracking, Journaling & Rolling 30-Day History
 * --------------------------------------------------------------------------
 * Features:
 * 1. Accessible Mood Selection: 6 exact moods (Excited, Happy, Calm, Neutral, Low, Tired)
 *    implemented as a WAI-ARIA radio group with keyboard roving tabindex and arrow-key navigation.
 * 2. Daily Reflection Studio: Dual validation (mood + non-empty trimmed text), one entry per date
 *    (updates in-place if existing), plain-text safe rendering, past-date edit banner, and
 *    "Return to Today" safety switch.
 * 3. Rolling 30-Calendar-Day Mood History: Exactly 30 calendar dates ending today, aligned
 *    Sunday–Saturday with leading and trailing blank cells, accessible date buttons, and
 *    selected date inspector.
 * 4. All-Time Previous Journal Entries Archive: Sorted newest first, displaying date, mood emoji,
 *    safe content preview, full reading toggle, editing in studio, and deletion with confirmation.
 * 5. Data Protection: Field-by-field validation of stored records; malformed data blocks all writes
 *    and preserves original storage to prevent any data loss.
 *
 * Dedicated storage key: 'daybloom_reflect_entries'
 */

const DaybloomReflect = (() => {
  const STORAGE_KEY = 'daybloom_reflect_entries';

  // The 6 exact required moods (no substitutions)
  const MOODS = [
    { key: 'excited', label: 'Excited', emoji: '🤩', desc: 'High energy, enthusiastic' },
    { key: 'happy', label: 'Happy', emoji: '😊', desc: 'Content, pleased' },
    { key: 'calm', label: 'Calm', emoji: '😌', desc: 'Grounded, peaceful' },
    { key: 'neutral', label: 'Neutral', emoji: '😐', desc: 'Steady, routine' },
    { key: 'low', label: 'Low', emoji: '😔', desc: 'Depleted, quiet' },
    { key: 'tired', label: 'Tired', emoji: '🥱', desc: 'Weary, needing rest' }
  ];

  const ALLOWED_MOOD_KEYS = MOODS.map(m => m.key);
  const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // State
  let entries = [];
  let isStorageCorrupted = false;
  let rawCorruptedData = null;

  let selectedDateStr = null; // Active date inspected in rolling 30-day view ("YYYY-MM-DD")
  let selectedMood = null;    // Active mood key in studio ('excited' | 'happy' | ... | null)

  let editorState = {
    isEditingPast: false,     // true when editing a date other than today
    targetDate: null,         // "YYYY-MM-DD"
    entryId: null             // string id or null
  };

  /**
   * Formats a Date object into local "YYYY-MM-DD" string.
   */
  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Formats a "YYYY-MM-DD" string into human-friendly display.
   * e.g. "Friday, Oct 30, 2026"
   */
  function formatFriendlyDate(dateKey) {
    if (!dateKey) return '';
    if (typeof DaybloomSettings !== 'undefined' && DaybloomSettings.formatDate) {
      return DaybloomSettings.formatDate(dateKey);
    }
    const [year, month, day] = dateKey.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Formats a "YYYY-MM-DD" string for badges.
   * e.g. "Oct 30, 2026"
   */
  function formatShortDate(dateKey) {
    if (!dateKey) return '';
    if (typeof DaybloomSettings !== 'undefined' && DaybloomSettings.formatDate) {
      return DaybloomSettings.formatDate(dateKey);
    }
    const [year, month, day] = dateKey.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Validates individual stored record schema.
   */
  function isValidEntryRecord(item) {
    if (!item || typeof item !== 'object') return false;
    if (typeof item.id !== 'string' || item.id.trim() === '') return false;
    if (typeof item.dateKey !== 'string' || !DATE_KEY_REGEX.test(item.dateKey)) return false;
    if (typeof item.mood !== 'string' || !ALLOWED_MOOD_KEYS.includes(item.mood)) return false;
    if (typeof item.content !== 'string' || item.content.trim() === '') return false;
    if (typeof item.createdAt !== 'string' || isNaN(Date.parse(item.createdAt))) return false;
    if (typeof item.updatedAt !== 'string' || isNaN(Date.parse(item.updatedAt))) return false;
    return true;
  }

  /**
   * Safely loads entries from localStorage.
   * If parsing fails or any record is malformed, halts overwrite and sets isStorageCorrupted = true.
   */
  function loadEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      entries = [];
      isStorageCorrupted = false;
      rawCorruptedData = null;
      hideStorageAlert();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('DaybloomReflect: Parsed data is not an array.');
      }

      for (let i = 0; i < parsed.length; i++) {
        if (!isValidEntryRecord(parsed[i])) {
          throw new Error(`DaybloomReflect: Record at index ${i} failed schema validation.`);
        }
      }

      entries = parsed;
      isStorageCorrupted = false;
      rawCorruptedData = null;
      hideStorageAlert();
    } catch (err) {
      console.error('DaybloomReflect: LocalStorage data corrupted or invalid.', err);
      isStorageCorrupted = true;
      rawCorruptedData = raw;
      entries = [];
      showStorageAlert();
    }
  }

  /**
   * Saves entries to localStorage under 'daybloom_reflect_entries'.
   * Blocks write immediately if storage corruption was detected.
   */
  function saveEntries() {
    if (isStorageCorrupted) {
      console.error('DaybloomReflect: Aborting save to protect malformed raw localStorage data.');
      showStorageAlert();
      return false;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch (err) {
      console.error('DaybloomReflect: Error saving entries to localStorage', err);
      return false;
    }
  }

  /**
   * Displays the persistent storage corruption alert banner.
   */
  function showStorageAlert() {
    const alertEl = document.getElementById('reflect-storage-alert');
    if (alertEl) {
      alertEl.style.display = 'flex';
    }
  }

  /**
   * Hides the storage corruption alert banner.
   */
  function hideStorageAlert() {
    const alertEl = document.getElementById('reflect-storage-alert');
    if (alertEl) {
      alertEl.style.display = 'none';
    }
  }

  /**
   * Computes the 30 calendar dates ending today in local time.
   * Returns array of 30 items: { dateObj, dateKey }.
   */
  function getRolling30Dates() {
    const today = new Date();
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      dates.push({
        dateObj: d,
        dateKey: formatDateKey(d)
      });
    }
    return dates;
  }

  /**
   * Initializes Daybloom Reflect module.
   */
  function init() {
    loadEntries();

    const todayStr = formatDateKey(new Date());
    selectedDateStr = todayStr;
    setEditorToDate(todayStr, false);

    bindMoodRadioGroupEvents();
    bindEditorActionEvents();
    bindInspectorEvents();

    render();
  }

  /**
   * Main render dispatcher for Reflect components.
   */
  function render() {
    renderMoodRadioGroup();
    renderRollingCalendar();
    renderInspector();
    renderArchive();
  }

  /**
   * Binds accessible keyboard and click events to the Mood Radio Group.
   */
  function bindMoodRadioGroupEvents() {
    const radiogroup = document.getElementById('reflect-mood-radiogroup');
    if (!radiogroup) return;

    radiogroup.addEventListener('keydown', (event) => {
      const buttons = Array.from(radiogroup.querySelectorAll('.reflect-mood-btn'));
      if (buttons.length === 0) return;

      const currentIndex = buttons.findIndex(btn => btn === document.activeElement);
      let nextIndex = -1;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % buttons.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        nextIndex = currentIndex === -1 ? buttons.length - 1 : (currentIndex - 1 + buttons.length) % buttons.length;
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (currentIndex !== -1) {
          selectMood(buttons[currentIndex].getAttribute('data-mood'));
        }
        return;
      }

      if (nextIndex !== -1) {
        const targetBtn = buttons[nextIndex];
        const targetMood = targetBtn.getAttribute('data-mood');
        selectMood(targetMood);
        targetBtn.focus();
      }
    });

    radiogroup.addEventListener('click', (event) => {
      const btn = event.target.closest('.reflect-mood-btn');
      if (btn) {
        const mood = btn.getAttribute('data-mood');
        selectMood(mood);
      }
    });
  }

  /**
   * Selects a mood and updates the radio group visual & ARIA states.
   */
  function selectMood(moodKey) {
    if (!ALLOWED_MOOD_KEYS.includes(moodKey)) return;
    selectedMood = moodKey;
    hideValidationAlert();
    renderMoodRadioGroup();
  }

  /**
   * Renders the Mood Radio Group buttons with roving tabindex and aria-checked.
   */
  function renderMoodRadioGroup() {
    const radiogroup = document.getElementById('reflect-mood-radiogroup');
    if (!radiogroup) return;

    const buttons = radiogroup.querySelectorAll('.reflect-mood-btn');
    buttons.forEach((btn, index) => {
      const mood = btn.getAttribute('data-mood');
      const isSelected = mood === selectedMood;

      btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      btn.classList.toggle('is-selected', isSelected);

      // Roving tabindex:
      // If a mood is selected, it gets tabindex="0", others "-1".
      // If none selected, the first gets "0", others "-1".
      if (selectedMood) {
        btn.setAttribute('tabindex', isSelected ? '0' : '-1');
      } else {
        btn.setAttribute('tabindex', index === 0 ? '0' : '-1');
      }
    });
  }

  /**
   * Sets up editor state for a specified date.
   */
  function setEditorToDate(dateKey, isPast) {
    editorState.targetDate = dateKey;
    editorState.isEditingPast = isPast;

    const todayStr = formatDateKey(new Date());
    const isToday = dateKey === todayStr;

    // Look for existing entry for this date
    const existing = entries.find(e => e.dateKey === dateKey);
    editorState.entryId = existing ? existing.id : null;

    const titleEl = document.getElementById('reflect-editor-title');
    const subtitleEl = document.getElementById('reflect-editor-subtitle');
    const badgeEl = document.getElementById('reflect-editor-date-badge');
    const pastBanner = document.getElementById('reflect-past-banner');
    const pastBannerText = document.getElementById('reflect-past-banner-text');
    const journalInput = document.getElementById('reflect-journal-input');
    const saveBtn = document.getElementById('reflect-btn-save');

    hideValidationAlert();

    if (isPast && !isToday) {
      if (pastBanner) pastBanner.style.display = 'flex';
      if (pastBannerText) pastBannerText.textContent = `Editing entry for ${formatFriendlyDate(dateKey)}`;
      if (titleEl) titleEl.textContent = 'Editing Reflection';
      if (subtitleEl) subtitleEl.textContent = `Updating reflection for ${formatFriendlyDate(dateKey)}`;
      if (badgeEl) badgeEl.textContent = `Past Entry · ${formatShortDate(dateKey)}`;
      if (saveBtn) saveBtn.textContent = `Update Entry for ${formatShortDate(dateKey)}`;
    } else {
      if (pastBanner) pastBanner.style.display = 'none';
      if (titleEl) titleEl.textContent = "Today's Reflection";
      if (subtitleEl) subtitleEl.textContent = 'Select your mood and write your thoughts.';
      if (badgeEl) badgeEl.textContent = `Today · ${formatShortDate(todayStr)}`;
      if (saveBtn) saveBtn.textContent = existing ? "Update Today's Entry" : "Save Today's Entry";
    }

    if (existing) {
      selectedMood = existing.mood;
      if (journalInput) journalInput.value = existing.content;
    } else {
      selectedMood = null;
      if (journalInput) journalInput.value = '';
    }

    renderMoodRadioGroup();
  }

  /**
   * Resets editor to today's date safely.
   */
  function returnToToday() {
    const todayStr = formatDateKey(new Date());
    setEditorToDate(todayStr, false);
  }

  /**
   * Binds actions to Save, Clear, and Return to Today buttons.
   */
  function bindEditorActionEvents() {
    const saveBtn = document.getElementById('reflect-btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveEntryFromEditor);
    }

    const clearBtn = document.getElementById('reflect-btn-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        selectedMood = null;
        const journalInput = document.getElementById('reflect-journal-input');
        if (journalInput) journalInput.value = '';
        hideValidationAlert();
        renderMoodRadioGroup();
      });
    }

    const returnTodayBtn = document.getElementById('reflect-btn-return-today');
    if (returnTodayBtn) {
      returnTodayBtn.addEventListener('click', returnToToday);
    }
  }

  /**
   * Shows validation error alert with custom message.
   */
  function showValidationAlert(message) {
    const alertEl = document.getElementById('reflect-validation-alert');
    const msgEl = document.getElementById('reflect-validation-message');
    if (alertEl && msgEl) {
      msgEl.textContent = message;
      alertEl.style.display = 'block';
    }
  }

  /**
   * Hides validation alert.
   */
  function hideValidationAlert() {
    const alertEl = document.getElementById('reflect-validation-alert');
    if (alertEl) {
      alertEl.style.display = 'none';
    }
  }

  /**
   * Explicit Dual Validation & Deterministic One-Entry-Per-Day Save.
   */
  function saveEntryFromEditor() {
    hideValidationAlert();

    // 1. Mood must be selected
    if (!selectedMood || !ALLOWED_MOOD_KEYS.includes(selectedMood)) {
      showValidationAlert('Please select a mood before saving.');
      return;
    }

    // 2. Journal content must be non-empty after trimming
    const journalInput = document.getElementById('reflect-journal-input');
    const trimmedText = journalInput ? journalInput.value.trim() : '';
    if (!trimmedText) {
      showValidationAlert('Please write a reflection before saving.');
      return;
    }

    const targetDate = editorState.targetDate || formatDateKey(new Date());
    const nowIso = new Date().toISOString();

    // 3. One-entry-per-day rule: check if entry already exists for targetDate
    const existingIndex = entries.findIndex(e => e.dateKey === targetDate);

    if (existingIndex !== -1) {
      // Update existing entry in-place
      entries[existingIndex].mood = selectedMood;
      entries[existingIndex].content = trimmedText;
      entries[existingIndex].updatedAt = nowIso;
    } else {
      // Create single new entry for targetDate
      const newEntry = {
        id: 'reflect_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        dateKey: targetDate,
        mood: selectedMood,
        content: trimmedText,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      entries.unshift(newEntry);
    }

    const success = saveEntries();
    if (!success) {
      showValidationAlert('Could not save entry: storage data protection active.');
      return;
    }

    // Update selected date to the one just saved
    selectedDateStr = targetDate;

    // Refresh views
    renderRollingCalendar();
    renderInspector();
    renderArchive();

    // Re-sync editor UI for the target date
    const todayStr = formatDateKey(new Date());
    setEditorToDate(targetDate, targetDate !== todayStr);
  }

  /**
   * Renders the rolling 30-calendar-day history grid ending today.
   */
  function renderRollingCalendar() {
    const grid = document.getElementById('reflect-calendar-grid');
    const subtitle = document.getElementById('reflect-rolling-subtitle');
    if (!grid) return;

    grid.innerHTML = '';

    const rolling30 = getRolling30Dates();
    if (rolling30.length === 0) return;

    const startDate = rolling30[0].dateObj;
    const endDate = rolling30[rolling30.length - 1].dateObj;
    const todayStr = formatDateKey(new Date());

    if (subtitle) {
      const options = { month: 'short', day: 'numeric', year: 'numeric' };
      subtitle.textContent = `${startDate.toLocaleDateString(undefined, options)} – ${endDate.toLocaleDateString(undefined, options)} (Past 30 days)`;
    }

    // Sunday–Saturday alignment: leading blank cells
    const leadingBlanks = startDate.getDay(); // 0 for Sun, 1 for Mon, ..., 6 for Sat
    for (let i = 0; i < leadingBlanks; i++) {
      const blank = document.createElement('div');
      blank.className = 'reflect-calendar-blank';
      blank.setAttribute('aria-hidden', 'true');
      grid.appendChild(blank);
    }

    // Render each of the 30 calendar dates
    rolling30.forEach(({ dateObj, dateKey }) => {
      const dayNum = dateObj.getDate();
      const isToday = dateKey === todayStr;
      const isSelected = dateKey === selectedDateStr;
      const entry = entries.find(e => e.dateKey === dateKey);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'reflect-calendar-day-btn';
      btn.setAttribute('data-date', dateKey);

      if (isToday) btn.classList.add('is-today');
      if (isSelected) btn.classList.add('is-selected');

      // Descriptive accessible label
      const friendlyDate = formatFriendlyDate(dateKey);
      let ariaDesc = `${friendlyDate}.`;
      if (isToday) ariaDesc += ' Today.';
      if (entry) {
        const moodObj = MOODS.find(m => m.key === entry.mood);
        const moodName = moodObj ? moodObj.label : entry.mood;
        ariaDesc += ` Mood: ${moodName}. Reflection entry recorded.`;
      } else {
        ariaDesc += ' No reflection entry recorded.';
      }
      btn.setAttribute('aria-label', ariaDesc);

      // Day number span
      const numSpan = document.createElement('span');
      numSpan.className = 'calendar-day-number';
      numSpan.textContent = String(dayNum);
      btn.appendChild(numSpan);

      // Mood indicator dot / emoji
      if (entry) {
        btn.classList.add('has-entry');
        const moodObj = MOODS.find(m => m.key === entry.mood);
        const moodSpan = document.createElement('span');
        moodSpan.className = 'calendar-day-mood';
        moodSpan.setAttribute('aria-hidden', 'true');
        moodSpan.textContent = moodObj ? moodObj.emoji : '•';
        btn.appendChild(moodSpan);
      }

      btn.addEventListener('click', () => {
        selectDate(dateKey);
      });

      grid.appendChild(btn);
    });

    // Trailing blank cells to complete the 7-column grid
    const totalRendered = leadingBlanks + 30;
    const trailingBlanks = (7 - (totalRendered % 7)) % 7;
    for (let i = 0; i < trailingBlanks; i++) {
      const blank = document.createElement('div');
      blank.className = 'reflect-calendar-blank';
      blank.setAttribute('aria-hidden', 'true');
      grid.appendChild(blank);
    }
  }

  /**
   * Binds inspector events (Edit Selected, Jump to Today).
   */
  function bindInspectorEvents() {
    const editSelectedBtn = document.getElementById('reflect-btn-edit-selected');
    if (editSelectedBtn) {
      editSelectedBtn.addEventListener('click', () => {
        if (!selectedDateStr) return;
        const todayStr = formatDateKey(new Date());
        setEditorToDate(selectedDateStr, selectedDateStr !== todayStr);
        // Smooth scroll to editor
        const editorCard = document.querySelector('.reflect-editor-card');
        if (editorCard) {
          editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }

    const todayShortcutBtn = document.getElementById('reflect-btn-select-today');
    if (todayShortcutBtn) {
      todayShortcutBtn.addEventListener('click', () => {
        const todayStr = formatDateKey(new Date());
        selectDate(todayStr);
      });
    }
  }

  /**
   * Selects a date in the calendar and updates inspector.
   */
  function selectDate(dateKey) {
    selectedDateStr = dateKey;
    renderRollingCalendar();
    renderInspector();
  }

  /**
   * Renders the Selected Date Inspector using safe plain-text DOM insertion.
   */
  function renderInspector() {
    const dateHeading = document.getElementById('reflect-inspector-date');
    const moodPill = document.getElementById('reflect-inspector-mood-pill');
    const contentContainer = document.getElementById('reflect-inspector-content');
    const editBtn = document.getElementById('reflect-btn-edit-selected');

    if (!dateHeading || !moodPill || !contentContainer) return;

    const dateKey = selectedDateStr || formatDateKey(new Date());
    const todayStr = formatDateKey(new Date());
    const isToday = dateKey === todayStr;

    dateHeading.textContent = isToday ? `Today (${formatShortDate(dateKey)})` : formatFriendlyDate(dateKey);

    const entry = entries.find(e => e.dateKey === dateKey);

    // Clear content container
    contentContainer.innerHTML = '';

    if (entry) {
      const moodObj = MOODS.find(m => m.key === entry.mood);
      moodPill.textContent = moodObj ? `${moodObj.emoji} ${moodObj.label}` : entry.mood;
      moodPill.className = 'inspector-mood-pill has-mood';

      // Safe DOM text insertion
      const bodyEl = document.createElement('div');
      bodyEl.className = 'reflect-entry-body';
      bodyEl.textContent = entry.content; // Guaranteed safe plain text
      contentContainer.appendChild(bodyEl);

      if (editBtn) {
        editBtn.style.display = 'inline-flex';
        editBtn.textContent = 'Edit Entry';
      }
    } else {
      moodPill.textContent = 'No entry';
      moodPill.className = 'inspector-mood-pill text-muted';

      const emptyEl = document.createElement('p');
      emptyEl.className = 'text-muted';
      emptyEl.textContent = 'No reflection entry recorded for this date.';
      contentContainer.appendChild(emptyEl);

      if (editBtn) {
        editBtn.style.display = 'inline-flex';
        editBtn.textContent = 'Write Entry for Date';
      }
    }
  }

  /**
   * Renders the all-time Previous Journal Entries Archive sorted newest first.
   * Features: Safe text preview, Read Full Entry toggle, Edit, Delete with confirmation.
   */
  function renderArchive() {
    const listContainer = document.getElementById('reflect-archive-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (entries.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'reflect-empty-archive';
      const emptyText = document.createElement('p');
      emptyText.className = 'text-muted';
      emptyText.textContent = "No journal reflections recorded yet. Use the studio above to write today's reflection.";
      emptyCard.appendChild(emptyText);
      listContainer.appendChild(emptyCard);
      return;
    }

    // Sort newest first: primary by dateKey descending, secondary by createdAt descending
    const sortedEntries = [...entries].sort((a, b) => {
      const dateCmp = b.dateKey.localeCompare(a.dateKey);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    sortedEntries.forEach((entry) => {
      const card = document.createElement('div');
      card.className = 'reflect-archive-item';
      card.setAttribute('data-id', entry.id);

      // 1. Header Row: Date & Mood Badge
      const headerRow = document.createElement('div');
      headerRow.className = 'reflect-archive-item-header';

      const dateEl = document.createElement('span');
      dateEl.className = 'reflect-archive-date';
      dateEl.textContent = formatFriendlyDate(entry.dateKey);
      headerRow.appendChild(dateEl);

      const moodObj = MOODS.find(m => m.key === entry.mood);
      const moodBadge = document.createElement('span');
      moodBadge.className = 'reflect-archive-mood-badge';
      moodBadge.textContent = moodObj ? `${moodObj.emoji} ${moodObj.label}` : entry.mood;
      headerRow.appendChild(moodBadge);

      card.appendChild(headerRow);

      // 2. Safe Plain-Text Content Preview
      const contentEl = document.createElement('div');
      contentEl.className = 'reflect-archive-body';
      contentEl.textContent = entry.content; // Safe plain text insertion
      card.appendChild(contentEl);

      // 3. Actions Row: Read / Collapse, Edit, Delete
      const actionsRow = document.createElement('div');
      actionsRow.className = 'reflect-archive-actions';

      // Read Full Entry toggle
      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'btn btn-sm btn-subtle btn-read-archive';
      readBtn.textContent = 'Read Full Entry';
      readBtn.addEventListener('click', () => {
        const isExpanded = card.classList.toggle('is-expanded');
        readBtn.textContent = isExpanded ? 'Collapse' : 'Read Full Entry';
      });
      actionsRow.appendChild(readBtn);

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn btn-sm btn-outline btn-edit-archive';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => {
        const todayStr = formatDateKey(new Date());
        setEditorToDate(entry.dateKey, entry.dateKey !== todayStr);
        const editorCard = document.querySelector('.reflect-editor-card');
        if (editorCard) {
          editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      actionsRow.appendChild(editBtn);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm btn-danger-subtle btn-delete-archive';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        if (typeof DaybloomSettings !== 'undefined' && !DaybloomSettings.shouldConfirmDelete()) {
          deleteEntry(entry.id);
        } else {
          const confirmed = window.confirm(`Are you sure you want to delete your reflection for ${formatFriendlyDate(entry.dateKey)}?`);
          if (confirmed) {
            deleteEntry(entry.id);
          }
        }
      });
      actionsRow.appendChild(deleteBtn);

      card.appendChild(actionsRow);
      listContainer.appendChild(card);
    });
  }

  /**
   * Deletes an entry by ID.
   */
  function deleteEntry(entryId) {
    const targetEntry = entries.find(e => e.id === entryId);
    if (!targetEntry) return;

    const deletedDate = targetEntry.dateKey;
    entries = entries.filter(e => e.id !== entryId);

    const success = saveEntries();
    if (!success) {
      alert('Could not delete entry: data protection active.');
      return;
    }

    // If active in editor, reset editor to clean state
    if (editorState.targetDate === deletedDate) {
      const todayStr = formatDateKey(new Date());
      setEditorToDate(todayStr, false);
    }

    render();
  }

  return {
    init,
    render,
    getEntries: () => entries,
    setEntries: (newEntries) => {
      entries = newEntries;
      saveEntries();
      render();
    },
    selectDate,
    selectMood,
    saveEntryFromEditor,
    deleteEntry,
    returnToToday,
    getRolling30Dates,
    getEditorState: () => ({ ...editorState }),
    isStorageCorrupted: () => isStorageCorrupted
  };
})();

if (typeof window !== 'undefined') {
  window.DaybloomReflect = DaybloomReflect;
}
