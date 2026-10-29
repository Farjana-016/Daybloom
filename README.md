# Daybloom

A clean, minimal, responsive personal productivity web application built with vanilla HTML, CSS, and JavaScript.

## Overview

Daybloom is designed around four key pillars:
1. **Daily** — Personal, everyday tasks and habit tracking.
2. **Scholar** — Academic coursework deadlines, exams, and class schedules.
3. **Growth** — Productivity statistics, streak consistency, and progress metrics.
4. **Reflect** — Mindful daily journaling and mood tracking.

## Architecture & Design

- **Client-only**: Runs entirely in the browser without login, registration, email, backend, or external databases.
- **Modern Minimalist Visuals**: Clean white/light theme with understated pastel accents (Blue for Daily, Purple for Scholar, Green for Growth, Pink for Reflect).
- **Responsive Layout**: Dedicated sticky sidebar on desktop; compact header and fixed bottom navigation bar on mobile and tablet devices.
- **Persistence**: Built to leverage browser `localStorage` for offline-first personal productivity.

## Project Structure

```
Daybloom/
│
├── index.html          # Core application shell and semantic view markup
│
├── css/
│   ├── variables.css   # Reusable design tokens (colors, spacing, typography)
│   ├── base.css        # CSS reset, base typography, and accessibility outlines
│   ├── layout.css      # Desktop sidebar, header, and mobile navigation
│   └── components.css # Pillar cards, placeholder modules, and badges
│
└── js/
    ├── navigation.js   # Client-side tab switching and URL hash routing
    └── app.js          # App initialization and dynamic date displays
```

## How to Run

No build step or Node.js required. Simply open `index.html` in any web browser, or serve it locally:

```powershell
python -m http.server 8000
```
Then navigate to `http://localhost:8000`.
