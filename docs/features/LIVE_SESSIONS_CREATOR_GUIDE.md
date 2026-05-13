# Live Sessions — Creator's Quick Guide

For teachers / creators who want to run a live class on ExamForge. No engineering knowledge needed.

If you're setting up the platform side (env vars, Zoom marketplace app, 100ms account), read [`LIVE_SESSIONS_SETUP_GUIDE.md`](./LIVE_SESSIONS_SETUP_GUIDE.md) instead.

---

## Three ways to host a live class

You can pick a different one for every session.

| Option                    | Best when                                                                                | What students experience                        |
| ------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **Paste my own URL**      | You already have Google Meet / Teams / personal Zoom and just want to share the link.    | New tab opens to Meet / Teams / Zoom.           |
| **Auto-create with Zoom** | You have a Zoom Pro account and want auto-recording without manual upload.               | New tab opens to Zoom with passcode pre-filled. |
| **Embedded HD video**     | You want students to stay inside ExamForge with platform-managed recording + attendance. | In-app video room — they never leave the app.   |

You'll see all three options on the schedule form, but each one only appears when it's actually available to you (Zoom is visible after you connect your account; embedded is visible if the platform admin has enabled it).

---

## Schedule a session

1. Sidebar → **Live Sessions** → **Schedule new** (or visit `/creator/live-sessions/new`).
2. Fill the basics:
   - **Title** — what students will see in their list.
   - **Description** — optional.
   - **Starts at** — date and time. Heads-up: you can't schedule in the past, and the "Join" button only enables 5 minutes before this time.
   - **Duration** — 5 minutes to 8 hours.
3. Pick a **Meeting source** (see the comparison above). The form remembers your choice from last session if it's still available.
4. (Option C — Embedded only) Toggle recording, chat, and max attendees in the **Embedded room settings** panel.
5. (Optional) **Classroom** — if you bind the session to a classroom, only members of that classroom can join. Leave as _"No classroom — open to all"_ to let any signed-in student attend.
6. (Optional) **Subject** / **Topic** — searchable metadata.
7. **Free for all** is on by default. Untick it to charge a price (note: paid live-session checkout isn't wired up yet — students won't be able to join paid sessions).
8. **Schedule session**.

You'll land back on the list. The new session shows in **Upcoming** with a countdown.

---

## Option B — Connect your Zoom account (one-time)

Skip this section if you're using "Paste my own URL" or "Embedded HD video".

1. Sidebar → **Integrations** (or visit `/creator/integrations`).
2. The **Zoom** card shows **Not connected** + a **Connect Zoom** button.
3. Click **Connect Zoom**. You'll bounce to Zoom's website.
4. Sign in to Zoom (the account whose meetings + recordings you want ExamForge to manage on your behalf).
5. Approve the four permissions Zoom asks about (create meetings, read meetings, read recordings, read your email).
6. Zoom sends you back to ExamForge. You'll see a "Zoom connected" toast and the card flips to **● Connected** with your Zoom email + plan tier.

After this:

- The schedule form now shows the **Auto-create with Zoom** option, and it becomes the default.
- Every session you schedule with this option creates a real meeting in your Zoom account.
- After each meeting ends, Zoom sends the cloud recording back to ExamForge automatically — the **Watch recording** button appears on the History card 5–60 minutes later.

To stop:

- **Reconnect** — re-runs the OAuth dance, useful if Zoom invalidated your token.
- **Disconnect** — wipes the saved tokens. The schedule form's Zoom option disappears until you reconnect.

If you're on Zoom **Basic** (free), you'll see a warning that cloud recording requires Zoom Pro. Sessions still schedule fine, just without auto-recording.

---

## What students see

### List page (`/dashboard/live`)

- **Upcoming** — your session shows here once scheduled, with a countdown.
- **History** — moves here automatically once it ends. Recording link appears once the provider finishes processing (Zoom: 5–60 min; 100ms: a few minutes).

Each card shows a small colored badge for the meeting source:

- 🔵 **Zoom** badge → auto-created via Zoom.
- 🟣 **Embedded** badge → in-app video room.
- (no badge) → paste-URL session.

### Join experience

| Meeting source        | Click "Join" →                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Paste my own URL      | Opens your pasted URL in a new tab.                                                            |
| Auto-create with Zoom | Opens the Zoom join URL in a new tab (passcode is in the URL — no extra step for the student). |
| Embedded HD video     | Loads `/dashboard/live/[id]/room` inside ExamForge — peer grid, mic/camera/leave controls.     |

