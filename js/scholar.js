/**
 * Daybloom Scholar: Academic Task & Calendar Manager
 * --------------------------------------------------------------------------
 * Features a monthly calendar grid (Sunday–Saturday order) with category indicators,
 * date-selection agenda view, distinction between event dates and submission
 * deadlines, full CRUD operations, overdue tracking, dedicated "All Academic Tasks"
 * list with status filters (All, Upcoming, Completed, Overdue), category synchronization,
 * and isolated localStorage persistence.
 *
 * Dedicated storage key: 'daybloom_scholar_tasks'
 */

const DaybloomScholar = (() => {
  const STORAGE_KEY = 'daybloom_scholar_tasks';

  // The 6 required academic categories
  const CATEGORIES = [
    'Exams',
    'Tests',
    'Records',
    'Assignments',
    'Skill Building',
    'Projects'
  ];

  // Weekday abbreviations starting Sunday (Sunday–Saturday order)
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // State
  let tasks = [];
  let viewingDate = new Date();     // Current viewing month & year
  let selectedDateStr = null;       // Active selected date "YYYY-MM-DD"
  let activeCategoryFilter = 'all'; // 'all' | category name
  let allTasksStatusFilter = 'all'; // 'all' | 'upcoming' | 'completed' | 'overdue'
  let editingTaskId = null;

  /**
   * Initializes the Scholar academic module.
   */
  function init() {
    loadTasks();

    // Default selected date to today's YYYY-MM-DD
    const today = new Date();
    selectedDateStr = formatDateKey(today);

    bindNavigationEvents();
    bindEditorEvents();
    bindCategoryFilters();
    bindAllTasksEvents();

    render();
  }

  /**
   * Loads tasks from localStorage.
   */
  function loadTasks() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      tasks = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(tasks)) tasks = [];
    } catch (err) {
      console.warn('DaybloomScholar: Error reading localStorage, resetting to empty', err);
      tasks = [];
    }
  }

  /**
   * Saves tasks to localStorage under 'daybloom_scholar_tasks'.
   */
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('DaybloomScholar: Error saving tasks to localStorage', err);
    }
  }

  /**
   * Formats a Date object into "YYYY-MM-DD" string.
   */
  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Determines if an incomplete task is overdue.
   * Requirement:
   * - Incomplete tasks whose deadline/event date has passed are marked overdue.
   * - With time: overdue once that exact timestamp passes.
   * - Without time: overdue after that calendar date ends (past 23:59:59.999).
   * - Completed tasks are NEVER overdue.
   */
  function isTaskOverdue(task) {
    if (task.completed) {
      return false;
    }
    if (!task.dueDate) {
      return false;
    }

    const now = new Date();

    if (task.dueTime) {
      const [year, month, day] = task.dueDate.split('-').map(Number);
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      const deadline = new Date(year, month - 1, day, hours, minutes, 0, 0);
      return now > deadline;
    } else {
      const [year, month, day] = task.dueDate.split('-').map(Number);
      const endOfCalendarDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      return now > endOfCalendarDay;
    }
  }

  /**
   * Formats deadline/event date into friendly display string for single-day agenda.
   */
  function formatDeadlineDisplay(dueDate, dueTime, dateType) {
    if (!dueDate) return '';

    const [year, month, day] = dueDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const today = new Date();
    const todayStr = formatDateKey(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDateKey(tomorrow);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = formatDateKey(yesterday);

    let dateText = '';
    if (dueDate === todayStr) {
      dateText = 'Today';
    } else if (dueDate === tomorrowStr) {
      dateText = 'Tomorrow';
    } else if (dueDate === yesterdayStr) {
      dateText = 'Yesterday';
    } else {
      dateText = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    let timeText = '';
    if (dueTime) {
      const [h, m] = dueTime.split(':').map(Number);
      const tempDate = new Date();
      tempDate.setHours(h, m, 0, 0);
      timeText = tempDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    const prefix = dateType === 'event' ? 'Event: ' : 'Due: ';
    return timeText ? `${prefix}${dateText} at ${timeText}` : `${prefix}${dateText}`;
  }

  /**
   * Formats a task's full date and optional time for cards in "All Academic Tasks".
   * E.g. "Fri, Oct 30, 2026 at 10:00 AM" or "Tomorrow at 5:00 PM".
   */
  function formatFullDateDisplay(dueDate, dueTime, dateType) {
    if (!dueDate) return '';

    const [year, month, day] = dueDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const today = new Date();
    const todayStr = formatDateKey(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = formatDateKey(tomorrow);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = formatDateKey(yesterday);

    let dateText = '';
    if (dueDate === todayStr) {
      dateText = 'Today';
    } else if (dueDate === tomorrowStr) {
      dateText = 'Tomorrow';
    } else if (dueDate === yesterdayStr) {
      dateText = 'Yesterday';
    } else {
      dateText = dateObj.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    let timeText = '';
    if (dueTime) {
      const [h, m] = dueTime.split(':').map(Number);
      const tempDate = new Date();
      tempDate.setHours(h, m, 0, 0);
      timeText = tempDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    const prefix = dateType === 'event' ? 'Event: ' : 'Due: ';
    return timeText ? `${prefix}${dateText} at ${timeText}` : `${prefix}${dateText}`;
  }

  /**
   * Sorts tasks for the "All Academic Tasks" panel:
   * 1. Incomplete overdue tasks first (urgent, past deadline).
   * 2. Incomplete upcoming tasks next (nearest upcoming date/time first).
   * 3. Completed tasks last (distinguishable, sorted by date).
   */
  function sortScholarTasks(taskList) {
    return [...taskList].sort((a, b) => {
      // 1. Completion grouping: incomplete before completed
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      // 2. When both are incomplete:
      if (!a.completed) {
        const aOverdue = isTaskOverdue(a);
        const bOverdue = isTaskOverdue(b);
        if (aOverdue !== bOverdue) {
          return aOverdue ? -1 : 1; // Overdue tasks first
        }
        // Both overdue or both upcoming: sort ascending by date
        const dateCmp = (a.dueDate || '').localeCompare(b.dueDate || '');
        if (dateCmp !== 0) return dateCmp;
        // Same date: sort by dueTime ascending
        const aTime = a.dueTime || '23:59';
        const bTime = b.dueTime || '23:59';
        return aTime.localeCompare(bTime);
      }

      // 3. When both are completed:
      const dateCmp = (a.dueDate || '').localeCompare(b.dueDate || '');
      if (dateCmp !== 0) return dateCmp;
      const aTime = a.dueTime || '23:59';
      const bTime = b.dueTime || '23:59';
      return aTime.localeCompare(bTime);
    });
  }

  /**
   * Opens the task creation or edit modal/form.
   */
  function openTaskEditor(taskId = null) {
    editingTaskId = taskId;

    const editorCard = document.getElementById('scholar-task-editor');
    const editorHeading = document.getElementById('scholar-editor-heading');
    const titleInput = document.getElementById('scholar-input-title');
    const categorySelect = document.getElementById('scholar-select-category');
    const dateTypeEvent = document.getElementById('scholar-type-event');
    const dateTypeDeadline = document.getElementById('scholar-type-deadline');
    const courseInput = document.getElementById('scholar-input-course');
    const dateInput = document.getElementById('scholar-input-date');
    const timeInput = document.getElementById('scholar-input-time');
    const notesInput = document.getElementById('scholar-input-notes');
    const errorBox = document.getElementById('scholar-editor-error');

    if (!editorCard) return;

    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }

    if (taskId) {
      // Editing existing task
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      if (editorHeading) editorHeading.textContent = 'Edit Academic Task';
      if (titleInput) titleInput.value = task.title || '';
      if (categorySelect) categorySelect.value = task.category || CATEGORIES[0];

      if (task.dateType === 'event') {
        if (dateTypeEvent) dateTypeEvent.checked = true;
      } else {
        if (dateTypeDeadline) dateTypeDeadline.checked = true;
      }

      if (courseInput) courseInput.value = task.course || '';
      if (dateInput) dateInput.value = task.dueDate || selectedDateStr;
      if (timeInput) timeInput.value = task.dueTime || '';
      if (notesInput) notesInput.value = task.notes || '';
    } else {
      // Creating new task
      if (editorHeading) editorHeading.textContent = 'Add Academic Task';
      if (titleInput) titleInput.value = '';
      if (categorySelect) categorySelect.value = CATEGORIES[0];
      if (dateTypeEvent) dateTypeEvent.checked = true; // default
      if (courseInput) courseInput.value = '';
      if (dateInput) dateInput.value = selectedDateStr || formatDateKey(new Date());
      if (timeInput) timeInput.value = '';
      if (notesInput) notesInput.value = '';
    }

    editorCard.style.display = 'block';
    if (titleInput) titleInput.focus();
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Closes the task editor.
   */
  function closeTaskEditor() {
    const editorCard = document.getElementById('scholar-task-editor');
    const errorBox = document.getElementById('scholar-editor-error');
    editingTaskId = null;

    if (editorCard) editorCard.style.display = 'none';
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
  }

  /**
   * Saves task from editor inputs.
   */
  function saveTaskFromEditor() {
    const titleInput = document.getElementById('scholar-input-title');
    const categorySelect = document.getElementById('scholar-select-category');
    const dateTypeEvent = document.getElementById('scholar-type-event');
    const courseInput = document.getElementById('scholar-input-course');
    const dateInput = document.getElementById('scholar-input-date');
    const timeInput = document.getElementById('scholar-input-time');
    const notesInput = document.getElementById('scholar-input-notes');
    const errorBox = document.getElementById('scholar-editor-error');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
      if (errorBox) {
        errorBox.textContent = 'Please enter a task title.';
        errorBox.style.display = 'block';
      }
      if (titleInput) titleInput.focus();
      return;
    }

    const dueDate = dateInput ? dateInput.value : '';
    if (!dueDate) {
      if (errorBox) {
        errorBox.textContent = 'Please choose a date.';
        errorBox.style.display = 'block';
      }
      return;
    }

    const category = categorySelect ? categorySelect.value : CATEGORIES[0];
    const dateType = (dateTypeEvent && dateTypeEvent.checked) ? 'event' : 'deadline';
    const course = courseInput ? courseInput.value.trim() : '';
    const dueTime = timeInput ? timeInput.value : '';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (editingTaskId) {
      // Update existing task
      const taskIndex = tasks.findIndex(t => t.id === editingTaskId);
      if (taskIndex !== -1) {
        tasks[taskIndex] = {
          ...tasks[taskIndex],
          title,
          category,
          dateType,
          course,
          dueDate,
          dueTime,
          notes,
          updatedAt: new Date().toISOString()
        };
      }
    } else {
      // Create new task
      const newTask = {
        id: 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        title,
        category,
        dateType,
        course,
        dueDate,
        dueTime,
        notes,
        completed: false,
        createdAt: new Date().toISOString()
      };
      tasks.push(newTask);
    }

    saveTasks();
    closeTaskEditor();

    // Select the task's date so it's immediately visible in agenda
    selectedDateStr = dueDate;
    const [y, m] = dueDate.split('-').map(Number);
    viewingDate = new Date(y, m - 1, 1);

    render();
  }

  /**
   * Toggles completion status of a task.
   */
  function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;

    saveTasks();
    render();
  }

  /**
   * Deletes a task after confirmation.
   */
  function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const confirmMsg = `Are you sure you want to delete "${task.title}"?`;
    if (window.confirm(confirmMsg)) {
      tasks = tasks.filter(t => t.id !== taskId);
      saveTasks();
      render();
    }
  }

  /**
   * Changes month navigation (+1 for next, -1 for previous).
   */
  function changeMonth(delta) {
    viewingDate.setMonth(viewingDate.getMonth() + delta);
    renderCalendar();
  }

  /**
   * Jumps viewing date to current month & selects today.
   */
  function jumpToToday() {
    viewingDate = new Date();
    selectedDateStr = formatDateKey(new Date());
    render();
  }

  /**
   * Binds month navigation and today button events.
   */
  function bindNavigationEvents() {
    const prevBtn = document.getElementById('scholar-prev-month');
    const nextBtn = document.getElementById('scholar-next-month');
    const todayBtn = document.getElementById('scholar-today-btn');
    const addTaskBtn = document.getElementById('btn-add-scholar-task');

    if (prevBtn) prevBtn.addEventListener('click', () => changeMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', () => jumpToToday());
    if (addTaskBtn) addTaskBtn.addEventListener('click', () => openTaskEditor());
  }

  /**
   * Binds editor save, cancel, and category default-type listeners.
   */
  function bindEditorEvents() {
    const saveBtn = document.getElementById('scholar-btn-save');
    const cancelBtn = document.getElementById('scholar-btn-cancel');
    const categorySelect = document.getElementById('scholar-select-category');
    const dateTypeEvent = document.getElementById('scholar-type-event');
    const dateTypeDeadline = document.getElementById('scholar-type-deadline');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveTaskFromEditor();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeTaskEditor();
      });
    }

    // Category change updates default dateType sensibly
    if (categorySelect) {
      categorySelect.addEventListener('change', () => {
        const cat = categorySelect.value;
        if (cat === 'Exams' || cat === 'Tests') {
          if (dateTypeEvent) dateTypeEvent.checked = true;
        } else if (cat === 'Assignments' || cat === 'Records') {
          if (dateTypeDeadline) dateTypeDeadline.checked = true;
        }
      });
    }
  }

  /**
   * Binds category filter buttons on calendar header.
   */
  function bindCategoryFilters() {
    const filterContainer = document.getElementById('scholar-category-filters');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.cat-filter-btn');
      if (!btn) return;

      activeCategoryFilter = btn.getAttribute('data-category') || 'all';
      render();
    });
  }

  /**
   * Binds events for the "All Academic Tasks" panel:
   * - Status filter tab clicks (All, Upcoming, Completed, Overdue)
   * - Category filter dropdown changes
   * - Clear category filter chip click
   */
  function bindAllTasksEvents() {
    // Status filter buttons
    const statusGroup = document.querySelector('.scholar-status-filter-group');
    if (statusGroup) {
      statusGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.scholar-status-btn');
        if (!btn) return;
        const status = btn.getAttribute('data-status');
        if (status && status !== allTasksStatusFilter) {
          allTasksStatusFilter = status;
          renderAllTasks();
        }
      });
    }

    // Category dropdown selector
    const catSelect = document.getElementById('scholar-all-cat-select');
    if (catSelect) {
      catSelect.addEventListener('change', () => {
        activeCategoryFilter = catSelect.value || 'all';
        render();
      });
    }

    // Clear category filter chip
    const clearChip = document.getElementById('scholar-clear-category-filter');
    if (clearChip) {
      clearChip.addEventListener('click', () => {
        activeCategoryFilter = 'all';
        render();
      });
    }
  }

  /**
   * Full render of Calendar, Agenda, and All Academic Tasks.
   */
  function render() {
    renderCalendar();
    renderAgenda();
    renderAllTasks();
  }

  /**
   * Renders the 7-column monthly calendar grid (Sunday–Saturday order).
   * Sunday is column 0, Monday column 1, ..., Saturday column 6.
   */
  function renderCalendar() {
    const monthTitle = document.getElementById('scholar-month-title');
    const calendarGrid = document.getElementById('scholar-calendar-grid');

    if (!calendarGrid) return;

    const year = viewingDate.getFullYear();
    const month = viewingDate.getMonth();

    // 1. Update Month Title (e.g. "October 2026")
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    if (monthTitle) {
      monthTitle.textContent = `${monthNames[month]} ${year}`;
    }

    // 2. Compute calendar math (Sunday-Saturday order)
    const firstDay = new Date(year, month, 1);
    const leadingEmptySlots = firstDay.getDay(); // 0 for Sunday, 1 for Monday, etc.
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = formatDateKey(new Date());

    calendarGrid.innerHTML = '';

    // Render Weekday Column Headers
    const headerRow = document.createElement('div');
    headerRow.className = 'calendar-weekdays-row';
    WEEKDAYS.forEach(dayName => {
      const col = document.createElement('div');
      col.className = 'calendar-weekday-col';
      col.textContent = dayName;
      headerRow.appendChild(col);
    });
    calendarGrid.appendChild(headerRow);

    // Days grid wrapper
    const daysWrapper = document.createElement('div');
    daysWrapper.className = 'calendar-days-grid';

    // A. Leading empty/previous month slots
    for (let i = leadingEmptySlots - 1; i >= 0; i--) {
      const prevDateNum = daysInPrevMonth - i;
      const prevCell = document.createElement('div');
      prevCell.className = 'calendar-day-cell is-other-month';
      prevCell.innerHTML = `<span class="day-number">${prevDateNum}</span>`;
      daysWrapper.appendChild(prevCell);
    }

    // B. Days of the current viewing month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const isToday = dStr === todayStr;
      const isSelected = dStr === selectedDateStr;

      // Find tasks on this date (filtered by active category if any)
      const dayTasks = tasks.filter(t => t.dueDate === dStr && (activeCategoryFilter === 'all' || t.category === activeCategoryFilter));
      const hasOverdue = dayTasks.some(t => isTaskOverdue(t));

      const dayCell = document.createElement('button');
      dayCell.type = 'button';
      dayCell.className = `calendar-day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${hasOverdue ? 'has-overdue' : ''}`;
      dayCell.setAttribute('data-date', dStr);
      dayCell.setAttribute('aria-label', `${monthNames[month]} ${dayNum}, ${year} (${dayTasks.length} tasks)`);

      // Category dots for tasks on this date
      let dotsHtml = '';
      if (dayTasks.length > 0) {
        // Collect unique categories on this day
        const uniqueCats = Array.from(new Set(dayTasks.map(t => t.category))).slice(0, 4);
        dotsHtml = `
          <div class="calendar-task-dots" aria-hidden="true">
            ${uniqueCats.map(cat => `<span class="cat-dot cat-${toClassSlug(cat)}" title="${cat}"></span>`).join('')}
            ${dayTasks.length > 4 ? '<span class="cat-dot-more">+</span>' : ''}
          </div>
        `;
      }

      dayCell.innerHTML = `
        <span class="day-number">${dayNum}</span>
        ${dotsHtml}
      `;

      dayCell.addEventListener('click', () => {
        selectedDateStr = dStr;
        renderAgenda();
        // Update selection highlight on cells
        const allCells = calendarGrid.querySelectorAll('.calendar-day-cell');
        allCells.forEach(c => c.classList.remove('is-selected'));
        dayCell.classList.add('is-selected');
      });

      daysWrapper.appendChild(dayCell);
    }

    // C. Trailing empty/next month slots to fill the 7-day grid row
    const totalCurrentSlots = leadingEmptySlots + daysInMonth;
    const trailingSlots = (7 - (totalCurrentSlots % 7)) % 7;
    for (let nextDay = 1; nextDay <= trailingSlots; nextDay++) {
      const nextCell = document.createElement('div');
      nextCell.className = 'calendar-day-cell is-other-month';
      nextCell.innerHTML = `<span class="day-number">${nextDay}</span>`;
      daysWrapper.appendChild(nextCell);
    }

    calendarGrid.appendChild(daysWrapper);

    // Update Category Filter Buttons count badges
    updateCategoryFilterBadges();
  }

  /**
   * Renders the Agenda / Selected Date task list pane.
   */
  function renderAgenda() {
    const dateHeading = document.getElementById('scholar-selected-date-title');
    const taskCountBadge = document.getElementById('scholar-date-count-badge');
    const taskListContainer = document.getElementById('scholar-agenda-tasks');

    if (!taskListContainer) return;

    // 1. Format date heading
    if (selectedDateStr) {
      const [y, m, d] = selectedDateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      if (dateHeading) dateHeading.textContent = dateObj.toLocaleDateString(undefined, options);
    } else {
      if (dateHeading) dateHeading.textContent = 'All Tasks';
    }

    // 2. Filter tasks for selected date & active category
    let dateTasks = tasks.filter(t => t.dueDate === selectedDateStr);
    if (activeCategoryFilter !== 'all') {
      dateTasks = dateTasks.filter(t => t.category === activeCategoryFilter);
    }

    // 3. Update count badge
    if (taskCountBadge) {
      taskCountBadge.textContent = `${dateTasks.length} ${dateTasks.length === 1 ? 'task' : 'tasks'}`;
    }

    // 4. Handle empty state
    if (dateTasks.length === 0) {
      taskListContainer.innerHTML = `
        <div class="task-empty-card" style="padding: var(--spacing-8) var(--spacing-4);">
          <div class="empty-icon-wrap" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/>
              <path d="M22 10v6"/>
              <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>
            </svg>
          </div>
          <h4 class="empty-title">No academic tasks</h4>
          <p class="empty-subtitle">No tasks scheduled for this date. Click "+ Add Task" to schedule exams, assignments, or study milestones.</p>
        </div>
      `;
      return;
    }

    // 5. Render academic task cards
    taskListContainer.innerHTML = '';
    dateTasks.forEach(task => {
      const isOverdue = isTaskOverdue(task);
      const isEvent = task.dateType === 'event';
      const deadlineText = formatDeadlineDisplay(task.dueDate, task.dueTime, task.dateType);

      const card = document.createElement('div');
      card.className = `scholar-task-card ${task.completed ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`;
      card.setAttribute('data-id', task.id);

      card.innerHTML = `
        <div class="scholar-task-left">
          <button type="button" class="task-checkbox ${task.completed ? 'checked' : ''}" aria-label="Mark task '${escapeHtml(task.title)}' as ${task.completed ? 'incomplete' : 'completed'}">
            ${task.completed ? `
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ` : ''}
          </button>
        </div>

        <div class="scholar-task-center">
          <div class="scholar-task-header-row">
            <span class="badge cat-badge cat-badge-${toClassSlug(task.category)}">${escapeHtml(task.category)}</span>
            <span class="badge date-type-badge ${isEvent ? 'type-event' : 'type-deadline'}">
              ${isEvent ? 'Event' : 'Deadline'}
            </span>
            ${task.course ? `<span class="badge badge-course">${escapeHtml(task.course)}</span>` : ''}
            ${isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
            ${task.completed ? '<span class="badge badge-completed">Completed</span>' : ''}
          </div>

          <h5 class="scholar-task-title">${escapeHtml(task.title)}</h5>

          <div class="scholar-task-meta-row">
            <span class="task-time-pill ${isOverdue ? 'overdue-text' : ''}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${deadlineText}</span>
            </span>

            ${task.notes ? `<span class="scholar-notes-hint" title="${escapeHtml(task.notes)}">• Notes available</span>` : ''}
          </div>

          ${task.notes ? `<p class="scholar-task-notes">${escapeHtml(task.notes)}</p>` : ''}
        </div>

        <div class="scholar-task-actions">
          <button type="button" class="btn-action btn-edit-scholar-task" title="Edit task" aria-label="Edit task '${escapeHtml(task.title)}'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <button type="button" class="btn-action btn-danger-action btn-delete-scholar-task" title="Delete task" aria-label="Delete task '${escapeHtml(task.title)}'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      // Checkbox event
      const chk = card.querySelector('.task-checkbox');
      chk.addEventListener('click', () => toggleTaskComplete(task.id));

      // Edit event
      const editBtn = card.querySelector('.btn-edit-scholar-task');
      editBtn.addEventListener('click', () => openTaskEditor(task.id));

      // Delete event
      const deleteBtn = card.querySelector('.btn-delete-scholar-task');
      deleteBtn.addEventListener('click', () => deleteTask(task.id));

      taskListContainer.appendChild(card);
    });
  }

  /**
   * Renders the "All Academic Tasks" panel:
   * - Shows all tasks regardless of calendar date selected.
   * - Computes status filter count badges (All, Upcoming, Completed, Overdue).
   * - Filters by status tab and active category.
   * - Sorts nearest upcoming first with overdue marked and completed distinguishable.
   * - Immediate action handling (complete, edit, delete, jump to calendar date).
   */
  function renderAllTasks() {
    const listContainer = document.getElementById('scholar-all-tasks-list');
    const totalCountBadge = document.getElementById('scholar-all-count-badge');
    const catSelect = document.getElementById('scholar-all-cat-select');
    const filterChipRow = document.getElementById('scholar-active-filter-chip-row');
    const filterChipText = document.getElementById('scholar-filter-chip-text');

    if (!listContainer) return;

    // 1. Synchronize category select dropdown with current activeCategoryFilter
    if (catSelect && catSelect.value !== activeCategoryFilter) {
      catSelect.value = activeCategoryFilter;
    }

    // 2. Synchronize active category chip
    if (filterChipRow && filterChipText) {
      if (activeCategoryFilter !== 'all') {
        filterChipRow.style.display = 'flex';
        filterChipText.textContent = activeCategoryFilter;
      } else {
        filterChipRow.style.display = 'none';
      }
    }

    // 3. Base tasks scoped to current category filter (if active)
    const categoryScopedTasks = activeCategoryFilter === 'all'
      ? tasks
      : tasks.filter(t => t.category === activeCategoryFilter);

    // 4. Compute status counts
    const countAll = categoryScopedTasks.length;
    const countUpcoming = categoryScopedTasks.filter(t => !t.completed && !isTaskOverdue(t)).length;
    const countCompleted = categoryScopedTasks.filter(t => t.completed).length;
    const countOverdue = categoryScopedTasks.filter(t => !t.completed && isTaskOverdue(t)).length;

    // Update count labels in toolbar
    if (totalCountBadge) {
      totalCountBadge.textContent = `${countAll} ${countAll === 1 ? 'task' : 'tasks'}`;
    }
    const cAll = document.getElementById('count-status-all');
    const cUp = document.getElementById('count-status-upcoming');
    const cComp = document.getElementById('count-status-completed');
    const cOvd = document.getElementById('count-status-overdue');
    if (cAll) cAll.textContent = countAll;
    if (cUp) cUp.textContent = countUpcoming;
    if (cComp) cComp.textContent = countCompleted;
    if (cOvd) cOvd.textContent = countOverdue;

    // 5. Update active status tab styling & aria-selected
    const statusButtons = document.querySelectorAll('.scholar-status-btn');
    statusButtons.forEach(btn => {
      const match = btn.getAttribute('data-status') === allTasksStatusFilter;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    // 6. Filter tasks by selected status tab
    let displayTasks = categoryScopedTasks;
    if (allTasksStatusFilter === 'upcoming') {
      displayTasks = displayTasks.filter(t => !t.completed && !isTaskOverdue(t));
    } else if (allTasksStatusFilter === 'completed') {
      displayTasks = displayTasks.filter(t => t.completed);
    } else if (allTasksStatusFilter === 'overdue') {
      displayTasks = displayTasks.filter(t => !t.completed && isTaskOverdue(t));
    }

    // 7. Sort display tasks: nearest upcoming first, overdue top, completed distinguishable
    displayTasks = sortScholarTasks(displayTasks);

    // 8. Render empty state if no matching tasks
    if (displayTasks.length === 0) {
      let emptyMsg = 'No academic tasks scheduled.';
      if (allTasksStatusFilter === 'upcoming') emptyMsg = 'No upcoming tasks. You have no pending deadlines!';
      else if (allTasksStatusFilter === 'completed') emptyMsg = 'No completed tasks yet. Mark tasks finished to see them here.';
      else if (allTasksStatusFilter === 'overdue') emptyMsg = 'No overdue tasks. All deadlines are on track!';

      listContainer.innerHTML = `
        <div class="task-empty-card" style="padding: var(--spacing-8) var(--spacing-4);">
          <div class="empty-icon-wrap" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              <path d="m9 14 2 2 4-4"/>
            </svg>
          </div>
          <h4 class="empty-title">${escapeHtml(emptyMsg)}</h4>
          <p class="empty-subtitle">Use "+ Add Task" in the calendar above to schedule your coursework, exams, or projects.</p>
        </div>
      `;
      return;
    }

    // 9. Render task cards in All Academic Tasks
    listContainer.innerHTML = '';
    displayTasks.forEach(task => {
      const isOverdue = isTaskOverdue(task);
      const isEvent = task.dateType === 'event';
      const deadlineText = formatFullDateDisplay(task.dueDate, task.dueTime, task.dateType);

      const card = document.createElement('div');
      card.className = `scholar-task-card ${task.completed ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`;
      card.setAttribute('data-id', task.id);

      card.innerHTML = `
        <div class="scholar-task-left">
          <button type="button" class="task-checkbox ${task.completed ? 'checked' : ''}" aria-label="Mark task '${escapeHtml(task.title)}' as ${task.completed ? 'incomplete' : 'completed'}">
            ${task.completed ? `
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ` : ''}
          </button>
        </div>

        <div class="scholar-task-center">
          <div class="scholar-task-header-row">
            <span class="badge cat-badge cat-badge-${toClassSlug(task.category)}">${escapeHtml(task.category)}</span>
            <span class="badge date-type-badge ${isEvent ? 'type-event' : 'type-deadline'}">
              ${isEvent ? 'Event' : 'Deadline'}
            </span>
            ${task.course ? `<span class="badge badge-course">${escapeHtml(task.course)}</span>` : ''}
            ${isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
            ${task.completed ? '<span class="badge badge-completed">Completed</span>' : ''}
          </div>

          <h5 class="scholar-task-title">${escapeHtml(task.title)}</h5>

          <div class="scholar-task-meta-row">
            <span class="task-time-pill ${isOverdue ? 'overdue-text' : ''}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${deadlineText}</span>
            </span>

            ${task.notes ? `<span class="scholar-notes-hint" title="${escapeHtml(task.notes)}">• Notes available</span>` : ''}
          </div>

          ${task.notes ? `<p class="scholar-task-notes">${escapeHtml(task.notes)}</p>` : ''}
        </div>

        <div class="scholar-task-actions">
          <button type="button" class="btn-action btn-jump-calendar" title="View on Calendar" aria-label="View '${escapeHtml(task.title)}' on calendar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>

          <button type="button" class="btn-action btn-edit-scholar-task" title="Edit task" aria-label="Edit task '${escapeHtml(task.title)}'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>

          <button type="button" class="btn-action btn-danger-action btn-delete-scholar-task" title="Delete task" aria-label="Delete task '${escapeHtml(task.title)}'">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;

      // Checkbox event
      const chk = card.querySelector('.task-checkbox');
      chk.addEventListener('click', () => toggleTaskComplete(task.id));

      // Jump to calendar event
      const jumpBtn = card.querySelector('.btn-jump-calendar');
      jumpBtn.addEventListener('click', () => {
        if (task.dueDate) {
          const [y, m] = task.dueDate.split('-').map(Number);
          viewingDate = new Date(y, m - 1, 1);
          selectedDateStr = task.dueDate;
          render();
          const calGrid = document.getElementById('scholar-calendar-grid');
          if (calGrid) {
            calGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });

      // Edit event
      const editBtn = card.querySelector('.btn-edit-scholar-task');
      editBtn.addEventListener('click', () => openTaskEditor(task.id));

      // Delete event
      const deleteBtn = card.querySelector('.btn-delete-scholar-task');
      deleteBtn.addEventListener('click', () => deleteTask(task.id));

      listContainer.appendChild(card);
    });
  }

  /**
   * Updates category filter pills with active state and count numbers.
   */
  function updateCategoryFilterBadges() {
    const buttons = document.querySelectorAll('.cat-filter-btn');
    buttons.forEach(btn => {
      const cat = btn.getAttribute('data-category');
      const isMatch = cat === activeCategoryFilter;
      btn.classList.toggle('active', isMatch);
    });

    const catSelect = document.getElementById('scholar-all-cat-select');
    if (catSelect && catSelect.value !== activeCategoryFilter) {
      catSelect.value = activeCategoryFilter;
    }
  }

  /**
   * Slug helper for class names (e.g. "Skill Building" -> "skill-building").
   */
  function toClassSlug(name) {
    if (!name) return 'general';
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /**
   * HTML escape helper.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    init,
    openTaskEditor,
    closeTaskEditor,
    saveTaskFromEditor,
    toggleTaskComplete,
    deleteTask,
    isTaskOverdue,
    changeMonth,
    jumpToToday,
    selectDate: (dStr) => { selectedDateStr = dStr; render(); },
    getTasks: () => tasks,
    setTasks: (newTasks) => { tasks = newTasks; saveTasks(); render(); },
    setStatusFilter: (status) => { allTasksStatusFilter = status; renderAllTasks(); },
    getStatusFilter: () => allTasksStatusFilter,
    getCategoryFilter: () => activeCategoryFilter,
    setCategoryFilter: (cat) => { activeCategoryFilter = cat; render(); }
  };
})();
