import { useState, useEffect, useCallback, useRef } from "react";

// ─── Mock Data ───
const EXAM_CATEGORIES = [
  { id: "pharmacy", label: "Pharmacy", color: "#6366f1", icon: "💊" },
  { id: "medical", label: "Medical", color: "#ef4444", icon: "🏥" },
  { id: "civil_services", label: "Civil Services", color: "#f59e0b", icon: "🏛️" },
  { id: "state_psc", label: "State PSC", color: "#10b981", icon: "📋" },
  { id: "engineering", label: "Engineering", color: "#8b5cf6", icon: "⚙️" },
];

const AI_PROVIDERS = [
  { id: "auto", name: "Auto (Cheapest)", icon: "🔄" },
  { id: "claude", name: "Claude", icon: "🟠" },
  { id: "gemini", name: "Gemini", icon: "🔵" },
  { id: "openai", name: "OpenAI", icon: "🟢" },
  { id: "mistral", name: "Mistral", icon: "🟡" },
];

const SOURCE_TYPES = ["Question Bank", "Previous Year Papers", "Mock Tests", "Syllabus", "Notes"];
const FREQUENCIES = ["Manual Only", "Daily", "Weekly", "Monthly"];

const MOCK_SOURCES = [
  { id: "1", name: "PharmQuiz Daily MCQs", url: "https://pharmaquiz.net/bpharm-mcqs", exam: "BPharm Asst Prof", type: "Question Bank", status: "active", lastScraped: "2 hours ago", questions: 342, frequency: "Daily", provider: "claude", runs: 28, successRate: 96 },
  { id: "2", name: "GPAT Previous Papers", url: "https://gpatprep.com/papers", exam: "GPAT 2026", type: "Previous Year Papers", status: "active", lastScraped: "1 day ago", questions: 1240, frequency: "Weekly", provider: "auto", runs: 12, successRate: 100 },
  { id: "3", name: "NTA Question Bank", url: "https://nta.ac.in/questionbank", exam: "NEET UG", type: "Question Bank", status: "paused", lastScraped: "5 days ago", questions: 890, frequency: "Weekly", provider: "gemini", runs: 8, successRate: 87 },
  { id: "4", name: "Kerala PSC Archives", url: "https://keralapsc.gov.in/previous", exam: "Kerala PSC", type: "Previous Year Papers", status: "active", lastScraped: "12 hours ago", questions: 2100, frequency: "Daily", provider: "claude", runs: 45, successRate: 98 },
  { id: "5", name: "MedMCQ Repository", url: "https://medmcq.in/pharmacology", exam: "NEET PG", type: "Mock Tests", status: "error", lastScraped: "3 days ago", questions: 560, frequency: "Weekly", provider: "openai", runs: 6, successRate: 67 },
  { id: "6", name: "Testbook Pharmacy", url: "https://testbook.com/pharmacy-quiz", exam: "GPAT 2026", type: "Question Bank", status: "pending", lastScraped: "Never", questions: 0, frequency: "Manual Only", provider: "auto", runs: 0, successRate: 0 },
];

