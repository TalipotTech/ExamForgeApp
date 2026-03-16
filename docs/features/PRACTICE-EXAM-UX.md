# Practice Exam UX, Quota Tracking & Dashboard Enhancements

## Overview

This feature set improves the practice exam workflow, adds exam generation quota visibility across the platform, enhances the dashboard with My Topics and user activity, and adds site-wide stats to the landing page.

---

## 1. Practice Exam Start/Stop Flow

### Problem

Previously, the practice exam auto-started on page load. Users had no chance to review exam details before beginning, and there was no way to stop an in-progress exam.

### Solution

Introduced a three-state exam flow managed by Zustand store:

**States:** `loading` -> `ready` -> `running` -> `stopped`

- **Ready state:** Shows an exam info card with title, question count, duration, attempt history badges, quota badge, and exam instructions. User clicks "Start Exam" to begin.
- **Running state:** Full exam UI with timer, question navigation, a red "Stop" button in the header, and Submit button. The "My Exams" button is visible but disabled during the exam.
- **Stopped state:** Shows "Exam Stopped" card explaining progress was not saved, with the count of questions answered before stopping. User can "Retake Exam" (resets to ready state) or navigate to "My Exams".

### Files Changed

- `apps/web/src/stores/practice-exam-store.ts` — Added `examStatus` field, `startExam()`, `stopExam()` actions. Timer only ticks when status is `running`. `setSession()` sets status to `ready` instead of auto-running.
- `apps/web/src/app/(exam)/practice/[examId]/page.tsx` — Rewrote to render different UIs based on `examStatus`. Added Start/Stop buttons, My Exams navigation (disabled during exam), attempt/quota badges.

---

## 2. Per-Exam Attempt Counter & Score Badges

### Problem

Users couldn't easily see how many times they'd taken each exam or their best score at a glance, leading to unnecessary retakes.

### Solution

Added colored badges to exam cards and the practice page:

- **My Exams page:** Each exam card shows `"3x taken · 85%"` badge next to the title.
  - Green badge: best score >= 80%
  - Amber badge: best score >= 60%
  - Default/outline: score < 60% or no attempts
  - `"Not attempted"` badge for untaken exams
- **Practice page (ready state):** Shows attempt count and best score badges under the exam title.

### Backend Change

- `apps/api/src/trpc/routers/tutorial-agent.ts` — `startUserExam` query now returns `timesAttempted` and `bestScore` fields so the practice page can display attempt history without an extra API call.

### Files Changed

- `apps/web/src/app/(dashboard)/dashboard/my-exams/page.tsx` — Enhanced exam cards with attempt/score badges.
- `apps/web/src/app/(exam)/practice/[examId]/page.tsx` — Shows attempt/score badges in ready state.

---

## 3. Global Exam Generation Quota Badge

### Problem

Users had no visibility into how many exam generations they'd used against their plan limit until they hit the limit and got an error. This caused confusion, especially when switching plans.

### Solution

Added quota visibility (`used/limit`) across all exam-related pages:

### My Exams Page

- **Header badge:** `"5/20 generated (Pro)"` with color coding:
  - Default: well within limits
  - Amber border: near limit (within 2 of max)
  - Red (destructive): limit exhausted, plus an "Upgrade" button
- **Progress bar:** Visual bar below the header showing quota usage percentage
- **Footer text:** `"5 of 20 exam generations used this month on Pro plan"`

### Practice Page (Ready State)

- Compact quota badge: `"5/20 generated (Pro)"` shown alongside attempt badges

### Dashboard

- **My Exams quick action card:** Compact `"5/20"` badge next to "My Exams" title

### Files Changed

- `apps/web/src/app/(dashboard)/dashboard/my-exams/page.tsx` — Added quota query, header badge, progress bar, quota text.
- `apps/web/src/app/(exam)/practice/[examId]/page.tsx` — Added quota query and badge in ready state.
- `apps/web/src/app/(dashboard)/dashboard/page.tsx` — Added quota query and badge on My Exams card.

---

## 4. Dashboard: My Topics Section & User Activity

### Problem

The dashboard lacked a "My Topics" section and any user activity/visit information.

### Solution

### My Topics

- Added "My Topics" quick action card in the dashboard grid (with topic count badge)
- Added "My Topics" card in the three-column bottom section showing the 6 most recently studied topics with:
  - Topic title and syllabus name
  - Completion percentage badge
  - Last read date
  - Progress bar (teal colored)
  - "View All" link to `/dashboard/topics`

### User Activity Card

- Shows 4 stats in a grid:
  - **Total Visits:** Login count from the `users` table
  - **Last Login:** Timestamp of last login
  - **Current Device:** Detected client-side from `navigator.userAgent` (e.g., "Windows PC / Chrome")
  - **Last IP Address:** From the `users.last_login_ip` field

### Backend Changes

- `apps/api/src/trpc/routers/learn.ts` — Extended `getDashboardData` to return:
  - `recentTopics` — 6 most recent topics from `tutorial_progress`
  - `totalTopics` — count of distinct topics studied
  - `userActivity` — `lastLoginAt`, `lastLoginIp`, `loginCount` from `users` table
  - Added `users` import to the router

### Files Changed

- `apps/api/src/trpc/routers/learn.ts` — Extended `getDashboardData` query.
- `apps/web/src/app/(dashboard)/dashboard/page.tsx` — Added My Topics card, User Activity card, quota badge on My Exams card. Changed bottom section from 2-column to 3-column grid.

---

## 5. Landing Page: Site Stats

### Problem

The landing page had no social proof or platform statistics.

### Solution

Added a stats section below the hero showing 4 key metrics:

- **Registered Users** — Count from `users` table
- **Questions** — Count from `questions` table
- **Topics** — Count of distinct topics with current tutorials
- **Total Visits** — Sum of all user `login_count` values

Numbers auto-format with K/M suffixes for large values. Section is hidden if all stats are zero.

### Backend Changes

- `apps/api/src/trpc/routers/public-content.ts` — Added `getSiteStats` public procedure (no auth required). Added `users` and `questions` imports.

### Frontend Changes

- `apps/web/src/components/home/site-stats.tsx` — New client component using `trpc.publicContent.getSiteStats` with 10-minute stale time.
- `apps/web/src/app/page.tsx` — Imported and rendered `SiteStats` between hero and ExaminationList.

---

## Architecture Notes

### State Management

- Practice exam state uses Zustand (`practice-exam-store.ts`) with a clear state machine pattern: `loading -> ready -> running -> stopped`
- Timer only runs in `running` state, preventing time waste during the ready/stopped states

### Quota Data Flow

- Backend: `checkExamQuota()` in `subscription-guard.ts` returns `{ allowed, used, limit, planName }`
- Frontend: `trpc.tutorialAgent.getExamQuota` is queried with 30-60s stale time across pages
- Color coding is consistent: default (safe) -> amber (near limit) -> red (exhausted)

### Performance

- Quota queries use `staleTime` caching (30s-60s) to avoid excessive API calls
- Dashboard data cached for 2 minutes
- Site stats cached for 10 minutes (public, changes slowly)
- Device/browser detection runs client-side only (no server call needed)
