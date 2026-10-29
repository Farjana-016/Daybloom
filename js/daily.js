/**
 * Daybloom Daily Task Manager
 * --------------------------------------------------------------------------
 * Handles task creation, completion toggling, inline editing, rescheduling,
 * overdue calculation, and localStorage persistence for personal daily tasks.
 *
 * All Daily task data is stored separately under 'daybloom_daily_tasks'.
 */

const DaybloomDaily = (() => {
  // Dedicated localStorage key for Daily tasks (completely isolated from Scholar)
  const STORAGE_KEY = 'daybloom_daily_tasks';

  // In-memory task list and state
  let tasks = [];
  let currentFilter = 'all'; // 'all' | 'active' | 'completed'
  let editingTaskId = null;  // ID of the task currently being edited

  /**
   * Initializes the Daily task module.
   */
  function init() {
    loadTasks();
    bindFormEvents();
    bindFilterEvents();
    render();
  }

  /**
   * Loads tasks from localStorage.
   */
  function loadTasks() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      tasks = stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.warn('DaybloomDaily: Error loading tasks from localStorage', err);
      tasks = [];
    }
  }

  /**
   * Persists tasks array to localStorage.
   */
  function saveTasks() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (err) {
      console.error('DaybloomDaily: Error saving tasks to localStorage', err);
    }
  }

  /**
   * Determines if an incomplete task is overdue.
   * Requirement 5 & 6:
   * - Incomplete tasks whose deadline has passed are marked overdue with red styling.
   * - If a due time exists: overdue once that exact date and time passes.
   * - If only a due date exists: overdue after that calendar date has ended (i.e. past 23:59:59).
   * - Completed tasks are NEVER overdue.
   *
   * @param {Object} task
   * @returns {boolean}
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
      // Due date and time specified (e.g. "2026-10-29" and "14:30")
      const [year, month, day] = task.dueDate.split('-').map(Number);
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      const deadline = new Date(year, month - 1, day, hours, minutes, 0, 0);
      return now > deadline;
    } else {
      // Date only: overdue after that calendar date has ended (end of day 23:59:59.999)
      const [year, month, day] = task.dueDate.split('-').map(Number);
      const endOfCalendarDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      return now > endOfCalendarDay;
    }
  }

  /**
   * Formats due date & time into a readable string.
   * Examples: "Today", "Today, 4:00 PM", "Tomorrow", "Oct 30", "Oct 28, 9:00 AM"
   */
  function formatDeadline(dueDate, dueTime) {
    if (!dueDate) return '';

    const [year, month, day] = dueDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    let dateText = '';
    if (dueDate === todayStr) {
      dateText = 'Today';
    } else if (dueDate === tomorrowStr) {
      dateText = 'Tomorrow';
    } else if (dueDate === yesterdayStr) {
      dateText = 'Yesterday';
    } else {
      dateText = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    if (dueTime) {
      // Format 24h "14:30" into "2:30 PM"
      const [hours, minutes] = dueTime.split(':').map(Number);
      const tempDate = new Date();
      tempDate.setHours(hours, minutes, 0, 0);
      const timeText = tempDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${dateText}, ${timeText}`;
    }

    return dateText;
  }

  /**
   * Adds a new task with validation.
   */
  function addTask(title, dueDate, dueTime) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      return { success: false, error: 'Please enter a task title.' };
    }
    if (!dueDate) {
      return { success: false, error: 'Please select a due date.' };
    }

    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      title: trimmedTitle,
      dueDate: dueDate,
      dueTime: dueTime ? dueTime : null,
      completed: false,
      createdAt: Date.now()
    };

    tasks.unshift(newTask); // Add to the top of the list
    saveTasks();
    render();
    return { success: true };
  }

  /**
   * Toggles completion status of a task.
   */
  function toggleTask(taskId) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      task.completed = !task.completed;
      saveTasks();
      render();
    }
  }

  /**
   * Deletes a task by ID.
   */
  function deleteTask(taskId) {
    tasks = tasks.filter((t) => t.id !== taskId);
    if (editingTaskId === taskId) {
      editingTaskId = null;
    }
    saveTasks();
    render();
  }

  /**
   * Starts editing a task.
   */
  function startEditing(taskId) {
    editingTaskId = taskId;
    render();
  }

  /**
   * Cancels editing mode.
   */
  function cancelEditing() {
    editingTaskId = null;
    render();
  }

  /**
   * Saves edited/rescheduled task values.
   */
  function saveEditedTask(taskId, newTitle, newDueDate, newDueTime) {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      return { success: false, error: 'Task title cannot be empty.' };
    }
    if (!newDueDate) {
      return { success: false, error: 'Please select a due date.' };
    }

    const task = tasks.find((t) => t.id === taskId);
    if (task) {
      task.title = trimmedTitle;
      task.dueDate = newDueDate;
      task.dueTime = newDueTime ? newDueTime : null;
      editingTaskId = null;
      saveTasks();
      render();
      return { success: true };
    }
    return { success: false, error: 'Task not found.' };
  }

  /**
   * Sets filter ('all' | 'active' | 'completed').
   */
  function setFilter(filter) {
    currentFilter = filter;
    render();
  }

  /**
   * Binds the new task form submit event.
   */
  function bindFormEvents() {
    const form = document.getElementById('daily-task-form');
    const titleInput = document.getElementById('task-title-input');
    const dateInput = document.getElementById('task-date-input');
    const timeInput = document.getElementById('task-time-input');
    const errorMsg = document.getElementById('task-form-error');

    if (!form) return;

    // Default the date input to today
    const today = new Date();
    const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (dateInput && !dateInput.value) {
      dateInput.value = todayFormatted;
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (errorMsg) errorMsg.textContent = '';

      const title = titleInput ? titleInput.value : '';
      const dueDate = dateInput ? dateInput.value : '';
      const dueTime = timeInput ? timeInput.value : '';

      const res = addTask(title, dueDate, dueTime);
      if (res.success) {
        if (titleInput) titleInput.value = '';
        if (timeInput) timeInput.value = '';
        if (errorMsg) errorMsg.textContent = '';
      } else {
        if (errorMsg) errorMsg.textContent = res.error;
      }
    });
  }

  /**
   * Binds filter tab clicks.
   */
  function bindFilterEvents() {
    const filterButtons = document.querySelectorAll('.task-filter-btn');
    filterButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-filter');
        setFilter(filter);
      });
    });
  }

  /**
   * Renders the task list, filters, and counter.
   */
  function render() {
    const listContainer = document.getElementById('daily-task-list');
    const activeCounter = document.getElementById('daily-active-count');
    const filterButtons = document.querySelectorAll('.task-filter-btn');

    if (!listContainer) return;

    // 1. Update filter buttons active styling
    filterButtons.forEach((btn) => {
      const match = btn.getAttribute('data-filter') === currentFilter;
      btn.classList.toggle('active', match);
    });

    // 2. Compute counts
    const activeTasksCount = tasks.filter((t) => !t.completed).length;
    if (activeCounter) {
      activeCounter.textContent = `${activeTasksCount} active`;
    }

    // 3. Filter tasks
    let filteredTasks = tasks;
    if (currentFilter === 'active') {
      filteredTasks = tasks.filter((t) => !t.completed);
    } else if (currentFilter === 'completed') {
      filteredTasks = tasks.filter((t) => t.completed);
    }

    // 4. Handle Empty State
    if (filteredTasks.length === 0) {
      listContainer.innerHTML = `
        <div class="task-empty-card">
          <div class="empty-icon-wrap" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h3 class="empty-title">${currentFilter === 'completed' ? 'No completed tasks yet' : 'No tasks to display'}</h3>
          <p class="empty-subtitle">${currentFilter === 'completed' ? 'Tasks you mark as done will appear here.' : 'Add your first task above to organize your day.'}</p>
        </div>
      `;
      return;
    }

    // 5. Render Task Items
    listContainer.innerHTML = '';
    filteredTasks.forEach((task) => {
      const isOverdue = isTaskOverdue(task);
      const isEditing = editingTaskId === task.id;

      const itemCard = document.createElement('div');
      itemCard.className = `task-card ${task.completed ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`;
      itemCard.setAttribute('data-id', task.id);

      if (isEditing) {
        // Render Inline Edit / Reschedule Form
        itemCard.innerHTML = `
          <form class="task-edit-form" data-edit-id="${task.id}">
            <div class="edit-inputs-row">
              <input type="text" class="input-text edit-title-input" value="${escapeHtml(task.title)}" placeholder="Task title" required />
              <input type="date" class="input-date edit-date-input" value="${task.dueDate}" required />
              <input type="time" class="input-time edit-time-input" value="${task.dueTime || ''}" />
            </div>
            <div class="edit-error-msg" style="color: var(--accent-danger); font-size: var(--font-size-xs); display: none;"></div>
            <div class="edit-actions-row">
              <button type="submit" class="btn btn-sm btn-primary">Save Changes</button>
              <button type="button" class="btn btn-sm btn-subtle btn-cancel-edit">Cancel</button>
            </div>
          </form>
        `;

        // Bind Save and Cancel
        const editForm = itemCard.querySelector('.task-edit-form');
        const cancelBtn = itemCard.querySelector('.btn-cancel-edit');
        const editError = itemCard.querySelector('.edit-error-msg');

        editForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const newTitle = editForm.querySelector('.edit-title-input').value;
          const newDueDate = editForm.querySelector('.edit-date-input').value;
          const newDueTime = editForm.querySelector('.edit-time-input').value;

          const res = saveEditedTask(task.id, newTitle, newDueDate, newDueTime);
          if (!res.success && editError) {
            editError.textContent = res.error;
            editError.style.display = 'block';
          }
        });

        cancelBtn.addEventListener('click', () => {
          cancelEditing();
        });

      } else {
        // Normal Task Display
        const deadlineText = formatDeadline(task.dueDate, task.dueTime);

        itemCard.innerHTML = `
          <button class="task-checkbox ${task.completed ? 'checked' : ''}" aria-label="Mark task '${escapeHtml(task.title)}' as ${task.completed ? 'incomplete' : 'completed'}">
            ${task.completed ? `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ` : ''}
          </button>

          <div class="task-details">
            <span class="task-title">${escapeHtml(task.title)}</span>
            <div class="task-meta-row">
              <span class="task-due-badge ${isOverdue ? 'overdue-text' : ''}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                <span>${deadlineText}</span>
              </span>

              ${isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
              ${task.completed ? '<span class="badge badge-completed">Completed</span>' : ''}
            </div>
          </div>

          <div class="task-actions">
            <!-- Edit / Reschedule Button -->
            <button class="btn-action btn-edit" title="Edit and Reschedule task" aria-label="Edit and Reschedule task">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span class="action-label">Edit</span>
            </button>

            <!-- Delete Button -->
            <button class="btn-action btn-danger-action btn-delete" title="Delete task" aria-label="Delete task">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        `;

        // Bind checkbox click
        itemCard.querySelector('.task-checkbox').addEventListener('click', () => {
          toggleTask(task.id);
        });

        // Bind Edit button click
        itemCard.querySelector('.btn-edit').addEventListener('click', () => {
          startEditing(task.id);
        });

        // Bind Delete button click
        itemCard.querySelector('.btn-delete').addEventListener('click', () => {
          deleteTask(task.id);
        });
      }

      listContainer.appendChild(itemCard);
    });
  }

  /**
   * Basic string escaping to prevent XSS.
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    init,
    addTask,
    toggleTask,
    deleteTask,
    startEditing,
    saveEditedTask,
    cancelEditing,
    setFilter,
    isTaskOverdue,
    getTasks: () => tasks
  };
})();