const MOCK_EXAMS = [
  { id: "1", name: "NEET UG 2026", body: "NTA", category: "medical", level: "national", status: "upcoming", date: "2026-05-03", regEnd: "2026-03-20", questions: 4200, featured: true, tags: ["medical", "biology", "chemistry", "physics"], eligibility: "12th pass with PCB, 50% marks", pattern: { marks: 720, duration: 200, negative: true }, popularity: 98 },
  { id: "2", name: "BPharm Assistant Professor 2026", body: "Kerala PSC", category: "pharmacy", level: "state", status: "upcoming", date: "2026-06-15", regEnd: "2026-04-10", questions: 2800, featured: true, tags: ["pharmacy", "assistant professor", "kerala"], eligibility: "MPharm with 55% marks", pattern: { marks: 100, duration: 75, negative: true }, popularity: 85 },
  { id: "3", name: "GPAT 2026", body: "NTA", category: "pharmacy", level: "national", status: "upcoming", date: "2026-03-22", regEnd: "2026-02-28", questions: 1800, featured: true, tags: ["pharmacy", "gpat", "postgraduate"], eligibility: "BPharm 4-year degree", pattern: { marks: 500, duration: 180, negative: true }, popularity: 76 },
  { id: "4", name: "UPSC CSE Prelims 2026", body: "UPSC", category: "civil_services", level: "national", status: "upcoming", date: "2026-06-01", regEnd: "2026-03-15", questions: 3500, featured: false, tags: ["upsc", "civil services", "prelims", "ias"], eligibility: "Graduate in any discipline", pattern: { marks: 400, duration: 120, negative: true }, popularity: 95 },
  { id: "5", name: "NEET PG 2026", body: "NBEMS", category: "medical", level: "national", status: "upcoming", date: "2026-04-20", regEnd: "2026-03-05", questions: 2200, featured: false, tags: ["medical", "postgraduate", "neet pg"], eligibility: "MBBS degree with internship", pattern: { marks: 800, duration: 210, negative: true }, popularity: 88 },
  { id: "6", name: "GATE 2026 — Pharmacy", body: "IIT Roorkee", category: "engineering", level: "national", status: "upcoming", date: "2026-02-08", regEnd: "2026-01-15", questions: 950, featured: false, tags: ["gate", "pharmacy", "engineering"], eligibility: "BPharm or equivalent", pattern: { marks: 100, duration: 180, negative: true }, popularity: 72 },
  { id: "7", name: "Kerala PSC Pharmacist Gr II", body: "Kerala PSC", category: "state_psc", level: "state", status: "active", date: "2026-04-05", regEnd: null, questions: 1100, featured: false, tags: ["kerala", "pharmacist", "grade 2"], eligibility: "DPharm registered", pattern: { marks: 100, duration: 75, negative: false }, popularity: 65 },
  { id: "8", name: "TNPSC Assistant Professor", body: "TNPSC", category: "state_psc", level: "state", status: "upcoming", date: "2026-07-20", regEnd: "2026-05-01", questions: 400, featured: false, tags: ["tnpsc", "assistant professor", "tamil nadu"], eligibility: "MPharm/PhD with NET", pattern: { marks: 200, duration: 180, negative: false }, popularity: 58 },
  { id: "9", name: "FMGE December 2025", body: "NBEMS", category: "medical", level: "national", status: "past", date: "2025-12-10", regEnd: null, questions: 1600, featured: false, tags: ["fmge", "medical", "foreign graduate"], eligibility: "Foreign medical graduate", pattern: { marks: 300, duration: 150, negative: false }, popularity: 70 },
  { id: "10", name: "UGC NET Pharmaceutical Sciences", body: "NTA", category: "pharmacy", level: "national", status: "upcoming", date: "2026-06-25", regEnd: "2026-04-15", questions: 750, featured: false, tags: ["ugc net", "pharmacy", "lecturership"], eligibility: "MPharm or equivalent", pattern: { marks: 300, duration: 180, negative: false }, popularity: 62 },
];

const SCRAPE_LOG = [
  { time: "14:32:05", source: "PharmQuiz Daily MCQs", msg: "Scraped page 3/5 — found 12 new questions", type: "success" },
  { time: "14:31:48", source: "PharmQuiz Daily MCQs", msg: "Extracting questions via Claude...", type: "info" },
  { time: "14:31:30", source: "Kerala PSC Archives", msg: "Completed — 28 new questions added", type: "success" },
  { time: "14:30:15", source: "MedMCQ Repository", msg: "Error: 403 Forbidden on page 2. Retrying...", type: "error" },
  { time: "14:28:00", source: "Discovery Agent", msg: "Found new notification: NEET UG 2026 admit card date announced", type: "info" },
  { time: "14:25:33", source: "Kerala PSC Archives", msg: "Scraping started — 4 pages queued", type: "info" },
];

