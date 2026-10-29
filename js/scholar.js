/**
 * Daybloom Scholar: Academic Task & Calendar Manager
 * --------------------------------------------------------------------------
 * Features a monthly calendar grid (Sunday–Saturday order) with category indicators,
 * date-selection agenda view, distinction between event dates and submission
 * deadlines, full CRUD operations, overdue tracking, and isolated localStorage persistence.
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

  // Weekday abbreviations starting Sunday
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // State
  let tasks = [];
  let viewingDate = new Date(); // Current viewing month & year
  let selectedDateStr = null;   // Active selected date "YYYY-MM-DD"
  let activeCategoryFilter = 'all'; // 'all' | category name
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
   * Formats deadline/event date into friendly display string.
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
      return { success: false, error: 'Please enter a task title.' };
    }

    const dueDate = dateInput ? dateInput.value : '';
    if (!dueDate) {
      if (errorBox) {
        errorBox.textContent = 'Please select a date.';
        errorBox.style.display = 'block';
      }
      if (dateInput) dateInput.focus();
      return { success: false, error: 'Please select a date.' };
    }

    const category = categorySelect ? categorySelect.value : CATEGORIES[0];
    const dateType = (dateTypeEvent && dateTypeEvent.checked) ? 'event' : 'deadline';
    const course = courseInput ? courseInput.value.trim() : '';
    const dueTime = timeInput && timeInput.value ? timeInput.value : null;
    const notes = notesInput ? notesInput.value.trim() : '';

    if (editingTaskId) {
      const task = tasks.find(t => t.id === editingTaskId);
      if (task) {
        task.title = title;
        task.category = category;
        task.dateType = dateType;
        task.course = course;
        task.dueDate = dueDate;
        task.dueTime = dueTime;
        task.notes = notes;
      }
    } else {
      const newTask = {
        id: 'scholar_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        title,
        category,
        dateType,
        course,
        dueDate,
        dueTime,
        notes,
        completed: false,
        createdAt: Date.now()
      };
      tasks.unshift(newTask);
    }

    // Keep selected date aligned with task's due date
    selectedDateStr = dueDate;

    saveTasks();
    closeTaskEditor();
    render();
    return { success: true };
  }

  /**
   * Toggles task completion.
   */
  function toggleTaskComplete(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      saveTasks();
      render();
    }
  }

  /**
   * Deletes a task by ID with confirmation dialog.
   */
  function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${task.title}"?`);
    if (!confirmed) return;

    tasks = tasks.filter(t => t.id !== taskId);
    if (editingTaskId === taskId) {
      closeTaskEditor();
    }
    saveTasks();
    render();
  }

  /**
   * Changes the viewing month by delta (-1 or +1).
   */
  function changeMonth(delta) {
    viewingDate = new Date(viewingDate.getFullYear(), viewingDate.getMonth() + delta, 1);
    renderCalendar();
  }

  /**
   * Jumps calendar to current month and selects today.
   */
  function jumpToToday() {
    const today = new Date();
    viewingDate = new Date(today.getFullYear(), today.getMonth(), 1);
    selectedDateStr = formatDateKey(today);
    render();
  }

  /**
   * Binds calendar header month buttons and editor buttons.
   */
  function bindNavigationEvents() {
    const prevBtn = document.getElementById('scholar-prev-month');
    const nextBtn = document.getElementById('scholar-next-month');
    const todayBtn = document.getElementById('scholar-today-btn');
    const addBtn = document.getElementById('btn-add-scholar-task');

    if (prevBtn) prevBtn.addEventListener('click', () => changeMonth(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => changeMonth(1));
    if (todayBtn) todayBtn.addEventListener('click', jumpToToday);
    if (addBtn) addBtn.addEventListener('click', () => openTaskEditor(null));
  }

  /**
   * Binds editor save and cancel buttons.
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
   * Binds category filter buttons.
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
   * Full render of Calendar and Agenda.
   */
  function render() {
    renderCalendar();
    renderAgenda();
  }

  /**
   * Renders the 7-column monthly calendar grid (Sunday–Saturday order).
   * Correction 1:
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
        render();
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
   * Updates category filter pills with active state and count numbers.
   */
  function updateCategoryFilterBadges() {
    const buttons = document.querySelectorAll('.cat-filter-btn');
    buttons.forEach(btn => {
      const cat = btn.getAttribute('data-category');
      const isMatch = cat === activeCategoryFilter;
      btn.classList.toggle('active', isMatch);
    });
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
    setTasks: (newTasks) => { tasks = newTasks; saveTasks(); render(); }
  };
})();