The Join button is disabled until 5 minutes before the scheduled start time, and stays usable through the session + 30 minutes of grace after the scheduled end.

---

## During a session

### If you used Paste URL or Zoom

You run the meeting in Meet / Zoom / Teams as usual. ExamForge just shows the join link to students and times-out the session after `start + duration + 30 min` grace.

### If you used Embedded HD video

You'll see the in-app room. As the host:

- Your mic + camera are **on by default** so you can start talking immediately.
- Students join **muted by default** — they unmute on demand via the controls (their browser asks for camera/mic permission only at that moment, so students without devices won't see error prompts).
- The participant count badge in the top-right shows how many peers are in the room.
- **Leave** drops you from the room and routes you back to `/dashboard/live`. The session stays live until everyone leaves (or the time-based reaper closes it 30 min after scheduled end).

Students who join with no camera/mic will see a small "listen-only mode" toast — that's expected, they can still see and hear you.

---

## Recordings

| Meeting source        | How the recording appears                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paste my own URL      | You upload it manually: open the session's detail page (`/creator/live-sessions/<id>`) → **Recording** section → paste the URL → **Save**. Works with Google Drive, YouTube unlisted, S3, anywhere with an HTTPS link. |
| Auto-create with Zoom | Zoom sends the cloud recording 5–60 min after the meeting ends. The link shows up automatically on the detail page + History card.                                                                                     |
| Embedded HD video     | 100ms finalizes the recording a few minutes after the last participant leaves. Link shows up automatically.                                                                                                            |

For Zoom/Embedded sessions you can still **paste a manual override URL** in the detail page — useful if the webhook never arrived (rare but possible).

---

## Attendees + watch time

Open `/creator/live-sessions/<id>` → **Attendees** section.

For each student who joined, you see:

- Name + email
- When they joined
- When they left (if known)
- Total watch seconds

For Embedded sessions this is accurate to the moment they joined/left the in-app room. For Paste-URL and Zoom sessions, ExamForge only knows that the student clicked the Join button on our side — we can't see whether they actually stayed in the external meeting, so the watch time is a best-effort estimate based on when they closed the tab.

---

## Common questions

**Q: My session shows "Scheduled" but I'm already running the meeting. Why isn't it "● LIVE"?**

For Paste-URL sessions, the status flips to live the first time a student clicks Join on our side. If you're testing alone and nobody has clicked Join, it'll stay "Scheduled" until the time-based reaper closes it. For Zoom and Embedded, the status flips automatically when the first peer enters.

**Q: I scheduled a session but it's not appearing in the student's list.**

Two likely causes:

1. You bound it to a classroom the student isn't in. Open the detail page, check the classroom field. If you want it open to everyone, edit the row (or re-schedule with no classroom).
2. The scheduled end + 30 min grace already passed — it auto-moved to History.

**Q: Can I edit a session after scheduling?**

Not yet — only **Cancel** is available. To change details, cancel the existing one and create a new one. Cancellation notifies attendees the next time they refresh.

**Q: Can a student attend a Zoom session without a Zoom account?**

Yes — the Zoom URL we generate includes the passcode, so students click and join as guests. No Zoom signup needed.

**Q: Embedded room shows my student in listen-only mode. Did something go wrong?**

No — that's the default for any student without a camera/mic, or who hasn't granted permission yet. They click the mic/camera button when they want to speak, and their browser asks for permission at that moment.

**Q: My Zoom recording never appeared.**

Check three things:

1. Recording was actually enabled in the meeting (Zoom default sometimes is "local recording", which ExamForge can't fetch — set it to "cloud recording" in your Zoom account settings).
2. Your Zoom account is Pro or higher (Basic doesn't include cloud recording).
3. The session is in History (not Upcoming) — recordings only attach after the meeting ends.

If all three check out, you can paste the recording URL manually from your Zoom dashboard into our detail page.

---

## Need help?

- Operator setup questions → [`LIVE_SESSIONS_SETUP_GUIDE.md`](./LIVE_SESSIONS_SETUP_GUIDE.md)
- Why we chose Zoom vs 100ms vs paste-URL → [`LIVE_SESSIONS_OPTION_B_ZOOM.md`](./LIVE_SESSIONS_OPTION_B_ZOOM.md) + [`LIVE_SESSIONS_OPTION_C_EMBEDDED.md`](./LIVE_SESSIONS_OPTION_C_EMBEDDED.md)
- Found a bug → file an issue on the repo with a session id + screenshot.