// ─── Helpers ───
const daysUntil = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  return diff;
};

const statusColor = (s) => ({ active: "#10b981", upcoming: "#6366f1", past: "#64748b", paused: "#f59e0b", error: "#ef4444", pending: "#94a3b8", draft: "#94a3b8" })[s] || "#94a3b8";

// ─── Shared Styles ───
const card = { background: "linear-gradient(135deg, rgba(22,28,45,0.95), rgba(15,20,35,0.98))", border: "1px solid #1e293b", borderRadius: 14, padding: 20, transition: "all 0.25s ease" };
const input = { background: "#0c1222", border: "1px solid #253049", borderRadius: 10, color: "#e2e8f0", padding: "10px 14px", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" };
const label = { fontSize: 11, color: "#7a8baa", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", display: "block", marginBottom: 6 };
const btn = (c = "#6366f1") => ({ background: `linear-gradient(135deg, ${c}, ${c}cc)`, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3 });
const badge = (c) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}30`, letterSpacing: 0.3 });

// ─── Main App ───
export default function ExamDiscoveryApp() {
  const [page, setPage] = useState("exams"); // exams | scraper | addSource
  const [notification, setNotification] = useState(null);

  const notify = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const nav = [
    { id: "exams", label: "Exam Catalog", icon: "🎯" },
    { id: "scraper", label: "Scraper Manager", icon: "🕷️" },
    { id: "addSource", label: "Add Source", icon: "➕" },
  ];

  return (
    <div style={{ fontFamily: "'Outfit', 'DM Sans', sans-serif", background: "#080c18", color: "#c8d6e5", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Ambient bg */}
      <div style={{ position: "fixed", top: -300, right: -200, width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -400, left: -100, width: 900, height: 900, borderRadius: "50%", background: "radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 60%)", pointerEvents: "none" }} />

      {notification && (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000, padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 500, background: "linear-gradient(135deg, #065f46, #047857)", color: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", animation: "slideIn 0.3s ease", border: "1px solid #10b98133" }}>
          {notification}
        </div>
      )}

      {/* Top Bar */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "1px solid #151d30", background: "rgba(8,12,24,0.9)", backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>📝</div>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>ExamForge</span>
            <span style={{ fontSize: 9, color: "#6366f1", fontWeight: 600, letterSpacing: 2, marginLeft: 8, textTransform: "uppercase" }}>Discovery & Scraper</span>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {nav.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              padding: "8px 16px", borderRadius: 8, border: page === n.id ? "1px solid #6366f140" : "1px solid transparent",
              background: page === n.id ? "rgba(99,102,241,0.1)" : "transparent",
              color: page === n.id ? "#e2e8f0" : "#64748b", fontSize: 12, fontWeight: 500,
              cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6
            }}>
              <span style={{ fontSize: 14 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ padding: "24px 28px", maxWidth: 1280, margin: "0 auto" }}>
        {page === "exams" && <ExamCatalog />}
        {page === "scraper" && <ScraperManager notify={notify} setPage={setPage} />}
        {page === "addSource" && <AddSource notify={notify} setPage={setPage} />}
      </main>

      <style>{`
        @keyframes slideIn { from { transform: translateX(100px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        @keyframes fadeUp { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }
        * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: #253049 transparent; }
        input:focus, select:focus, textarea:focus { border-color: #6366f1 !important; box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }
        ::placeholder { color: #3d4f6f; }
      `}</style>
    </div>
  );
}

// ──────────────────────────────────────────────
// EXAM CATALOG (Public Listing)
// ──────────────────────────────────────────────
function ExamCatalog() {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("date");

  const toggleCat = (c) => setCatFilter(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const filtered = MOCK_EXAMS.filter(e => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.body.toLowerCase().includes(search.toLowerCase()) && !e.tags.some(t => t.includes(search.toLowerCase()))) return false;
    if (catFilter.length > 0 && !catFilter.includes(e.category)) return false;
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "date") return new Date(a.date) - new Date(b.date);
    if (sort === "popularity") return b.popularity - a.popularity;
    if (sort === "questions") return b.questions - a.questions;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      {/* Featured Banner */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: -0.5 }}>Exam Catalog</h1>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          {MOCK_EXAMS.length} exams tracked • {MOCK_EXAMS.filter(e => e.status === "upcoming").length} upcoming • {MOCK_EXAMS.reduce((a, e) => a + e.questions, 0).toLocaleString()} questions available
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24 }}>
        {/* Filter Sidebar */}
        <div>
          <div style={{ ...card, position: "sticky", top: 80 }}>
            <div style={label}>Search</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Exam name, keyword..." style={{ ...input, marginBottom: 18 }} />

            <div style={label}>Category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
              {EXAM_CATEGORIES.map(c => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: catFilter.includes(c.id) ? "#e2e8f0" : "#64748b" }}>
                  <input type="checkbox" checked={catFilter.includes(c.id)} onChange={() => toggleCat(c.id)}
                    style={{ accentColor: c.color, width: 14, height: 14 }} />
                  <span>{c.icon}</span> {c.label}
                </label>
              ))}
            </div>

            <div style={label}>Status</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 18 }}>
              {["all", "upcoming", "active", "past"].map(s => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: statusFilter === s ? "#e2e8f0" : "#64748b" }}>
                  <input type="radio" name="status" checked={statusFilter === s} onChange={() => setStatusFilter(s)}
                    style={{ accentColor: "#6366f1", width: 14, height: 14 }} />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </label>
              ))}
            </div>

            <div style={label}>Sort By</div>
            <select value={sort} onChange={e => setSort(e.target.value)} style={input}>
              <option value="date">Exam Date</option>
              <option value="popularity">Popularity</option>
              <option value="questions">Questions Available</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Exam Cards Grid */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ ...card, textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#94a3b8" }}>No exams match your filters</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Try adjusting your search or filters</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {filtered.map((exam, i) => {
                const days = daysUntil(exam.date);
                const catInfo = EXAM_CATEGORIES.find(c => c.id === exam.category);
                return (
                  <div key={exam.id} style={{
                    ...card, cursor: "pointer", position: "relative", overflow: "hidden",
                    animation: `fadeUp ${0.3 + i * 0.05}s ease`,
                    borderColor: exam.featured ? "#6366f130" : "#1e293b",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#6366f150"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = exam.featured ? "#6366f130" : "#1e293b"; e.currentTarget.style.transform = "none"; }}
                  >
                    {exam.featured && (
                      <div style={{ position: "absolute", top: 10, right: 10, fontSize: 8, fontWeight: 700, color: "#fbbf24", background: "#fbbf2415", padding: "2px 8px", borderRadius: 4, letterSpacing: 1, textTransform: "uppercase", border: "1px solid #fbbf2430" }}>★ Featured</div>
                    )}

                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <span style={badge(catInfo?.color || "#6366f1")}>{catInfo?.icon} {catInfo?.label}</span>
                      <span style={badge(statusColor(exam.status))}>{exam.status}</span>
                      <span style={badge("#94a3b8")}>{exam.level}</span>
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 4, lineHeight: 1.3, letterSpacing: -0.2 }}>{exam.name}</div>
                    <div style={{ fontSize: 12, color: "#7a8baa", marginBottom: 12 }}>{exam.body}</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                      <div style={{ background: "#0c1222", borderRadius: 8, padding: "8px 10px", border: "1px solid #1a2540" }}>
                        <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>Exam Date</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: days > 0 ? "#e2e8f0" : "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>
                          {new Date(exam.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div style={{ background: "#0c1222", borderRadius: 8, padding: "8px 10px", border: "1px solid #1a2540" }}>
                        <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {days > 0 ? "Countdown" : "Status"}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: days > 0 && days <= 30 ? "#f59e0b" : days > 0 ? "#10b981" : "#64748b" }}>
                          {days > 0 ? `${days} days left` : "Completed"}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", gap: 12 }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>📚 <strong style={{ color: "#94a3b8" }}>{exam.questions.toLocaleString()}</strong> Qs</span>
                        {exam.pattern.negative && <span style={{ fontSize: 11, color: "#ef4444" }}>⊖ Negative</span>}
                      </div>
                      <button style={{ ...btn("#6366f1"), padding: "7px 14px", fontSize: 11 }}>Start Practice →</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// SCRAPER MANAGER (Admin)
// ──────────────────────────────────────────────
function ScraperManager({ notify, setPage }) {
  const [sources] = useState(MOCK_SOURCES);
  const [filter, setFilter] = useState("all");
  const [scraping, setScraping] = useState(null);

  const stats = {
    total: sources.length,
    active: sources.filter(s => s.status === "active").length,
    questions: sources.reduce((a, s) => a + s.questions, 0),
    today: 83,
  };

  const handleScrape = (src) => {
    setScraping(src.id);
    notify(`Scraping started: ${src.name}`);
    setTimeout(() => { setScraping(null); notify(`${src.name}: 15 new questions found!`); }, 3000);
  };

  const filtered = sources.filter(s => filter === "all" || s.status === filter);

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Scraper Manager</h1>
          <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Manage question sources and monitor scraping activity</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => notify("Discovery agent running...")} style={{ ...btn("#10b981"), display: "flex", alignItems: "center", gap: 6 }}>🔍 Run Discovery Agent</button>
          <button onClick={() => setPage("addSource")} style={{ ...btn("#6366f1"), display: "flex", alignItems: "center", gap: 6 }}>➕ Add Source</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Sources", value: stats.total, color: "#6366f1", icon: "🌐" },
          { label: "Active Sources", value: stats.active, color: "#10b981", icon: "✓" },
          { label: "Total Questions", value: stats.questions.toLocaleString(), color: "#f59e0b", icon: "📚" },
          { label: "Today's Yield", value: `+${stats.today}`, color: "#8b5cf6", icon: "📈" },
        ].map((s, i) => (
          <div key={i} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 10, color: "#64748b", fontWeight: 500, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: -1 }}>{s.value}</div>
              </div>
              <span style={{ fontSize: 24 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {["all", "active", "paused", "error", "pending"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "6px 14px", borderRadius: 6, border: filter === f ? "1px solid #6366f140" : "1px solid #1e293b",
            background: filter === f ? "rgba(99,102,241,0.1)" : "transparent",
            color: filter === f ? "#e2e8f0" : "#64748b", fontSize: 11, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize"
          }}>
            {f === "all" ? `All (${sources.length})` : `${f} (${sources.filter(s => s.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Sources Table */}
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {["Source", "Exam", "Type", "Status", "Last Scraped", "Questions", "Success", "Actions"].map(h => (
                <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: "#64748b", fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((src, i) => (
              <tr key={src.id} style={{ borderBottom: "1px solid #111827", background: i % 2 === 0 ? "transparent" : "#0a0f1f" }}>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 2 }}>{src.name}</div>
                  <div style={{ fontSize: 10, color: "#475569", fontFamily: "'JetBrains Mono', monospace" }}>{src.url.replace("https://", "").substring(0, 35)}</div>
                </td>
                <td style={{ padding: "12px 14px", color: "#94a3b8" }}>{src.exam}</td>
                <td style={{ padding: "12px 14px" }}><span style={badge("#6366f1")}>{src.type}</span></td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor(src.status), animation: src.status === "active" ? "pulse 2s infinite" : "none" }} />
                    <span style={{ color: statusColor(src.status), fontWeight: 500, textTransform: "capitalize" }}>{src.status}</span>
                  </span>
                </td>
                <td style={{ padding: "12px 14px", color: "#7a8baa", fontSize: 11 }}>{src.lastScraped}</td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ fontWeight: 600, color: "#e2e8f0", fontFamily: "'JetBrains Mono', monospace" }}>{src.questions.toLocaleString()}</span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span style={{ color: src.successRate >= 90 ? "#10b981" : src.successRate >= 70 ? "#f59e0b" : "#ef4444", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>
                    {src.successRate}%
                  </span>
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => handleScrape(src)} disabled={scraping === src.id} style={{
                      ...btn("#6366f1"), padding: "5px 10px", fontSize: 10, opacity: scraping === src.id ? 0.5 : 1
                    }}>
                      {scraping === src.id ? "⟳" : "▶"} Scrape
                    </button>
                    <button style={{ ...btn("#1e293b"), padding: "5px 10px", fontSize: 10, color: "#94a3b8", border: "1px solid #253049" }}>
                      {src.status === "paused" ? "▶ Resume" : "⏸ Pause"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scrape Log */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />
          Live Scrape Log
        </div>
        <div style={{ background: "#060a14", borderRadius: 8, padding: 12, maxHeight: 180, overflowY: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, border: "1px solid #111827" }}>
          {SCRAPE_LOG.map((log, i) => (
            <div key={i} style={{ marginBottom: 5, color: log.type === "success" ? "#10b981" : log.type === "error" ? "#ef4444" : "#7a8baa" }}>
              <span style={{ color: "#3d4f6f" }}>[{log.time}]</span>{" "}
              <span style={{ color: "#6366f1" }}>{log.source}</span>{" "}
              {log.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// ADD SOURCE FORM
// ──────────────────────────────────────────────
function AddSource({ notify, setPage }) {
  const [form, setForm] = useState({
    name: "", url: "", sourceType: "Question Bank", exam: "",
    frequency: "Manual Only", depth: 1, format: "html",
    provider: "auto", notes: ""
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleTest = () => {
    if (!form.url) return;
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTesting(false);
      setTestResult({
        questionsFound: 8,
        pageTitle: "PharmQuiz — BPharm MCQs Collection",
        preview: [
          { q: "Which drug is a selective COX-2 inhibitor?", options: ["Aspirin", "Celecoxib", "Ibuprofen", "Diclofenac"], answer: 1 },
          { q: "The Henderson-Hasselbalch equation is used to calculate:", options: ["pH", "pKa", "Buffer capacity", "Drug ionization"], answer: 0 },
          { q: "Which is NOT a natural polymer used in drug delivery?", options: ["Chitosan", "PLGA", "Alginate", "Gelatin"], answer: 1 },
        ],
        suggestedType: "Question Bank",
        suggestedExam: "BPharm Assistant Professor",
      });
    }, 2500);
  };

  const handleSave = () => {
    if (!form.name || !form.url) { notify("Name and URL are required"); return; }
    notify(`Source "${form.name}" saved and activated!`);
    setPage("scraper");
  };

  return (
    <div style={{ animation: "fadeUp 0.4s ease", maxWidth: 880, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setPage("scraper")} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: 12, fontFamily: "inherit", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
          ← Back to Scraper Manager
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Add New Source</h1>
        <p style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Configure a website to automatically scrape exam questions</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
        {/* Form */}
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={label}>Source Name *</div>
              <input value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g., PharmQuiz Daily MCQs" style={input} />
            </div>
            <div>
              <div style={label}>Target Exam</div>
              <select value={form.exam} onChange={e => update("exam", e.target.value)} style={input}>
                <option value="">Auto-detect</option>
                <option>BPharm Asst Prof 2026</option>
                <option>GPAT 2026</option>
                <option>NEET UG 2026</option>
                <option>Kerala PSC Pharmacist</option>
                <option>UPSC CSE 2026</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={label}>Website URL *</div>
            <input value={form.url} onChange={e => update("url", e.target.value)} placeholder="https://pharmaquiz.net/bpharm-mcqs" style={input} type="url" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={label}>Source Type</div>
              <select value={form.sourceType} onChange={e => update("sourceType", e.target.value)} style={input}>
                {SOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={label}>Scrape Frequency</div>
              <select value={form.frequency} onChange={e => update("frequency", e.target.value)} style={input}>
                {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <div style={label}>Scrape Depth (pages)</div>
              <input type="number" value={form.depth} onChange={e => update("depth", +e.target.value)} min={1} max={10} style={input} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={label}>Content Format</div>
              <select value={form.format} onChange={e => update("format", e.target.value)} style={input}>
                <option value="html">HTML Pages</option>
                <option value="pdf">PDF Downloads</option>
                <option value="image">Images (Scanned)</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <div style={label}>AI Provider for Extraction</div>
              <select value={form.provider} onChange={e => update("provider", e.target.value)} style={input}>
                {AI_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={label}>Notes / Special Instructions</div>
            <textarea value={form.notes} onChange={e => update("notes", e.target.value)}
              placeholder="e.g., 'Questions are behind /mcq/ path. Skip advertisement sections. Focus on pharmacology section.'"
              rows={3} style={{ ...input, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleTest} disabled={!form.url || testing} style={{ ...btn("#f59e0b"), opacity: !form.url || testing ? 0.5 : 1, display: "flex", alignItems: "center", gap: 6 }}>
              {testing ? <><span style={{ display: "inline-block", animation: "pulse 1s infinite" }}>⟳</span> Testing...</> : "🧪 Test Scrape"}
            </button>
            <button onClick={handleSave} style={btn("#6366f1")}>💾 Save & Activate</button>
            <button onClick={handleSave} style={{ ...btn("#1e293b"), color: "#94a3b8", border: "1px solid #253049" }}>Save as Draft</button>
          </div>
        </div>

        {/* Right Panel — Info + Test Results */}
        <div>
          <div style={{ ...card, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f1f5f9", marginBottom: 10 }}>How It Works</div>
            {[
              { step: "1", text: "Enter the URL of a question bank or exam prep site" },
              { step: "2", text: "Click 'Test Scrape' to preview what the AI can extract" },
              { step: "3", text: "Configure frequency for automatic scraping" },
              { step: "4", text: "AI extracts, validates, and deduplicates questions" },
              { step: "5", text: "Questions appear in your Question Bank automatically" },
            ].map(s => (
              <div key={s.step} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#6366f115", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#6366f1", fontWeight: 700, flexShrink: 0, border: "1px solid #6366f130" }}>{s.step}</span>
                <span style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{s.text}</span>
              </div>
            ))}
          </div>

          {/* Test Results */}
          {testResult && (
            <div style={{ ...card, border: "1px solid #10b98130", background: "linear-gradient(135deg, rgba(16,185,129,0.05), rgba(15,20,35,0.98))" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#10b981", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                ✓ Test Successful
              </div>
              <div style={{ fontSize: 11, color: "#7a8baa", marginBottom: 10 }}>
                Found <strong style={{ color: "#e2e8f0" }}>{testResult.questionsFound} questions</strong> on this page
              </div>
              {testResult.suggestedExam && (
                <div style={{ fontSize: 11, color: "#7a8baa", marginBottom: 12 }}>
                  Detected: <span style={badge("#6366f1")}>{testResult.suggestedExam}</span>
                </div>
              )}
              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Preview (3 of {testResult.questionsFound})</div>
              {testResult.preview.map((q, i) => (
                <div key={i} style={{ background: "#060a14", borderRadius: 8, padding: 10, marginBottom: 6, border: "1px solid #111827" }}>
                  <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 6, fontWeight: 500 }}>{q.q}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    {q.options.map((o, j) => (
                      <div key={j} style={{ fontSize: 10, color: j === q.answer ? "#10b981" : "#64748b", fontWeight: j === q.answer ? 600 : 400 }}>
                        {String.fromCharCode(65 + j)}) {o} {j === q.answer && "✓"}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {testing && (
            <div style={{ ...card, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8, animation: "pulse 1.5s infinite" }}>🕷️</div>
              <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500 }}>Scraping & Extracting...</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Fetching page → AI extraction → Validating</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
