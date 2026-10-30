/**
 * Daybloom Daily To-Do Lists Manager
 * --------------------------------------------------------------------------
 * Handles multi-item to-do lists, interactive checklist rows, Enter-key row
 * creation, deadline & overdue tracking, and localStorage persistence.
 *
 * All Daily data is stored under 'daybloom_daily_tasks'.
 */

const DaybloomDaily = (() => {
  const STORAGE_KEY = 'daybloom_daily_tasks';

  // In-memory lists and UI state
  let lists = [];
  let currentFilter = 'all'; // 'all' | 'active' | 'completed'
  let activeEditingListId = null; // null for new list, or list ID when editing

  /**
   * Initializes the Daily module.
   */
  function init() {
    loadAndMigrateData();
    bindToolbarEvents();
    bindEditorEvents();
    render();
  }

  /**
   * Loads lists from localStorage and migrates legacy flat tasks if found.
   */
  function loadAndMigrateData() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        lists = [];
        return;
      }

      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) {
        lists = [];
        return;
      }

      // Check if data is already in multi-item list format (each entry has .items array)
      const isListFormat = parsed.every(entry => entry && Array.isArray(entry.items));
      if (isListFormat) {
        lists = parsed;
        return;
      }

      // Migration: Convert legacy flat tasks into a grouped to-do list
      console.log('DaybloomDaily: Migrating legacy flat tasks into to-do list structure...');
      const migratedItems = parsed.map((oldTask) => ({
        id: oldTask.id || ('item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        text: oldTask.title || 'Untitled item',
        completed: Boolean(oldTask.completed)
      }));

      const firstDeadline = parsed.find(t => t.dueDate);

      lists = [{
        id: 'list_migrated_' + Date.now(),
        title: 'Personal Tasks',
        dueDate: firstDeadline ? firstDeadline.dueDate : null,
        dueTime: firstDeadline ? firstDeadline.dueTime : null,
        items: migratedItems,
        createdAt: Date.now()
      }];

      saveData();
    } catch (err) {
      console.warn('DaybloomDaily: Error reading localStorage, resetting to empty', err);
      lists = [];
    }
  }

  /**
   * Saves lists to localStorage.
   */
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
    } catch (err) {
      console.error('DaybloomDaily: Error saving data to localStorage', err);
    }
  }

  /**
   * Checks if a list is considered completed.
   * A list is completed when it has at least one item and ALL items are completed.
   */
  function isListCompleted(list) {
    if (!list || !Array.isArray(list.items) || list.items.length === 0) {
      return false;
    }
    return list.items.every(item => item.completed);
  }

  /**
   * Checks if an incomplete list is overdue.
   * Requirement 5 & 6:
   * - If a list has no deadline, it cannot be overdue.
   * - Completed lists (all items checked) are NEVER overdue.
   * - If a due time exists: overdue once that exact date and time passes.
   * - If only a due date exists: overdue after that calendar date has ended (past 23:59:59.999).
   *
   * @param {Object} list
   * @returns {boolean}
   */
  function isListOverdue(list) {
    if (isListCompleted(list)) {
      return false;
    }
    if (!list.dueDate) {
      return false;
    }

    const now = new Date();

    if (list.dueTime) {
      // Date and Time provided
      const [year, month, day] = list.dueDate.split('-').map(Number);
      const [hours, minutes] = list.dueTime.split(':').map(Number);
      const deadline = new Date(year, month - 1, day, hours, minutes, 0, 0);
      return now > deadline;
    } else {
      // Date only: overdue after that calendar date ends (23:59:59.999)
      const [year, month, day] = list.dueDate.split('-').map(Number);
      const endOfCalendarDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      return now > endOfCalendarDay;
    }
  }

  /**
   * Formats deadline into friendly text (e.g. "Today", "Tomorrow, 4:00 PM", "Oct 31").
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
      const [hours, minutes] = dueTime.split(':').map(Number);
      const tempDate = new Date();
      tempDate.setHours(hours, minutes, 0, 0);
      const timeText = tempDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${dateText}, ${timeText}`;
    }

    return dateText;
  }

  /**
   * Creates a checklist row DOM element for the editor.
   */
  function createChecklistRowElement(itemText = '', isCompleted = false) {
    const row = document.createElement('div');
    row.className = 'checklist-editor-row';

    row.innerHTML = `
      <button type="button" class="checklist-row-checkbox ${isCompleted ? 'checked' : ''}" aria-label="Toggle item completion" tabindex="-1">
        ${isCompleted ? `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        ` : ''}
      </button>
      <input
        type="text"
        class="checklist-item-input"
        placeholder="Checklist item (press Enter for next)..."
        value="${escapeHtml(itemText)}"
        aria-label="Checklist item"
      />
      <button type="button" class="btn-remove-row" title="Remove item" aria-label="Remove item">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    `;

    // Toggle completion in editor
    const checkbox = row.querySelector('.checklist-row-checkbox');
    checkbox.addEventListener('click', () => {
      const currentlyChecked = checkbox.classList.contains('checked');
      checkbox.classList.toggle('checked', !currentlyChecked);
      checkbox.innerHTML = !currentlyChecked ? `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ` : '';
    });

    // Enter key creates a new row below and focuses it
    const input = row.querySelector('.checklist-item-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const container = document.getElementById('editor-checklist-rows');
        const newRow = createChecklistRowElement('', false);
        if (row.nextSibling) {
          container.insertBefore(newRow, row.nextSibling);
        } else {
          container.appendChild(newRow);
        }
        newRow.querySelector('.checklist-item-input').focus();
      }
    });

    // Remove row button
    const removeBtn = row.querySelector('.btn-remove-row');
    removeBtn.addEventListener('click', () => {
      const container = document.getElementById('editor-checklist-rows');
      row.remove();
      // Ensure at least one empty row remains
      if (container && container.children.length === 0) {
        const freshRow = createChecklistRowElement('', false);
        container.appendChild(freshRow);
        freshRow.querySelector('.checklist-item-input').focus();
      }
    });

    return row;
  }

  /**
   * Opens the list editor for creating a new list or editing an existing one.
   * @param {string|null} listId - ID of list to edit, or null to create new list.
   */
  function openEditor(listId = null) {
    activeEditingListId = listId;

    const editorCard = document.getElementById('daily-list-editor');
    const editorTitle = document.getElementById('editor-heading');
    const titleInput = document.getElementById('editor-list-title');
    const dateInput = document.getElementById('editor-list-date');
    const timeInput = document.getElementById('editor-list-time');
    const rowsContainer = document.getElementById('editor-checklist-rows');
    const errorBox = document.getElementById('editor-error-msg');

    if (!editorCard || !rowsContainer) return;

    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }

    rowsContainer.innerHTML = '';

    if (listId) {
      // Editing existing list
      const list = lists.find(l => l.id === listId);
      if (!list) return;

      if (editorTitle) editorTitle.textContent = 'Edit To-Do List';
      if (titleInput) titleInput.value = list.title || '';
      if (dateInput) dateInput.value = list.dueDate || '';
      if (timeInput) timeInput.value = list.dueTime || '';

      if (list.items && list.items.length > 0) {
        list.items.forEach(item => {
          const row = createChecklistRowElement(item.text, item.completed);
          rowsContainer.appendChild(row);
        });
      } else {
        const row = createChecklistRowElement('', false);
        rowsContainer.appendChild(row);
      }
    } else {
      // Creating new list
      if (editorTitle) editorTitle.textContent = 'Create To-Do List';
      if (titleInput) titleInput.value = '';
      if (dateInput) dateInput.value = '';
      if (timeInput) timeInput.value = '';

      // First row ready for typing
      const row = createChecklistRowElement('', false);
      rowsContainer.appendChild(row);
    }

    // Show editor
    editorCard.style.display = 'block';

    // Focus the first checklist row input if title is populated, otherwise list title
    setTimeout(() => {
      if (titleInput && !titleInput.value) {
        titleInput.focus();
      } else {
        const firstInput = rowsContainer.querySelector('.checklist-item-input');
        if (firstInput) firstInput.focus();
      }
    }, 50);

    // Smooth scroll to editor
    editorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Closes the list editor and discards unsaved changes.
   */
  function closeEditor() {
    const editorCard = document.getElementById('daily-list-editor');
    const errorBox = document.getElementById('editor-error-msg');
    activeEditingListId = null;

    if (editorCard) {
      editorCard.style.display = 'none';
    }
    if (errorBox) {
      errorBox.textContent = '';
      errorBox.style.display = 'none';
    }
  }

  /**
   * Collects and saves the list from the editor.
   */
  function saveEditorList() {
    const titleInput = document.getElementById('editor-list-title');
    const dateInput = document.getElementById('editor-list-date');
    const timeInput = document.getElementById('editor-list-time');
    const rowsContainer = document.getElementById('editor-checklist-rows');
    const errorBox = document.getElementById('editor-error-msg');

    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) {
      if (errorBox) {
        errorBox.textContent = 'Please enter a list title.';
        errorBox.style.display = 'block';
      }
      if (titleInput) titleInput.focus();
      return { success: false, error: 'Please enter a list title.' };
    }

    const dueDate = (dateInput && dateInput.value) ? dateInput.value : null;
    const dueTime = (timeInput && timeInput.value) ? timeInput.value : null;

    // Collect checklist rows (filter out completely blank rows)
    const items = [];
    if (rowsContainer) {
      const rows = rowsContainer.querySelectorAll('.checklist-editor-row');
      rows.forEach((row, index) => {
        const input = row.querySelector('.checklist-item-input');
        const checkbox = row.querySelector('.checklist-row-checkbox');
        const text = input ? input.value.trim() : '';
        const isCompleted = checkbox ? checkbox.classList.contains('checked') : false;

        if (text) {
          // Preserve completion timestamp if item was already completed, or create timestamp if newly completed
          let itemCompletedAt = null;
          if (isCompleted) {
            const existingItem = (activeEditingListId)
              ? (lists.find(l => l.id === activeEditingListId)?.items?.find(i => i.text === text && i.completed))
              : null;
            itemCompletedAt = existingItem && existingItem.completedAt ? existingItem.completedAt : new Date().toISOString();
          }

          items.push({
            id: 'item_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substring(2, 5),
            text: text,
            completed: isCompleted,
            completedAt: itemCompletedAt
          });
        }
      });
    }

    if (activeEditingListId) {
      // Update existing list
      const list = lists.find(l => l.id === activeEditingListId);
      if (list) {
        list.title = title;
        list.dueDate = dueDate;
        list.dueTime = dueTime;
        list.items = items;
      }
    } else {
      // Create new list
      const newList = {
        id: 'list_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title: title,
        dueDate: dueDate,
        dueTime: dueTime,
        items: items,
        createdAt: Date.now()
      };
      lists.unshift(newList); // Add to the top
    }

    saveData();
    closeEditor();
    render();
    if (typeof DaybloomGrowth !== 'undefined' && DaybloomGrowth.render) {
      DaybloomGrowth.render();
    }
    return { success: true };
  }

  /**
   * Toggles completion status of a checklist item directly inside a saved list card.
   */
  function toggleItemCompletion(listId, itemId) {
    const list = lists.find(l => l.id === listId);
    if (!list || !list.items) return;

    const item = list.items.find(i => i.id === itemId);
    if (item) {
      item.completed = !item.completed;
      item.completedAt = item.completed ? new Date().toISOString() : null;
      saveData();
      render();
      if (typeof DaybloomGrowth !== 'undefined' && DaybloomGrowth.render) {
        DaybloomGrowth.render();
      }
    }
  }

  /**
   * Deletes an entire list with confirmation.
   */
  function deleteList(listId) {
    const list = lists.find(l => l.id === listId);
    if (!list) return;

    const confirmed = window.confirm(`Are you sure you want to delete the list "${list.title}" and all its checklist items?`);
    if (!confirmed) return;

    lists = lists.filter(l => l.id !== listId);
    if (activeEditingListId === listId) {
      closeEditor();
    }
    saveData();
    render();
    if (typeof DaybloomGrowth !== 'undefined' && DaybloomGrowth.render) {
      DaybloomGrowth.render();
    }
  }

  /**
   * Binds toolbar buttons and filters.
   */
  function bindToolbarEvents() {
    const createBtn = document.getElementById('btn-create-list');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        openEditor(null);
      });
    }

    const filterBtns = document.querySelectorAll('.list-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        currentFilter = btn.getAttribute('data-filter') || 'all';
        render();
      });
    });
  }

  /**
   * Binds editor save, cancel, and add-item buttons.
   */
  function bindEditorEvents() {
    const saveBtn = document.getElementById('btn-save-list');
    const cancelBtn = document.getElementById('btn-cancel-list');
    const addRowBtn = document.getElementById('btn-add-checklist-row');
    const clearDeadlinesBtn = document.getElementById('btn-clear-deadline');

    if (saveBtn) {
      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveEditorList();
      });
    }

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeEditor();
      });
    }

    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => {
        const rowsContainer = document.getElementById('editor-checklist-rows');
        if (rowsContainer) {
          const newRow = createChecklistRowElement('', false);
          rowsContainer.appendChild(newRow);
          newRow.querySelector('.checklist-item-input').focus();
        }
      });
    }

    if (clearDeadlinesBtn) {
      clearDeadlinesBtn.addEventListener('click', () => {
        const dateInput = document.getElementById('editor-list-date');
        const timeInput = document.getElementById('editor-list-time');
        if (dateInput) dateInput.value = '';
        if (timeInput) timeInput.value = '';
      });
    }
  }

  /**
   * Renders the saved lists, toolbar counters, and active filter states.
   */
  function render() {
    const container = document.getElementById('daily-lists-container');
    const counterBadge = document.getElementById('daily-lists-count');
    const filterBtns = document.querySelectorAll('.list-filter-btn');

    if (!container) return;

    // 1. Update filter tab active classes
    filterBtns.forEach(btn => {
      const match = btn.getAttribute('data-filter') === currentFilter;
      btn.classList.toggle('active', match);
    });

    // 2. Compute active lists count
    const activeLists = lists.filter(l => !isListCompleted(l));
    if (counterBadge) {
      counterBadge.textContent = `${activeLists.length} active`;
    }

    // 3. Filter lists
    let filteredLists = lists;
    if (currentFilter === 'active') {
      filteredLists = lists.filter(l => !isListCompleted(l));
    } else if (currentFilter === 'completed') {
      filteredLists = lists.filter(l => isListCompleted(l));
    }

    // 4. Handle empty state
    if (filteredLists.length === 0) {
      let emptyTitle = 'No to-do lists yet';
      let emptySubtitle = 'Click "+ New List" above to create your first multi-item checklist.';

      if (currentFilter === 'completed') {
        emptyTitle = 'No completed lists';
        emptySubtitle = 'Lists where all items are checked off will appear here.';
      } else if (currentFilter === 'active' && lists.length > 0) {
        emptyTitle = 'All lists completed!';
        emptySubtitle = 'Great job! Every checklist item has been finished.';
      }

      container.innerHTML = `
        <div class="task-empty-card">
          <div class="empty-icon-wrap" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <h3 class="empty-title">${emptyTitle}</h3>
          <p class="empty-subtitle">${emptySubtitle}</p>
        </div>
      `;
      return;
    }

    // 5. Render lists
    container.innerHTML = '';
    filteredLists.forEach(list => {
      const isCompleted = isListCompleted(list);
      const isOverdue = isListOverdue(list);
      const totalItems = list.items ? list.items.length : 0;
      const completedItems = list.items ? list.items.filter(i => i.completed).length : 0;

      // Completion badge label
      let summaryText = `${completedItems} of ${totalItems} completed`;
      if (totalItems === 0) {
        summaryText = '0 items';
      } else if (isCompleted) {
        summaryText = `All ${totalItems} completed`;
      }

      const card = document.createElement('div');
      card.className = `todo-list-card ${isCompleted ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`;
      card.setAttribute('data-list-id', list.id);

      const deadlineText = formatDeadline(list.dueDate, list.dueTime);

      card.innerHTML = `
        <div class="todo-list-card-header">
          <div class="todo-list-header-main">
            <h4 class="todo-list-title">${escapeHtml(list.title)}</h4>
            <div class="todo-list-badges-row">
              <span class="badge ${isCompleted ? 'badge-completed' : 'badge-daily'}">
                ${summaryText}
              </span>

              ${deadlineText ? `
                <span class="list-due-pill ${isOverdue ? 'overdue-text' : ''}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>${deadlineText}</span>
                </span>
              ` : ''}

              ${isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
            </div>
          </div>

          <div class="todo-list-actions">
            <button class="btn-action btn-edit-list" title="Edit list" aria-label="Edit list '${escapeHtml(list.title)}'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              <span class="action-label">Edit</span>
            </button>

            <button class="btn-action btn-danger-action btn-delete-list" title="Delete list" aria-label="Delete list '${escapeHtml(list.title)}'">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="todo-list-items-body">
          ${totalItems === 0 ? `
            <p class="empty-items-hint">No items in this list yet. Click Edit to add checklist items.</p>
          ` : `
            <ul class="card-checklist" role="list">
              ${list.items.map(item => `
                <li class="card-checklist-item ${item.completed ? 'is-completed' : ''}" data-item-id="${item.id}">
                  <button type="button" class="checklist-row-checkbox ${item.completed ? 'checked' : ''}" aria-label="Mark item '${escapeHtml(item.text)}' as ${item.completed ? 'incomplete' : 'completed'}">
                    ${item.completed ? `
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    ` : ''}
                  </button>
                  <span class="card-checklist-text">${escapeHtml(item.text)}</span>
                </li>
              `).join('')}
            </ul>
          `}
        </div>
      `;

      // Bind interactive checkbox clicks inside the card
      const itemCheckboxes = card.querySelectorAll('.card-checklist-item');
      itemCheckboxes.forEach(itemEl => {
        const itemId = itemEl.getAttribute('data-item-id');
        const chk = itemEl.querySelector('.checklist-row-checkbox');
        const textSpan = itemEl.querySelector('.card-checklist-text');

        const handleToggle = () => toggleItemCompletion(list.id, itemId);
        if (chk) chk.addEventListener('click', handleToggle);
        if (textSpan) textSpan.addEventListener('click', handleToggle);
      });

      // Bind Edit list button
      const editBtn = card.querySelector('.btn-edit-list');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditor(list.id);
        });
      }

      // Bind Delete list button
      const deleteBtn = card.querySelector('.btn-delete-list');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteList(list.id);
        });
      }

      container.appendChild(card);
    });
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
    openEditor,
    closeEditor,
    saveEditorList,
    toggleItemCompletion,
    deleteList,
    isListOverdue,
    isListCompleted,
    getLists: () => lists,
    setLists: (newLists) => { lists = newLists; saveData(); render(); }
  };
})();
