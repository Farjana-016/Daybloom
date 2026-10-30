/**
 * Daybloom Growth: Productivity Dashboard
 * --------------------------------------------------------------------------
 * Simplified, clean, and organized into exactly three main sections:
 * 1. Your Progress: Combined overall percentage + Daily & Scholar discrete item summaries.
 * 2. Weekly Activity: Sunday–Saturday completion bar chart with genuine completedAt timestamps.
 * 3. What Needs Your Attention?: Prioritized pending tasks grouped into Overdue & Upcoming.
 *
 * Dedicated storage safety:
 * - Both localStorage.getItem() and JSON.parse() wrapped in error handling.
 * - Never silently falls back to [] on unreadable data.
 * - Displays clear data-unavailable messages and halts misleading percentage calculations.
 * - Never mutates, resets, or overwrites stored Daily or Scholar data.
 */

const DaybloomGrowth = (() => {
  const DAILY_STORAGE_KEY = 'daybloom_daily_tasks';
  const SCHOLAR_STORAGE_KEY = 'daybloom_scholar_tasks';

  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /**
   * Initializes the Growth module and renders views.
   */
  function init() {
    render();
  }

  /**
   * Safely reads a localStorage key with comprehensive error handling.
   * Never mutates or overwrites stored data.
   */
  function readStorageSource(key, sourceName) {
    let raw = null;
    try {
      raw = localStorage.getItem(key);
    } catch (err) {
      console.error(`DaybloomGrowth: Error reading ${sourceName} from localStorage`, err);
      return { data: null, isAvailable: false, error: 'Storage access error' };
    }

    if (raw === null || raw === undefined || raw === '') {
      // Valid empty state (e.g. brand new user)
      return { data: [], isAvailable: true, error: null };
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error(`${sourceName} data is not an array`);
      }
      return { data: parsed, isAvailable: true, error: null };
    } catch (err) {
      console.error(`DaybloomGrowth: Error parsing ${sourceName} data from localStorage`, err);
      return { data: null, isAvailable: false, error: 'Malformed data' };
    }
  }

  /**
   * Formats a Date object to local "YYYY-MM-DD".
   */
  function formatDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * Evaluates if a deadline is overdue.
   * - Completed tasks are NEVER overdue.
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
   * Calculates Daily statistics.
   * Each individual checklist item counts as one discrete task.
   */
  function computeDailyStats(lists) {
    if (!Array.isArray(lists)) return { totalItems: 0, completedItems: 0 };

    let totalItems = 0;
    let completedItems = 0;

    lists.forEach(list => {
      const items = Array.isArray(list.items) ? list.items : [];
      totalItems += items.length;
      completedItems += items.filter(i => Boolean(i.completed)).length;
    });

    return {
      totalItems,
      completedItems
    };
  }

  /**
   * Calculates Scholar statistics.
   * Each academic task counts as one discrete task.
   */
  function computeScholarStats(tasks) {
    if (!Array.isArray(tasks)) return { totalTasks: 0, completedTasks: 0 };

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => Boolean(t.completed)).length;

    return {
      totalTasks,
      completedTasks
    };
  }

  /**
   * Calculates Sunday–Saturday weekly completion counts strictly from timestamps.
   */
  function computeWeeklyCompletions(dailyLists, scholarTasks) {
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday

    // Start of the current week (Sunday at 00:00:00)
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - currentDayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const todayStr = formatDateKey(today);

    // 7 days array
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
        totalCompleted: 0
      });
    }

    // 1. Count Scholar completions with genuine completedAt timestamps
    if (Array.isArray(scholarTasks)) {
      scholarTasks.forEach(task => {
        if (task.completed && task.completedAt) {
          const taskDateKey = String(task.completedAt).slice(0, 10);
          const match = weekDays.find(wd => wd.dateKey === taskDateKey);
          if (match) {
            match.totalCompleted += 1;
          }
        }
      });
    }

    // 2. Count Daily item completions with genuine completedAt timestamps
    if (Array.isArray(dailyLists)) {
      dailyLists.forEach(list => {
        if (Array.isArray(list.items)) {
          list.items.forEach(item => {
            if (item.completed && item.completedAt) {
              const itemDateKey = String(item.completedAt).slice(0, 10);
              const match = weekDays.find(wd => wd.dateKey === itemDateKey);
              if (match) {
                match.totalCompleted += 1;
              }
            }
          });
        }
      });
    }

    const maxCount = Math.max(...weekDays.map(wd => wd.totalCompleted), 1);
    const totalWeekCompleted = weekDays.reduce((sum, wd) => sum + wd.totalCompleted, 0);

    return {
      weekDays,
      maxCount,
      totalWeekCompleted
    };
  }

  /**
   * Collects pending incomplete tasks with deadlines for What Needs Your Attention?
   * Excludes completed tasks and tasks without deadlines.
   */
  function collectAttentionTasks(dailyLists, scholarTasks) {
    const overdue = [];
    const upcoming = [];

    // 1. Scholar Tasks with deadlines
    if (Array.isArray(scholarTasks)) {
      scholarTasks.forEach(task => {
        if (!task.dueDate) return;
        if (task.completed) return; // Completed tasks must NEVER appear

        const isOverdue = isDeadlineOverdue(task.dueDate, task.dueTime, false);
        const itemObj = {
          id: task.id,
          source: 'scholar',
          title: task.title,
          category: task.category,
          dateType: task.dateType,
          typeLabel: task.dateType === 'event' ? 'Event' : 'Submission Deadline',
          dueDate: task.dueDate,
          dueTime: task.dueTime || '',
          isOverdue: isOverdue
        };

        if (isOverdue) {
          overdue.push(itemObj);
        } else {
          upcoming.push(itemObj);
        }
      });
    }

    // 2. Daily Lists with deadlines
    if (Array.isArray(dailyLists)) {
      dailyLists.forEach(list => {
        if (!list.dueDate) return; // Daily lists without deadlines excluded

        const items = Array.isArray(list.items) ? list.items : [];
        const isCompleted = items.length > 0 && items.every(i => Boolean(i.completed));
        if (isCompleted) return; // Completed lists must NEVER appear

        const isOverdue = isDeadlineOverdue(list.dueDate, list.dueTime, false);
        const itemObj = {
          id: list.id,
          source: 'daily',
          title: list.title,
          category: null,
          dateType: 'daily-deadline',
          typeLabel: 'List Deadline',
          dueDate: list.dueDate,
          dueTime: list.dueTime || '',
          isOverdue: isOverdue
        };

        if (isOverdue) {
          overdue.push(itemObj);
        } else {
          upcoming.push(itemObj);
        }
      });
    }

    // Sorting:
    // Overdue: earliest overdue date/time first
    overdue.sort((a, b) => {
      const dCmp = a.dueDate.localeCompare(b.dueDate);
      if (dCmp !== 0) return dCmp;
      return (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59');
    });

    // Upcoming: nearest upcoming date/time first
    upcoming.sort((a, b) => {
      const dCmp = a.dueDate.localeCompare(b.dueDate);
      if (dCmp !== 0) return dCmp;
      return (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59');
    });

    return { overdue, upcoming };
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
   * Main render orchestrator.
   */
  function render() {
    const dailySource = readStorageSource(DAILY_STORAGE_KEY, 'Daily');
    const scholarSource = readStorageSource(SCHOLAR_STORAGE_KEY, 'Scholar');

    const dailyStats = dailySource.isAvailable ? computeDailyStats(dailySource.data) : null;
    const scholarStats = scholarSource.isAvailable ? computeScholarStats(scholarSource.data) : null;

    renderStorageNotice(dailySource, scholarSource);
    renderProgressSection(dailyStats, scholarStats, dailySource.isAvailable, scholarSource.isAvailable);

    const weeklyData = computeWeeklyCompletions(dailySource.data, scholarSource.data);
    renderWeeklyActivity(weeklyData);

    const attentionData = collectAttentionTasks(dailySource.data, scholarSource.data);
    renderAttentionSection(attentionData);
  }

  /**
   * Renders non-destructive storage notice if any source is unreadable.
   */
  function renderStorageNotice(dailySource, scholarSource) {
    const noticeEl = document.getElementById('growth-storage-notice');
    const textEl = document.getElementById('growth-storage-notice-text');
    if (!noticeEl || !textEl) return;

    if (!dailySource.isAvailable && !scholarSource.isAvailable) {
      textEl.textContent = 'Productivity data is currently unavailable from storage. Your original data has been preserved.';
      noticeEl.style.display = 'flex';
    } else if (!dailySource.isAvailable) {
      textEl.textContent = 'Daily productivity data is currently unavailable. Scholar statistics are shown below.';
      noticeEl.style.display = 'flex';
    } else if (!scholarSource.isAvailable) {
      textEl.textContent = 'Scholar academic data is currently unavailable. Daily statistics are shown below.';
      noticeEl.style.display = 'flex';
    } else {
      noticeEl.style.display = 'none';
    }
  }

  /**
   * 1. Renders Your Progress section.
   */
  function renderProgressSection(dailyStats, scholarStats, isDailyAvailable, isScholarAvailable) {
    const overallPctEl = document.getElementById('growth-overall-pct');
    const overallCountsEl = document.getElementById('growth-overall-counts');
    const overallBarEl = document.getElementById('growth-overall-bar');
    const dailyRatioEl = document.getElementById('growth-daily-ratio');
    const scholarRatioEl = document.getElementById('growth-scholar-ratio');

    // Update Daily ratio
    if (dailyRatioEl) {
      if (isDailyAvailable && dailyStats) {
        dailyRatioEl.textContent = `${dailyStats.completedItems} / ${dailyStats.totalItems} completed`;
        dailyRatioEl.classList.remove('text-unavailable');
      } else {
        dailyRatioEl.textContent = 'Data unavailable';
        dailyRatioEl.classList.add('text-unavailable');
      }
    }

    // Update Scholar ratio
    if (scholarRatioEl) {
      if (isScholarAvailable && scholarStats) {
        scholarRatioEl.textContent = `${scholarStats.completedTasks} / ${scholarStats.totalTasks} completed`;
        scholarRatioEl.classList.remove('text-unavailable');
      } else {
        scholarRatioEl.textContent = 'Data unavailable';
        scholarRatioEl.classList.add('text-unavailable');
      }
    }

    // Overall Progress Calculation
    if (overallPctEl && overallCountsEl && overallBarEl) {
      if (isDailyAvailable && isScholarAvailable && dailyStats && scholarStats) {
        const totalUnits = dailyStats.totalItems + scholarStats.totalTasks;
        const completedUnits = dailyStats.completedItems + scholarStats.completedTasks;
        const overallPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;

        overallPctEl.textContent = `${overallPct}%`;
        overallCountsEl.textContent = `${completedUnits} of ${totalUnits} tasks completed`;
        overallBarEl.style.width = `${overallPct}%`;
      } else {
        // Safeguard 2: Halt misleading overall percentage calculation
        overallPctEl.textContent = '--%';
        overallBarEl.style.width = '0%';
        if (!isDailyAvailable && !isScholarAvailable) {
          overallCountsEl.textContent = 'Overall progress unavailable';
        } else if (!isDailyAvailable) {
          overallCountsEl.textContent = 'Overall progress unavailable (Daily unreadable)';
        } else {
          overallCountsEl.textContent = 'Overall progress unavailable (Scholar unreadable)';
        }
      }
    }
  }

  /**
   * 2. Renders Weekly Activity section.
   */
  function renderWeeklyActivity(weeklyData) {
    const barsContainer = document.getElementById('growth-weekly-bars');
    const totalBadge = document.getElementById('growth-week-total-badge');

    if (totalBadge) {
      totalBadge.textContent = `${weeklyData.totalWeekCompleted} completed this week`;
    }

    if (!barsContainer) return;
    barsContainer.innerHTML = '';

    weeklyData.weekDays.forEach(wd => {
      const col = document.createElement('div');
      col.className = `weekly-chart-col ${wd.isToday ? 'is-today' : ''}`;

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

      barsContainer.appendChild(col);
    });
  }

  /**
   * 3. Renders What Needs Your Attention? section.
   */
  function renderAttentionSection(attentionData) {
    const overdueList = document.getElementById('growth-overdue-list');
    const upcomingList = document.getElementById('growth-upcoming-list');
    const overdueBadge = document.getElementById('growth-overdue-count-badge');
    const upcomingBadge = document.getElementById('growth-upcoming-count-badge');

    if (overdueBadge) overdueBadge.textContent = attentionData.overdue.length;
    if (upcomingBadge) upcomingBadge.textContent = attentionData.upcoming.length;

    // Render Overdue Group
    if (overdueList) {
      overdueList.innerHTML = '';
      if (attentionData.overdue.length === 0) {
        overdueList.innerHTML = `
          <div class="attention-empty">
            <p class="text-muted">No overdue tasks. All deadlines are on schedule!</p>
          </div>
        `;
      } else {
        attentionData.overdue.forEach(item => {
          overdueList.appendChild(createAttentionCard(item));
        });
      }
    }

    // Render Upcoming Group
    if (upcomingList) {
      upcomingList.innerHTML = '';
      if (attentionData.upcoming.length === 0) {
        upcomingList.innerHTML = `
          <div class="attention-empty">
            <p class="text-muted">No upcoming deadlines scheduled.</p>
          </div>
        `;
      } else {
        attentionData.upcoming.forEach(item => {
          upcomingList.appendChild(createAttentionCard(item));
        });
      }
    }
  }

  /**
   * Helper to create a single attention item card with reused jump action.
   */
  function createAttentionCard(item) {
    const card = document.createElement('div');
    card.className = `attention-item-card ${item.isOverdue ? 'is-overdue' : ''}`;

    const isDaily = item.source === 'daily';
    const formattedDate = formatFriendlyDeadline(item.dueDate, item.dueTime);

    card.innerHTML = `
      <div class="attention-item-main">
        <div class="attention-item-badges">
          <span class="badge ${isDaily ? 'badge-daily' : 'badge-scholar'}">
            ${isDaily ? 'Daily' : 'Scholar'}
          </span>
          <span class="badge badge-neutral">
            ${escapeHtml(item.typeLabel)}
          </span>
        </div>
        <h4 class="attention-item-title">${escapeHtml(item.title)}</h4>
        <span class="attention-item-date ${item.isOverdue ? 'overdue-text' : ''}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span>${item.isOverdue ? 'Overdue: ' : 'Due: '}${escapeHtml(formattedDate)}</span>
        </span>
      </div>
      <div class="attention-item-actions">
        <button type="button" class="btn btn-sm btn-subtle btn-jump-task" aria-label="Jump to ${isDaily ? 'Daily list' : 'Scholar task'}">
          <span>Jump to ${isDaily ? 'Daily' : 'Scholar'}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>
    `;

    // Reused navigation & highlighting logic
    const jumpBtn = card.querySelector('.btn-jump-task');
    if (jumpBtn) {
      jumpBtn.addEventListener('click', () => {
        jumpToTask(item);
      });
    }

    return card;
  }

  /**
   * Executes navigation and highlights target task card.
   * Reuses existing DaybloomNav, DaybloomScholar, and .highlight-pulse with 0 changes to source files.
   */
  function jumpToTask(item) {
    if (item.source === 'daily') {
      DaybloomNav.switchSection('daily');
      setTimeout(() => {
        const card = document.querySelector(`.todo-list-card[data-list-id="${item.id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('highlight-pulse');
          setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
        }
      }, 100);
    } else {
      DaybloomNav.switchSection('scholar');
      setTimeout(() => {
        if (item.dueDate && typeof DaybloomScholar !== 'undefined' && DaybloomScholar.selectDate) {
          DaybloomScholar.selectDate(item.dueDate);
        }
        const card = document.querySelector(`.scholar-task-card[data-id="${item.id}"]`);
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('highlight-pulse');
          setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
        }
      }, 100);
    }
  }

  return {
    init,
    render,
    computeDailyStats,
    computeScholarStats,
    computeWeeklyCompletions,
    collectAttentionTasks,
    readStorageSource,
    jumpToTask
  };
})();
