# CourseEngine — React + Redux Frontend

A full React + Redux + Tailwind CSS conversion of the CourseEngine AI learning platform.

## Stack

- **React 18** + **React Router 6** for routing
- **Redux Toolkit** for state management
- **Tailwind CSS v3** for styling (matching original design tokens exactly)
- **Vite** for dev server and bundling
- **marked** for Markdown rendering
- **KaTeX** for LaTeX math rendering

## Project Structure

```
src/
  api/              # API fetch functions (courses.js, generate.js)
  store/            # Redux slices
    index.js          # Store configuration
    dashboardSlice.js # Courses list state
    courseSlice.js    # Active course + navigation state
    generationSlice.js# SSE generation job state + thunk
    uiSlice.js        # Toast + modal state
  components/       # Reusable UI components
    Toast.jsx
    DashboardNav.jsx
    StatCards.jsx
    CourseCard.jsx
    CreateCourseModal.jsx
    CourseSidebar.jsx
    ViewerTopBar.jsx
    VideoBar.jsx
    SlideView.jsx
    RefsPanel.jsx
  pages/            # Route-level page components
    Dashboard.jsx
    GeneratingView.jsx
    CourseViewer.jsx
  App.jsx           # Router setup
  main.jsx          # Entry point
  index.css         # Tailwind + slide body markdown styles
```

## Setup

```bash
npm install
npm run dev
```

The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`.  
Change the target in `vite.config.js` if your backend runs on a different port.

## API Endpoints Expected

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/courses` | List all courses |
| GET | `/api/course/:id` | Get full course with modules/slides |
| POST | `/api/generate` | Start generation job → `{ job_id }` |
| GET | `/api/status/:jobId` | SSE stream: `log`, `complete`, `error` events |

## SSE Events (generation stream)

```
event: log      data: { "message": "..." }
event: complete data: { "course_id": "..." }
event: error    data: { "error": "..." }
```
