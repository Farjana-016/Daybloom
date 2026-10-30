/**
 * Daybloom Growth: Productivity Dashboard
 * --------------------------------------------------------------------------
 * Aggregates live productivity analytics across Daily to-do checklists and
 * Scholar academic tasks.
 *
 * Features:
 * 1. Daily Progress: Total items, completed items, pending items, completion percentage,
 *    and list completion statistics.
 * 2. Scholar Progress: Total academic tasks, completed, pending, percentage, and 6-category breakdown.
 * 3. Overall Productivity: Transparent unit-based combined completion percentage.
 * 4. Weekly Completion Chart (Sunday–Saturday): Grounded strictly in verified completion timestamps.
 * 5. Action Center (Upcoming & Overdue Milestones): Unified tracking of Scholar events,
 *    submission deadlines, and Daily deadlines with one-click navigation.
 *
 * Does NOT duplicate data or create a separate storage key.
 */

const DaybloomGrowth = (() => {
  const DAILY_STORAGE_KEY = 'daybloom_daily_tasks';
  const SCHOLAR_STORAGE_KEY = 'daybloom_scholar_tasks';

  const SCHOLAR_CATEGORIES = [
    'Exams',
    'Tests',
    'Records',
    'Assignments',
    'Skill Building',
    'Projects'
  ];

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Current active milestone filter tab: 'all' | 'overdue' | 'upcoming' | 'completed'
  let milestoneFilter = 'all';

  /**
   * Initializes the Growth module and binds interactive events.
   */
  function init() {
    bindEvents();
    render();
  }

  /**
   * Loads current Daily lists from localStorage.
   */
  function getDailyLists() {
    try {
      const stored = localStorage.getItem(DAILY_STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('DaybloomGrowth: Error reading Daily data', e);
      return [];
    }
  }

  /**
   * Loads current Scholar tasks from localStorage.
   */
  function getScholarTasks() {
    try {
      const stored = localStorage.getItem(SCHOLAR_STORAGE_KEY);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('DaybloomGrowth: Error reading Scholar data', e);
      return [];
    }
  }

  /**
   * Formats a Date object to "YYYY-MM-DD".
   */
  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Evaluates if a deadline is overdue.
   * - Completed tasks/lists are NEVER overdue.
   * - Missing deadline is NEVER overdue.
   * - If time provided: overdue once exact timestamp passes.
   * - If date only: overdue after end of calendar day (23:59:59.999).
   */
  function isDeadlineOverdue(dueDate, dueTime, isCompleted) {
    if (isCompleted || !dueDate) return false;

    const now = new Date();
    const [year, month, day] = dueDate.split('-').map(Number);

    if (dueTime) {
      const [hours, minutes] = dueTime.split(':').map(Number);
      const deadline = new Date(year, month - 1, day, hours, minutes, 0, 0);
      return now > deadline;
    } else {
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      return now > endOfDay;
    }
  }

  /**
   * Formats a deadline for friendly display.
   */
  function formatFriendlyDeadline(dueDate, dueTime) {
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
        day: 'numeric'
      });
    }

    if (dueTime) {
      const [h, m] = dueTime.split(':').map(Number);
      const tempDate = new Date();
      tempDate.setHours(h, m, 0, 0);
      const timeText = tempDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${dateText} at ${timeText}`;
    }

    return dateText;
  }

  /**
   * Calculates comprehensive Daily statistics.
   */
  function computeDailyStats(lists) {
    let totalItems = 0;
    let completedItems = 0;
    let fullyCompletedLists = 0;

    lists.forEach(list => {
      const items = Array.isArray(list.items) ? list.items : [];
      totalItems += items.length;

      const checkedInList = items.filter(i => Boolean(i.completed)).length;
      completedItems += checkedInList;

      // A list is completed iff it has items and ALL items are completed
      if (items.length > 0 && checkedInList === items.length) {
        fullyCompletedLists += 1;
      }
    });

    const pendingItems = totalItems - completedItems;
    const itemPercentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const totalLists = lists.length;
    const activeLists = totalLists - fullyCompletedLists;
    const listPercentage = totalLists > 0 ? Math.round((fullyCompletedLists / totalLists) * 100) : 0;

    return {
      totalLists,
      fullyCompletedLists,
      activeLists,
      listPercentage,
      totalItems,
      completedItems,
      pendingItems,
      itemPercentage
    };
  }

  /**
   * Calculates comprehensive Scholar statistics.
   */
  function computeScholarStats(tasks) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => Boolean(t.completed)).length;
    const pendingTasks = totalTasks - completedTasks;
    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Six academic categories breakdown
    const categoryBreakdown = SCHOLAR_CATEGORIES.map(category => {
      const catTasks = tasks.filter(t => t.category === category);
      const catTotal = catTasks.length;
      const catCompleted = catTasks.filter(t => Boolean(t.completed)).length;
      const catPending = catTotal - catCompleted;
      const catPercentage = catTotal > 0 ? Math.round((catCompleted / catTotal) * 100) : 0;

      return {
        category,
        total: catTotal,
        completed: catCompleted,
        pending: catPending,
        percentage: catPercentage
      };
    });

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      percentage,
      categoryBreakdown
    };
  }

  /**
   * Calculates Sunday–Saturday weekly completion counts strictly from timestamps.
   */
  function computeWeeklyCompletions(lists, tasks) {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday

    // Start of the current week (Sunday at 00:00:00)
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const todayStr = formatDateKey(today);

    // Days array for the 7 days of the current week
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const dateKey = formatDateKey(d);

      weekDays.push({
        dayName: WEEKDAYS[i],
        dayNumber: d.getDate(),
        dateKey: dateKey,
        isToday: dateKey === todayStr,
        scholarCompleted: 0,
        dailyCompleted: 0,
        totalCompleted: 0
      });
    }

    // 1. Count Scholar completions with genuine completedAt timestamps
    tasks.forEach(task => {
      if (task.completed && task.completedAt) {
        const taskDateKey = task.completedAt.slice(0, 10);
        const match = weekDays.find(wd => wd.dateKey === taskDateKey);
        if (match) {
          match.scholarCompleted += 1;
          match.totalCompleted += 1;
        }
      }
    });

    // 2. Count Daily item completions with genuine completedAt timestamps
    lists.forEach(list => {
      if (Array.isArray(list.items)) {
        list.items.forEach(item => {
          if (item.completed && item.completedAt) {
            const itemDateKey = item.completedAt.slice(0, 10);
            const match = weekDays.find(wd => wd.dateKey === itemDateKey);
            if (match) {
              match.dailyCompleted += 1;
              match.totalCompleted += 1;
            }
          }
        });
      }
    });

    const maxCount = Math.max(...weekDays.map(wd => wd.totalCompleted), 1);
    const totalWeekCompleted = weekDays.reduce((sum, wd) => sum + wd.totalCompleted, 0);

    return {
      weekDays,
      maxCount,
      totalWeekCompleted
    };
  }

  /**
   * Collects and sorts all upcoming and overdue milestones.
   * - Daily lists without deadlines are excluded.
   * - Distinguishes Event vs Submission Deadline vs Daily Checklist Deadline.
   */
  function collectMilestones(lists, tasks) {
    const milestones = [];

    // 1. Scholar Tasks with deadlines/dates
    tasks.forEach(task => {
      if (!task.dueDate) return;

      const isCompleted = Boolean(task.completed);
      const isOverdue = isDeadlineOverdue(task.dueDate, task.dueTime, isCompleted);
      const isEvent = task.dateType === 'event';

      milestones.push({
        id: task.id,
        source: 'scholar',
        title: task.title,
        category: task.category,
        dateType: task.dateType,
        typeLabel: isEvent ? 'Event' : 'Submission Deadline',
        course: task.course || '',
        dueDate: task.dueDate,
        dueTime: task.dueTime || '',
        notes: task.notes || '',
        completed: isCompleted,
        isOverdue: isOverdue
      });
    });

    // 2. Daily Lists with deadlines
    lists.forEach(list => {
      // Exclude Daily lists without deadlines
      if (!list.dueDate) return;

      const items = Array.isArray(list.items) ? list.items : [];
      const isCompleted = items.length > 0 && items.every(i => Boolean(i.completed));
      const isOverdue = isDeadlineOverdue(list.dueDate, list.dueTime, isCompleted);
      const completedCount = items.filter(i => Boolean(i.completed)).length;

      milestones.push({
        id: list.id,
        source: 'daily',
        title: list.title,
        category: null,
        dateType: 'daily-deadline',
        typeLabel: 'List Deadline',
        course: '',
        dueDate: list.dueDate,
        dueTime: list.dueTime || '',
        notes: `${completedCount} of ${items.length} items checked`,
        completed: isCompleted,
        isOverdue: isOverdue
      });
    });

    // 3. Sorting: Overdue incomplete first, upcoming nearest first, completed last
    milestones.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }

      if (!a.completed) {
        if (a.isOverdue !== b.isOverdue) {
          return a.isOverdue ? -1 : 1;
        }

        const dateCmp = a.dueDate.localeCompare(b.dueDate);
        if (dateCmp !== 0) return dateCmp;

        const timeA = a.dueTime || '23:59';
        const timeB = b.dueTime || '23:59';
        return timeA.localeCompare(timeB);
      }

      // Both completed
      const dateCmp = a.dueDate.localeCompare(b.dueDate);
      if (dateCmp !== 0) return dateCmp;
      return (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59');
    });

    return milestones;
  }

  /**
   * Slug helper for CSS category classes.
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

  /**
   * Binds user events for filter tabs and navigation shortcuts.
   */
  function bindEvents() {
    const filterGroup = document.getElementById('growth-milestone-filters');
    if (filterGroup) {
      filterGroup.addEventListener('click', (e) => {
        const btn = e.target.closest('.growth-filter-btn');
        if (!btn) return;

        const filter = btn.getAttribute('data-filter');
        if (filter && filter !== milestoneFilter) {
          milestoneFilter = filter;
          renderMilestones();
        }
      });
    }
  }

  /**
   * Master render method: computes metrics and updates all visual components.
   */
  function render() {
    const lists = getDailyLists();
    const tasks = getScholarTasks();

    const dailyStats = computeDailyStats(lists);
    const scholarStats = computeScholarStats(tasks);
    const weeklyData = computeWeeklyCompletions(lists, tasks);
    const milestones = collectMilestones(lists, tasks);

    renderKPIs(dailyStats, scholarStats, milestones);
    renderWeeklyChart(weeklyData);
    renderCategoryBreakdown(scholarStats);
    renderDailyHealth(dailyStats);
    renderMilestones(milestones);
  }

  /**
   * Renders the 4 top KPI cards.
   */
  function renderKPIs(dailyStats, scholarStats, milestones) {
    // 1. Daily Checklist Items
    const dailyCompletedEl = document.getElementById('kpi-daily-completed');
    const dailyTotalEl = document.getElementById('kpi-daily-total');
    const dailyPctEl = document.getElementById('kpi-daily-pct');
    const dailyBarEl = document.getElementById('kpi-daily-bar');
    const dailyHintEl = document.getElementById('kpi-daily-hint');

    if (dailyCompletedEl) dailyCompletedEl.textContent = dailyStats.completedItems;
    if (dailyTotalEl) dailyTotalEl.textContent = `/ ${dailyStats.totalItems} items`;
    if (dailyPctEl) dailyPctEl.textContent = `${dailyStats.itemPercentage}%`;
    if (dailyBarEl) dailyBarEl.style.width = `${dailyStats.itemPercentage}%`;
    if (dailyHintEl) {
      dailyHintEl.textContent = `${dailyStats.fullyCompletedLists} of ${dailyStats.totalLists} lists fully completed`;
    }

    // 2. Scholar Academic Tasks
    const scholarCompletedEl = document.getElementById('kpi-scholar-completed');
    const scholarTotalEl = document.getElementById('kpi-scholar-total');
    const scholarPctEl = document.getElementById('kpi-scholar-pct');
    const scholarBarEl = document.getElementById('kpi-scholar-bar');
    const scholarHintEl = document.getElementById('kpi-scholar-hint');

    if (scholarCompletedEl) scholarCompletedEl.textContent = scholarStats.completedTasks;
    if (scholarTotalEl) scholarTotalEl.textContent = `/ ${scholarStats.totalTasks} tasks`;
    if (scholarPctEl) scholarPctEl.textContent = `${scholarStats.percentage}%`;
    if (scholarBarEl) scholarBarEl.style.width = `${scholarStats.percentage}%`;
    if (scholarHintEl) {
      scholarHintEl.textContent = `${scholarStats.pendingTasks} pending academic tasks`;
    }

    // 3. Overall Combined Productivity (Checklist items + Academic tasks)
    const combinedUnitsTotal = dailyStats.totalItems + scholarStats.totalTasks;
    const combinedUnitsCompleted = dailyStats.completedItems + scholarStats.completedTasks;
    const overallPct = combinedUnitsTotal > 0 ? Math.round((combinedUnitsCompleted / combinedUnitsTotal) * 100) : 0;

    const overallCompletedEl = document.getElementById('kpi-overall-completed');
    const overallTotalEl = document.getElementById('kpi-overall-total');
    const overallPctEl = document.getElementById('kpi-overall-pct');
    const overallBarEl = document.getElementById('kpi-overall-bar');
    const overallHintEl = document.getElementById('kpi-overall-hint');

    if (overallCompletedEl) overallCompletedEl.textContent = combinedUnitsCompleted;
    if (overallTotalEl) overallTotalEl.textContent = `/ ${combinedUnitsTotal} units`;
    if (overallPctEl) overallPctEl.textContent = `${overallPct}%`;
    if (overallBarEl) overallBarEl.style.width = `${overallPct}%`;
    if (overallHintEl) {
      overallHintEl.textContent = 'Units finished: Checklist items + Academic tasks';
    }

    // 4. Overdue & Urgent Milestones
    const overdueCount = milestones.filter(m => !m.completed && m.isOverdue).length;
    const upcomingCount = milestones.filter(m => !m.completed && !m.isOverdue).length;

    const overdueCountEl = document.getElementById('kpi-overdue-count');
    const overdueHintEl = document.getElementById('kpi-overdue-hint');
    const overdueCardEl = document.getElementById('kpi-overdue-card');

    if (overdueCountEl) overdueCountEl.textContent = overdueCount;
    if (overdueHintEl) {
      overdueHintEl.textContent = overdueCount === 0
        ? `${upcomingCount} upcoming milestones on track`
        : `${overdueCount} overdue requiring immediate attention`;
    }
    if (overdueCardEl) {
      overdueCardEl.classList.toggle('has-overdue', overdueCount > 0);
    }
  }

  /**
   * Renders the Sunday–Saturday Weekly Completion Bar Chart.
   */
  function renderWeeklyChart(weeklyData) {
    const chartBarsContainer = document.getElementById('growth-weekly-bars');
    const chartTotalBadge = document.getElementById('growth-week-total-badge');

    if (!chartBarsContainer) return;

    if (chartTotalBadge) {
      chartTotalBadge.textContent = `${weeklyData.totalWeekCompleted} completed this week`;
    }

    chartBarsContainer.innerHTML = '';

    weeklyData.weekDays.forEach(wd => {
      const col = document.createElement('div');
      col.className = `weekly-chart-col ${wd.isToday ? 'is-today' : ''}`;

      // Calculate bar height percentage with a baseline min of 8% for 0 completions
      const heightPercent = wd.totalCompleted > 0
        ? Math.max(Math.round((wd.totalCompleted / weeklyData.maxCount) * 88) + 12, 16)
        : 8;

      col.innerHTML = `
        <div class="chart-bar-track">
          <div class="chart-bar-fill ${wd.totalCompleted > 0 ? 'has-completions' : 'is-empty'}" style="height: ${heightPercent}%;">
            ${wd.totalCompleted > 0 ? `<span class="chart-count-popup">${wd.totalCompleted}</span>` : ''}
          </div>
        </div>
        <div class="chart-day-info">
          <span class="chart-day-name">${wd.dayName}</span>
          <span class="chart-day-date">${wd.dayNumber}</span>
        </div>
      `;

      chartBarsContainer.appendChild(col);
    });
  }

  /**
   * Renders the 6-Category Academic Progress Breakdown.
   */
  function renderCategoryBreakdown(scholarStats) {
    const listContainer = document.getElementById('growth-category-breakdown-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    scholarStats.categoryBreakdown.forEach(cat => {
      const row = document.createElement('div');
      row.className = 'growth-cat-row';

      row.innerHTML = `
        <div class="cat-row-header">
          <div class="cat-row-title-wrap">
            <span class="cat-dot cat-${toClassSlug(cat.category)}"></span>
            <span class="cat-row-name">${escapeHtml(cat.category)}</span>
          </div>
          <div class="cat-row-counts">
            <span class="cat-count-bold">${cat.completed}</span>
            <span class="cat-count-sub">/ ${cat.total}</span>
            <span class="cat-percentage-pill">${cat.percentage}%</span>
          </div>
        </div>
        <div class="growth-progress-track">
          <div class="growth-progress-fill cat-fill-${toClassSlug(cat.category)}" style="width: ${cat.percentage}%;"></div>
        </div>
      `;

      listContainer.appendChild(row);
    });
  }

  /**
   * Renders Daily To-Do Lists Health breakdown.
   */
  function renderDailyHealth(dailyStats) {
    const totalListsEl = document.getElementById('growth-daily-total-lists');
    const completedListsEl = document.getElementById('growth-daily-completed-lists');
    const activeListsEl = document.getElementById('growth-daily-active-lists');
    const listPctEl = document.getElementById('growth-daily-list-pct');
    const listBarEl = document.getElementById('growth-daily-list-bar');

    if (totalListsEl) totalListsEl.textContent = dailyStats.totalLists;
    if (completedListsEl) completedListsEl.textContent = dailyStats.fullyCompletedLists;
    if (activeListsEl) activeListsEl.textContent = dailyStats.activeLists;
    if (listPctEl) listPctEl.textContent = `${dailyStats.listPercentage}%`;
    if (listBarEl) listBarEl.style.width = `${dailyStats.listPercentage}%`;
  }

  /**
   * Renders the Upcoming & Overdue Action Center panel.
   */
  function renderMilestones(milestones) {
    if (!milestones) {
      milestones = collectMilestones(getDailyLists(), getScholarTasks());
    }

    const container = document.getElementById('growth-milestones-list');
    if (!container) return;

    // Update filter counts
    const countAll = milestones.length;
    const countOverdue = milestones.filter(m => !m.completed && m.isOverdue).length;
    const countUpcoming = milestones.filter(m => !m.completed && !m.isOverdue).length;
    const countCompleted = milestones.filter(m => m.completed).length;

    const elAll = document.getElementById('growth-count-all');
    const elOverdue = document.getElementById('growth-count-overdue');
    const elUpcoming = document.getElementById('growth-count-upcoming');
    const elCompleted = document.getElementById('growth-count-completed');

    if (elAll) elAll.textContent = countAll;
    if (elOverdue) elOverdue.textContent = countOverdue;
    if (elUpcoming) elUpcoming.textContent = countUpcoming;
    if (elCompleted) elCompleted.textContent = countCompleted;

    // Filter button active classes
    const buttons = document.querySelectorAll('.growth-filter-btn');
    buttons.forEach(btn => {
      const match = btn.getAttribute('data-filter') === milestoneFilter;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    });

    // Filter milestone records
    let filtered = milestones;
    if (milestoneFilter === 'overdue') {
      filtered = milestones.filter(m => !m.completed && m.isOverdue);
    } else if (milestoneFilter === 'upcoming') {
      filtered = milestones.filter(m => !m.completed && !m.isOverdue);
    } else if (milestoneFilter === 'completed') {
      filtered = milestones.filter(m => m.completed);
    }

    // Empty state
    if (filtered.length === 0) {
      let emptyTitle = 'No milestones scheduled';
      let emptySubtitle = 'Deadlines from Scholar and Daily lists will appear here.';

      if (milestoneFilter === 'overdue') {
        emptyTitle = 'Zero overdue deadlines!';
        emptySubtitle = 'All coursework and to-do milestones are on schedule.';
      } else if (milestoneFilter === 'upcoming') {
        emptyTitle = 'No upcoming deadlines';
        emptySubtitle = 'No pending deadlines are scheduled.';
      } else if (milestoneFilter === 'completed') {
        emptyTitle = 'No completed milestones yet';
        emptySubtitle = 'Finished tasks and completed lists will appear here.';
      }

      container.innerHTML = `
        <div class="task-empty-card" style="padding: var(--spacing-8) var(--spacing-4);">
          <div class="empty-icon-wrap" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h4 class="empty-title">${escapeHtml(emptyTitle)}</h4>
          <p class="empty-subtitle">${escapeHtml(emptySubtitle)}</p>
        </div>
      `;
      return;
    }

    // Render cards
    container.innerHTML = '';
    filtered.forEach(item => {
      const isDaily = item.source === 'daily';
      const deadlineText = formatFriendlyDeadline(item.dueDate, item.dueTime);

      const card = document.createElement('div');
      card.className = `growth-milestone-card ${item.completed ? 'is-completed' : ''} ${item.isOverdue ? 'is-overdue' : ''}`;

      card.innerHTML = `
        <div class="milestone-card-main">
          <div class="milestone-badges-row">
            <span class="badge ${isDaily ? 'badge-source-daily' : 'badge-source-scholar'}">
              ${isDaily ? 'Daily' : 'Scholar'}
            </span>

            <span class="badge ${item.dateType === 'event' ? 'type-event' : 'type-deadline'}">
              ${escapeHtml(item.typeLabel)}
            </span>

            ${item.category ? `<span class="badge cat-badge cat-badge-${toClassSlug(item.category)}">${escapeHtml(item.category)}</span>` : ''}
            ${item.course ? `<span class="badge badge-course">${escapeHtml(item.course)}</span>` : ''}
            ${item.isOverdue ? '<span class="badge badge-overdue">Overdue</span>' : ''}
            ${item.completed ? '<span class="badge badge-completed">Completed</span>' : ''}
          </div>

          <h5 class="milestone-title">${escapeHtml(item.title)}</h5>

          <div class="milestone-meta-row">
            <span class="milestone-time ${item.isOverdue ? 'overdue-text' : ''}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span>${item.isOverdue ? 'Overdue: ' : 'Due: '}${deadlineText}</span>
            </span>

            ${item.notes ? `<span class="milestone-notes-hint">• ${escapeHtml(item.notes)}</span>` : ''}
          </div>
        </div>

        <div class="milestone-actions">
          <button type="button" class="btn btn-sm btn-subtle btn-jump-source" title="Jump to ${isDaily ? 'Daily' : 'Scholar'}">
            <span>Jump to ${isDaily ? 'Daily' : 'Scholar'}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      `;

      // Jump to action
      const jumpBtn = card.querySelector('.btn-jump-source');
      jumpBtn.addEventListener('click', () => {
        if (isDaily) {
          DaybloomNav.switchSection('daily');
          setTimeout(() => {
            const listCard = document.querySelector(`.todo-list-card[data-list-id="${item.id}"]`);
            if (listCard) {
              listCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              listCard.classList.add('highlight-pulse');
              setTimeout(() => listCard.classList.remove('highlight-pulse'), 2000);
            }
          }, 100);
        } else {
          DaybloomNav.switchSection('scholar');
          setTimeout(() => {
            if (item.dueDate && DaybloomScholar.selectDate) {
              DaybloomScholar.selectDate(item.dueDate);
            }
            const taskCard = document.querySelector(`.scholar-task-card[data-id="${item.id}"]`);
            if (taskCard) {
              taskCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              taskCard.classList.add('highlight-pulse');
              setTimeout(() => taskCard.classList.remove('highlight-pulse'), 2000);
            }
          }, 100);
        }
      });

      container.appendChild(card);
    });
  }

  return {
    init,
    render,
    computeDailyStats,
    computeScholarStats,
    computeWeeklyCompletions,
    collectMilestones,
    setMilestoneFilter: (f) => { milestoneFilter = f; renderMilestones(); }
  };
})();
