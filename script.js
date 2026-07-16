// Fleet Dashboard - Jeddah Islamic Port
// Static-site build: React + Babel via CDN, localStorage instead of window.storage,
// hand-rolled SVG icons instead of lucide-react, plain CSS bars instead of recharts.
// SEED_VESSELS and SEED_MOVEMENTS come from data.js (loaded before this file).

const { useState, useEffect, useMemo, useCallback } = React;

// ---------- Constants ----------

// Change this PIN before deploying. Anyone who enters it correctly gets
// admin (edit) access. This is a soft deterrent only, not real security.
const ADMIN_PIN = "9090";

const LOGO_MARK = "images/logo-mark.png";
const LOGO_FULL = "images/logo-full.png";

const STORAGE_KEY = "fleet-data-v1";

// ---------- Icons (small inline SVGs, replacing lucide-react) ----------

function Icon({ d, className, style, viewBox = "0 0 24 24", children }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d ? <path d={d} /> : children}
    </svg>
  );
}

const AnchorIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v14" />
    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
    <path d="M5 12a7 7 0 0 0 7 7 7 7 0 0 0 7-7" />
  </Icon>
);

const ShipIcon = (p) => (
  <Icon {...p} d="M2 20l1.5-5h17L22 20M4 15V8h16v7M9 8V4h6v4M2 20a3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 3 1 3 3 0 0 0 3-1" />
);

const AlertTriangleIcon = (p) => (
  <Icon {...p}>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </Icon>
);

const ChevronDownIcon = (p) => <Icon {...p} d="M6 9l6 6 6-6" />;
const ChevronUpIcon = (p) => <Icon {...p} d="M18 15l-6-6-6 6" />;
const XIcon = (p) => <Icon {...p} d="M18 6L6 18M6 6l12 12" />;
const PlusIcon = (p) => <Icon {...p} d="M12 5v14M5 12h14" />;

const HistoryIcon = (p) => (
  <Icon {...p}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <path d="M12 7v5l4 2" />
  </Icon>
);

const RadioIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
  </Icon>
);

const LockIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);

const UnlockIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </Icon>
);

const ActivityIcon = (p) => <Icon {...p} d="M22 12h-4l-3 9L9 3l-3 9H2" />;

// ---------- Helpers ----------

function daysBetween(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function statusOf(vessel) {
  if (vessel.exemptionStatus !== "exempt") {
    return { code: "no_exemption", label: "غير معفاة - تتطلب إرشاد", days: null };
  }
  if (!vessel.expiry) {
    return { code: "unset", label: "معفاة - بلا تاريخ انتهاء محدد", days: null };
  }
  const d = daysBetween(vessel.expiry);
  if (d < 0) return { code: "expired", label: "منتهي", days: d };
  if (d <= 2) return { code: "critical", label: "عاجل جداً - أقل من 48 ساعة", days: d };
  if (d <= 30) return { code: "expiring", label: "أوشك على الانتهاء", days: d };
  return { code: "active", label: "معفاة", days: d };
}

const STATUS_STYLES = {
  active: { bg: "#E3EEE7", border: "#3F7A63", text: "#1F4A3A", dot: "#3F7A63" },
  expiring: { bg: "#F5E9D2", border: "#B8935A", text: "#6B4E24", dot: "#B8935A" },
  critical: { bg: "#FBDADA", border: "#D6291D", text: "#7A140C", dot: "#D6291D" },
  expired: { bg: "#F1DCD5", border: "#A8402F", text: "#6B241A", dot: "#A8402F" },
  no_exemption: { bg: "#E7EAEC", border: "#8C98A0", text: "#4A5760", dot: "#8C98A0" },
  unset: { bg: "#E5E0EC", border: "#7A6A97", text: "#453A5C", dot: "#7A6A97" },
};

function monthKey(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(0, 7);
}

function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  const names = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

function fmtDate(d) {
  if (!d) return "—";
  return d;
}

// ---------- Local storage helpers (replaces Claude's window.storage) ----------

function loadFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveToStorage(data) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

// ---------- Main App ----------

function FleetDashboard() {
  const [vessels, setVessels] = useState(SEED_VESSELS);
  const [captainLog, setCaptainLog] = useState([]);
  const [movements, setMovements] = useState(SEED_MOVEMENTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddMovementModal, setShowAddMovementModal] = useState(false);
  const [expandedMonth, setExpandedMonth] = useState(null);
  const [toast, setToast] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [expandedStat, setExpandedStat] = useState(null);

  const attemptLogin = (pin) => {
    if (pin === ADMIN_PIN) {
      setIsAdmin(true);
      setShowLoginModal(false);
      setToast({ type: "ok", msg: "تم تفعيل صلاحية المشرف." });
    } else {
      setToast({ type: "error", msg: "رمز الدخول غير صحيح." });
    }
  };

  useEffect(() => {
    const parsed = loadFromStorage();
    if (parsed) {
      if (parsed.vessels) setVessels(parsed.vessels);
      if (parsed.captainLog) setCaptainLog(parsed.captainLog);
      if (parsed.movements) setMovements(parsed.movements);
    }
    setLoading(false);
  }, []);

  const persist = useCallback((nextVessels, nextLog, nextMovements) => {
    setSaving(true);
    const ok = saveToStorage({ vessels: nextVessels, captainLog: nextLog, movements: nextMovements });
    if (!ok) setToast({ type: "error", msg: "تعذر الحفظ. حاول مرة أخرى." });
    setTimeout(() => setSaving(false), 300);
  }, []);

  const updateVessel = useCallback((id, updates) => {
    setVessels(prev => {
      const current = prev.find(v => v.id === id);
      let nextLog = captainLog;

      if (updates.master !== undefined && current && current.master && updates.master !== current.master) {
        const today = new Date().toISOString().slice(0, 10);
        nextLog = [
          ...captainLog,
          {
            id: `${id}-${Date.now()}`,
            vesselId: id,
            vesselName: current.arName,
            captain: current.master,
            start: current.masterSince || "",
            end: today,
          },
        ];
        updates = { ...updates, masterSince: today };
        setCaptainLog(nextLog);
      }

      const next = prev.map(v => (v.id === id ? { ...v, ...updates } : v));
      persist(next, nextLog, movements);
      return next;
    });
  }, [captainLog, movements, persist]);

  const addVessel = useCallback((vessel) => {
    setVessels(prev => {
      const next = [...prev, vessel];
      persist(next, captainLog, movements);
      return next;
    });
  }, [captainLog, movements, persist]);

  const addMovement = useCallback((movement) => {
    setMovements(prev => {
      const next = [...prev, movement];
      persist(vessels, captainLog, next);
      return next;
    });
  }, [vessels, captainLog, persist]);

  const deleteMovement = useCallback((id) => {
    setMovements(prev => {
      const next = prev.filter(m => m.id !== id);
      persist(vessels, captainLog, next);
      return next;
    });
  }, [vessels, captainLog, persist]);

  const enriched = useMemo(() => {
    const list = vessels.map(v => ({ ...v, status: statusOf(v) }));
    const priority = { exempt: 0, not_exempt: 1, unset: 2 };
    return list.sort((a, b) => (priority[a.exemptionStatus] ?? 1) - (priority[b.exemptionStatus] ?? 1));
  }, [vessels]);
  const criticalAlerts = useMemo(() => enriched.filter(v => v.status.code === "critical"), [enriched]);
  const alerts = useMemo(() => enriched.filter(v => v.status.code === "expiring" || v.status.code === "expired"), [enriched]);
  const stats = useMemo(() => ({
    total: enriched.length,
    active: enriched.filter(v => v.status.code === "active").length,
    expiring: enriched.filter(v => v.status.code === "expiring").length,
    critical: enriched.filter(v => v.status.code === "critical").length,
    expired: enriched.filter(v => v.status.code === "expired").length,
    noExemption: enriched.filter(v => v.status.code === "no_exemption").length,
  }), [enriched]);

  const vesselNamesByStat = useMemo(() => ({
    total: enriched.map(v => v.arName),
    active: enriched.filter(v => v.status.code === "active").map(v => v.arName),
    expiring: enriched.filter(v => v.status.code === "expiring").map(v => v.arName),
    expired: enriched.filter(v => v.status.code === "expired").map(v => v.arName),
  }), [enriched]);

  const monthsAvailable = useMemo(() => {
    const keys = new Set(movements.map(m => monthKey(m.date)));
    return [...keys].sort().reverse();
  }, [movements]);

  const movementsCountByMonth = useMemo(() => {
    const counts = {};
    movements.forEach(m => {
      const k = monthKey(m.date);
      counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }, [movements]);

  const movementsForMonth = useMemo(() => {
    return movements
      .filter(m => monthKey(m.date) === expandedMonth)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [movements, expandedMonth]);

  const overallMovementsReport = useMemo(() => {
    const list = movements;
    if (list.length === 0) return null;

    const countBy = (keyFn) => {
      const counts = {};
      list.forEach(m => {
        const k = keyFn(m);
        if (!k) return;
        counts[k] = (counts[k] || 0) + 1;
      });
      let best = null, bestCount = 0;
      Object.entries(counts).forEach(([k, c]) => { if (c > bestCount) { best = k; bestCount = c; } });
      return { key: best, count: bestCount };
    };

    const topVesselEntry = countBy(m => m.vesselId);
    const topVessel = vessels.find(v => v.id === topVesselEntry.key);

    const topFuel = countBy(m => (m.fuelType || "").split(",")[0].trim());
    const topBerth = countBy(m => m.berthTo);
    const busiestDay = countBy(m => m.date);

    let totalQuantity = 0;
    list.forEach(m => {
      (m.quantity || "").split(",").forEach(part => {
        const n = parseFloat(part.replace(/[^\d.]/g, ""));
        if (!isNaN(n)) totalQuantity += n;
      });
    });

    return {
      totalOps: list.length,
      topVesselName: topVessel ? topVessel.arName : "—",
      topVesselCount: topVesselEntry.count,
      totalQuantity: Math.round(totalQuantity).toLocaleString("en-US"),
      topFuel: topFuel.key || "—",
      topBerth: topBerth.key || "—",
      busiestDay: busiestDay.key || "—",
      busiestDayCount: busiestDay.count,
    };
  }, [movements, vessels]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-white text-[#5C6B73]">
        <div className="flex flex-col items-center gap-4">
          <img src={LOGO_MARK} alt="" className="h-14 w-auto animate-pulse" />
          <span className="text-sm tracking-wide">جارٍ تحميل بيانات الأسطول…</span>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen text-[#241E14] pb-16 official-bg">
      <img src={LOGO_FULL} alt="" className="watermark" />

      <header className="relative bg-white" style={{ zIndex: 1 }}>
        <div className="h-1.5" style={{ background: "linear-gradient(90deg, #2C5A70, #4E8AA0, #2C5A70)" }}></div>
        <div className="max-w-6xl mx-auto px-5 pt-6 pb-4 relative">
          <div className="shield-badge absolute -top-1 right-4 sm:right-6">
            <img src={LOGO_MARK} alt="شعار ميناء جدة الإسلامي" className="h-8 w-auto relative z-10" />
          </div>
          <div className="pr-16 sm:pr-20">
            <h1 className="amiri text-2xl font-bold tracking-tight" style={{ color: "#1E4356" }}>لوحة متابعة إعفاءات سفن التزويد بالوقود</h1>
            <p className="text-xs mt-1 tracking-wide" style={{ color: "#5C87A0" }}>ميناء جدة الإسلامي · الهيئة العامة للموانئ</p>
          </div>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            {isAdmin ? (
              <button onClick={() => { setIsAdmin(false); setToast({ type: "ok", msg: "تم الخروج من وضع المشرف." }); }}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md text-white" style={{ backgroundColor: "#2C5A70" }}>
                <UnlockIcon className="w-3.5 h-3.5" /> وضع المشرف
              </button>
            ) : (
              <button onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md border hover:bg-[#2C5A70]/5" style={{ borderColor: "#C7D3D8", color: "#5C6B73" }}>
                <LockIcon className="w-3.5 h-3.5" /> دخول المشرف
              </button>
            )}
            <div className="flex items-center gap-2 text-xs" style={{ color: "#5C6B73" }}>
              <RadioIcon className="w-3.5 h-3.5" style={{ color: saving ? "#B8935A" : "#3F7A63" }} />
              <span>{saving ? "جارٍ الحفظ…" : "متزامن"}</span>
            </div>
          </div>
        </div>
        <div className="h-px" style={{ backgroundColor: "#2C5A70" }}></div>
        <div className="h-px mt-0.5" style={{ backgroundColor: "#B8935A" }}></div>
      </header>

      <div className="max-w-6xl mx-auto px-5 relative" style={{ zIndex: 1 }}>
        <section className="mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3 rise-in">
          <StatCard label="إجمالي الأسطول" value={stats.total} color="#0A3D3F" bg="#E4EEEC" IconComp={ShipIcon}
            onClick={() => setExpandedStat(expandedStat === "total" ? null : "total")} active={expandedStat === "total"} />
          <StatCard label="معفاة وسارية" value={stats.active} color="#1F4A3A" bg="#E3EEE7" IconComp={AnchorIcon}
            onClick={() => setExpandedStat(expandedStat === "active" ? null : "active")} active={expandedStat === "active"} />
          <StatCard label="أوشكت على الانتهاء" value={stats.expiring} color="#6B4E24" bg="#F5E9D2" IconComp={AlertTriangleIcon}
            onClick={() => setExpandedStat(expandedStat === "expiring" ? null : "expiring")} active={expandedStat === "expiring"} />
          <StatCard label="منتهية" value={stats.expired} color="#6B241A" bg="#F1DCD5" IconComp={AlertTriangleIcon}
            onClick={() => setExpandedStat(expandedStat === "expired" ? null : "expired")} active={expandedStat === "expired"} />
        </section>

        {expandedStat && (
          <section className="mt-2 rounded-lg border px-4 py-3 bg-white rise-in" style={{ borderColor: "#DCE3E7" }}>
            {vesselNamesByStat[expandedStat].length === 0 ? (
              <div className="text-xs" style={{ color: "#8B98A0" }}>لا توجد سفن في هذه الفئة حالياً.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {vesselNamesByStat[expandedStat].map((name, i) => (
                  <span key={i} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#EEF2F4", color: "#1E4356" }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {overallMovementsReport && (
          <section className="mt-3 rounded-xl border p-4 bg-white rise-in" style={{ borderColor: "#E3D9BE" }}>
            <div className="text-xs font-bold mb-3" style={{ color: "#8B98A0" }}>
              إجمالي عمليات التزويد بالوقود (كل الشهور المسجّلة)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MiniStat label="إجمالي العمليات" value={overallMovementsReport.totalOps} />
              <MiniStat label="الأكثر نشاطاً" value={overallMovementsReport.topVesselName} sub={`${overallMovementsReport.topVesselCount} عملية`} />
              <MiniStat label="إجمالي الكمية" value={overallMovementsReport.totalQuantity} />
              <MiniStat label="الوقود الأكثر استخداماً" value={overallMovementsReport.topFuel} />
              <MiniStat label="الرصيف الأكثر ازدحاماً" value={overallMovementsReport.topBerth} />
              <MiniStat label="أكثر يوم نشاطاً" value={overallMovementsReport.busiestDay} sub={`${overallMovementsReport.busiestDayCount} عمليات`} />
            </div>
          </section>
        )}

        {criticalAlerts.length > 0 && (
          <section className="mt-5">
            <div className="rounded-xl border-2 px-4 py-3 pulse-critical" style={{ backgroundColor: "#FBDADA", borderColor: "#D6291D" }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangleIcon className="w-5 h-5" style={{ color: "#D6291D" }} />
                <h2 className="amiri text-base font-bold" style={{ color: "#7A140C" }}>
                  عاجل جداً — إعفاء ينتهي خلال أقل من 48 ساعة
                </h2>
                <span className="mono text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#D6291D", color: "#fff" }}>{criticalAlerts.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {criticalAlerts.map(v => (
                  <div key={v.id} className="rounded-lg bg-white/70 px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm" style={{ color: "#7A140C" }}>{v.arName} <span className="mono font-normal text-xs opacity-70">/ {v.enName}</span></div>
                      <div className="text-xs mt-0.5" style={{ color: "#7A140C" }}>
                        {v.status.days <= 0 ? "ينتهي اليوم أو خلال ساعات" : `يتبقى ${v.status.days} يوم فقط`}
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => setEditingId(v.id)} className="text-xs font-bold px-3 py-2 rounded-md shrink-0" style={{ backgroundColor: "#D6291D", color: "#fff" }}>
                        تجديد الآن
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="ribbon-banner mb-3 flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-[#A8402F]" />
            <h2 className="amiri text-base font-bold tracking-wide text-[#0A3D3F]">التنبيهات الحرجة</h2>
            <span className="mono text-xs px-2 py-0.5 rounded-full bg-[#0A3D3F] text-[#F1E9D5]">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="rounded-lg border border-[#DCE3E7] bg-[#FFFFFF] px-4 py-3 text-sm text-[#55636B]">
              لا توجد سفن تتطلب إجراءً عاجلاً حالياً.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {alerts.map(v => {
                const s = STATUS_STYLES[v.status.code];
                return (
                  <div key={v.id} className="rounded-lg border px-4 py-3 flex items-center justify-between" style={{ backgroundColor: s.bg, borderColor: s.border }}>
                    <div>
                      <div className="font-bold text-sm" style={{ color: s.text }}>{v.arName} <span className="mono font-normal text-xs opacity-70">/ {v.enName}</span></div>
                      <div className="text-xs mt-0.5" style={{ color: s.text }}>
                        {v.status.code === "expired"
                          ? `منتهي منذ ${Math.abs(v.status.days)} يوم`
                          : `يتبقى ${v.status.days} يوم على انتهاء الإعفاء`}
                      </div>
                    </div>
                    {isAdmin && (
                      <button onClick={() => setEditingId(v.id)} className="text-xs font-bold px-4 py-2.5 rounded-md shrink-0" style={{ backgroundColor: s.border, color: "#fff" }}>
                        تجديد
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-9 rise-in">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShipIcon className="w-4 h-4 text-[#0A3D3F]" />
              <h2 className="amiri text-base font-bold tracking-wide text-[#0A3D3F]">قائمة الأسطول ({vessels.length} سفينة)</h2>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowLog(s => !s)} className="text-xs font-bold px-3 py-2 rounded-md border border-[#0A3D3F] text-[#0A3D3F] flex items-center gap-1.5 hover:bg-[#0A3D3F]/5 transition">
                <HistoryIcon className="w-3.5 h-3.5" /> سجل الكباتن {showLog ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
              </button>
              {isAdmin && (
                <button onClick={() => setShowAddModal(true)} className="text-xs font-bold px-3 py-2 rounded-md bg-[#B8935A] text-[#1E4356] flex items-center gap-1.5 hover:bg-[#C6A46C] transition">
                  <PlusIcon className="w-3.5 h-3.5" /> إضافة سفينة
                </button>
              )}
            </div>
          </div>

          {showLog && <CaptainLogPanel log={captainLog} />}

          <div className="rounded-xl border border-[#DCE3E7] bg-[#FFFFFF] overflow-hidden overflow-x-auto shadow-sm">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="bg-[#EEF2F4] text-[#55636B] text-xs">
                  <th className="text-right px-4 py-3 font-bold">م</th>
                  <th className="text-right px-4 py-3 font-bold">اسم الناقلة</th>
                  <th className="text-right px-4 py-3 font-bold mono">IMO</th>
                  <th className="text-right px-4 py-3 font-bold">الحالة</th>
                  <th className="text-right px-4 py-3 font-bold">الكابتن الحالي</th>
                  <th className="text-right px-4 py-3 font-bold">انتهاء الإعفاء</th>
                  <th className="text-right px-4 py-3 font-bold">الأيام المتبقية</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((v, i) => {
                  const s = STATUS_STYLES[v.status.code];
                  return (
                    <tr key={v.id} className="border-t border-[#EEF2F4] hover:bg-[#F3F6F7] transition" style={{ borderRight: `4px solid ${s.border}` }}>
                      <td className="px-4 py-3 mono text-xs text-[#8B98A0]">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{v.arName}</div>
                        <div className="text-xs text-[#8B98A0] mono">{v.enName}</div>
                      </td>
                      <td className="px-4 py-3 mono text-xs">{v.imo || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: s.bg, color: s.text }}>
                          <span className="w-1.5 h-1.5 rotate-45" style={{ backgroundColor: s.dot }}></span>
                          {v.status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">{v.master || <span className="text-[#B7C2C8]">غير محدد</span>}</td>
                      <td className="px-4 py-3 mono text-xs">{v.exemptionStatus === "exempt" ? fmtDate(v.expiry) : "—"}</td>
                      <td className="px-4 py-3 mono text-xs font-bold" style={{ color: s.text }}>
                        {v.status.days === null ? "—" : v.status.days < 0 ? `${v.status.days}−` : v.status.days}
                      </td>
                      <td className="px-4 py-3 text-left">
                        {isAdmin && (
                          <button onClick={() => setEditingId(v.id)} className="text-xs font-bold text-white rounded-md px-4 py-2.5" style={{ backgroundColor: "#0A3D3F" }}>
                            تعديل
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-9 rise-in mb-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShipIcon className="w-4 h-4" style={{ color: "#2C5A70" }} />
              <h2 className="amiri text-base font-bold tracking-wide" style={{ color: "#1E4356" }}>سجل عمليات تزويد سفن الوقود ({movements.length} عملية)</h2>
            </div>
            {isAdmin && (
              <button onClick={() => setShowAddMovementModal(true)} className="text-xs font-bold px-3 py-2 rounded-md bg-[#B8935A] text-[#1E4356] flex items-center gap-1.5 hover:bg-[#C6A46C] transition">
                <PlusIcon className="w-3.5 h-3.5" /> إضافة عملية تزويد
              </button>
            )}
          </div>

          {monthsAvailable.length === 0 ? (
            <div className="rounded-xl border px-4 py-6 text-sm text-center bg-white" style={{ borderColor: "#DCE3E7", color: "#55636B" }}>
              لا توجد عمليات مسجلة بعد. {isAdmin ? "استخدم زر (إضافة عملية تزويد) لتسجيل أول عملية." : ""}
            </div>
          ) : (
            <div className="grid gap-2">
              {monthsAvailable.map(k => {
                const isOpen = expandedMonth === k;
                return (
                  <div key={k} className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "#DCE3E7" }}>
                    <button
                      onClick={() => setExpandedMonth(isOpen ? null : k)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold"
                      style={{ color: "#1E4356" }}
                    >
                      <span className="flex items-center gap-2">
                        {monthLabel(k)}
                        <span className="mono text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#EEF2F4", color: "#55636B" }}>
                          {movementsCountByMonth[k] || 0} عملية
                        </span>
                      </span>
                      {isOpen ? <ChevronUpIcon className="w-4 h-4" style={{ color: "#B8935A" }} /> : <ChevronDownIcon className="w-4 h-4" style={{ color: "#B8935A" }} />}
                    </button>

                    {isOpen && (
                      <div className="overflow-x-auto border-t" style={{ borderColor: "#EEF2F4" }}>
                        <table className="w-full text-sm min-w-[860px]">
                          <thead>
                            <tr className="text-xs" style={{ backgroundColor: "#EEF2F4", color: "#55636B" }}>
                              <th className="text-right px-4 py-3 font-bold">التاريخ</th>
                              <th className="text-right px-4 py-3 font-bold">ناقلة التزويد</th>
                              <th className="text-right px-4 py-3 font-bold">الرصيف</th>
                              <th className="text-right px-4 py-3 font-bold">الوقت</th>
                              <th className="text-right px-4 py-3 font-bold">المدة</th>
                              <th className="text-right px-4 py-3 font-bold">الكمية / الوقود</th>
                              <th className="text-right px-4 py-3 font-bold">السفينة المستفيدة</th>
                              {isAdmin && <th className="px-4 py-3"></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {movementsForMonth.length === 0 ? (
                              <tr>
                                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-6 text-center text-sm" style={{ color: "#55636B" }}>
                                  لا توجد عمليات مسجلة لهذا الشهر.
                                </td>
                              </tr>
                            ) : (
                              movementsForMonth.map(m => {
                                const vessel = vessels.find(v => v.id === m.vesselId);
                                return (
                                  <tr key={m.id} className="border-t" style={{ borderColor: "#EEF2F4" }}>
                                    <td className="px-4 py-3 mono text-xs">{m.date}</td>
                                    <td className="px-4 py-3">
                                      <div className="font-bold">{vessel ? vessel.arName : "—"}</div>
                                      {vessel && <div className="text-xs mono" style={{ color: "#8B98A0" }}>{vessel.enName}</div>}
                                    </td>
                                    <td className="px-4 py-3 text-xs mono">
                                      {m.berthFrom || "—"} ← {m.berthTo || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-xs mono">
                                      {m.timeFrom || "—"} - {m.timeTo || "—"}
                                    </td>
                                    <td className="px-4 py-3 text-xs mono">{m.duration || "—"}</td>
                                    <td className="px-4 py-3 text-xs">
                                      <div className="font-bold" style={{ color: "#1E4356" }}>{m.quantity || "—"}</div>
                                      <div style={{ color: "#8B98A0" }}>{m.fuelType || "—"}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs" style={{ color: "#55636B" }}>{m.servicedVessel || "—"}</td>
                                    {isAdmin && (
                                      <td className="px-4 py-3 text-left">
                                        <button onClick={() => deleteMovement(m.id)} className="text-xs font-bold text-white rounded-md px-4 py-2.5" style={{ backgroundColor: "#A8402F" }}>
                                          حذف
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-9 rise-in mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <ActivityIcon className="w-4 h-4" style={{ color: "#B8935A" }} />
            <h2 className="amiri text-base font-bold tracking-wide" style={{ color: "#1E4356" }}>تحليل الأداء</h2>
            <ActivityIcon className="w-4 h-4" style={{ color: "#B8935A" }} />
          </div>
          <div className="rounded-2xl border p-4 bg-white" style={{ borderColor: "#E3D9BE" }}>
            <SimpleBarChart
              data={[
                { name: "معفاة", value: stats.active, color: "#3F7A63" },
                { name: "أوشكت", value: stats.expiring, color: "#B8935A" },
                { name: "منتهية", value: stats.expired, color: "#A8402F" },
                { name: "بلا بيانات", value: stats.noExemption + (stats.total - stats.active - stats.expiring - stats.expired - stats.noExemption), color: "#8C98A0" },
              ]}
            />
          </div>
        </section>
      </div>

      {editingId && (
        <EditModal
          vessel={vessels.find(v => v.id === editingId)}
          onClose={() => setEditingId(null)}
          onSave={(updates) => { updateVessel(editingId, updates); setEditingId(null); setToast({ type: "ok", msg: "تم تحديث بيانات السفينة." }); }}
        />
      )}

      {showAddModal && (
        <AddModal
          onClose={() => setShowAddModal(false)}
          onSave={(v) => { addVessel(v); setShowAddModal(false); setToast({ type: "ok", msg: "تمت إضافة السفينة إلى الأسطول." }); }}
        />
      )}

      {showAddMovementModal && (
        <AddMovementModal
          vessels={vessels}
          onClose={() => setShowAddMovementModal(false)}
          onSave={(m) => {
            addMovement(m);
            setExpandedMonth(monthKey(m.date));
            setShowAddMovementModal(false);
            setToast({ type: "ok", msg: "تمت إضافة الحركة." });
          }}
        />
      )}

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onSubmit={attemptLogin} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 px-4 py-2.5 rounded-lg text-sm font-bold shadow-lg"
          style={{ backgroundColor: toast.type === "error" ? "#A8402F" : "#0A3D3F", color: "#F1E9D5", animation: "toastIn .25s ease" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ---------- Stat Card ----------

function StatCard({ label, value, color, bg, IconComp, onClick, active }) {
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border bg-[#FFFFFF] p-4 flex items-center gap-3 stat-card shadow-sm ${clickable ? "cursor-pointer" : ""}`}
      style={{ borderColor: active ? color : "#E3D9BE", boxShadow: active ? `0 0 0 2px ${color}33` : undefined }}
    >
      <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: bg }}>
        <IconComp className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="mono text-2xl font-bold leading-none" style={{ color: "#1E4356" }}>{value}</div>
        <div className="text-xs text-[#55636B] mt-1">{label}</div>
      </div>
      {clickable && <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" style={{ color: "#B7C2C8", transform: active ? "rotate(180deg)" : "none" }} />}
    </div>
  );
}

function MiniStat({ label, value, sub }) {
  return (
    <div className="rounded-lg p-3" style={{ backgroundColor: "#F7F5EE" }}>
      <div className="text-xs mb-1" style={{ color: "#8B98A0" }}>{label}</div>
      <div className="text-sm font-bold mono truncate" style={{ color: "#1E4356" }}>{value}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: "#B8935A" }}>{sub}</div>}
    </div>
  );
}

// ---------- Simple bar chart (replaces recharts) ----------

function SimpleBarChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div key={i} className="bar-chart-col">
          <div className="bar-chart-value">{d.value}</div>
          <div
            className="bar-chart-bar"
            style={{ height: `${Math.max(4, (d.value / max) * 150)}px`, backgroundColor: d.color }}
          ></div>
          <div className="bar-chart-label">{d.name}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Captain Log Panel ----------

function CaptainLogPanel({ log }) {
  return (
    <div className="mb-4 rounded-xl border border-[#DCE3E7] bg-[#FFFFFF] overflow-hidden">
      <div className="px-4 py-2.5 bg-[#EEF2F4] text-xs font-bold text-[#55636B]">سجل تناوب الكباتن التاريخي</div>
      {log.length === 0 ? (
        <div className="px-4 py-4 text-sm text-[#8B98A0]">لا يوجد سجل تناوب مسجل بعد.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[#8B98A0]">
              <th className="text-right px-4 py-2 font-bold">السفينة</th>
              <th className="text-right px-4 py-2 font-bold">الكابتن</th>
              <th className="text-right px-4 py-2 font-bold">بداية النوبة</th>
              <th className="text-right px-4 py-2 font-bold">نهاية النوبة</th>
            </tr>
          </thead>
          <tbody>
            {[...log].reverse().map(l => (
              <tr key={l.id} className="border-t border-[#EEF2F4]">
                <td className="px-4 py-2 font-bold">{l.vesselName}</td>
                <td className="px-4 py-2">{l.captain}</td>
                <td className="px-4 py-2 mono text-xs">{l.start || "—"}</td>
                <td className="px-4 py-2 mono text-xs">{l.end}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- Edit Modal ----------

function EditModal({ vessel, onClose, onSave }) {
  const [form, setForm] = useState({
    arName: vessel.arName,
    enName: vessel.enName,
    imo: vessel.imo,
    exemptionStatus: vessel.exemptionStatus,
    start: vessel.start,
    expiry: vessel.expiry,
    master: vessel.master,
  });

  const set = (k, val) => setForm(f => ({ ...f, [k]: val }));

  return (
    <Modal onClose={onClose} title={`تعديل بيانات: ${vessel.arName}`}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم بالعربية">
            <input value={form.arName} onChange={e => set("arName", e.target.value)} className="input" />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input value={form.enName} onChange={e => set("enName", e.target.value)} className="input mono" />
          </Field>
        </div>
        <Field label="رقم IMO">
          <input value={form.imo} onChange={e => set("imo", e.target.value)} className="input mono" placeholder="مثال: 9417945" />
        </Field>
        <Field label="حالة الإعفاء">
          <div className="flex gap-2">
            <button onClick={() => set("exemptionStatus", "exempt")} className={`toggle ${form.exemptionStatus === "exempt" ? "toggle-on-green" : ""}`}>مؤهلة للإعفاء</button>
            <button onClick={() => set("exemptionStatus", "not_exempt")} className={`toggle ${form.exemptionStatus === "not_exempt" ? "toggle-on-gray" : ""}`}>غير معفاة - تتطلب إرشاد</button>
          </div>
        </Field>
        {form.exemptionStatus === "exempt" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ بدء الإعفاء">
              <input type="date" value={form.start} onChange={e => set("start", e.target.value)} className="input mono" />
            </Field>
            <Field label="تاريخ انتهاء الإعفاء">
              <input type="date" value={form.expiry} onChange={e => set("expiry", e.target.value)} className="input mono" />
            </Field>
          </div>
        )}
        <Field label="اسم الكابتن الحالي">
          <input value={form.master} onChange={e => set("master", e.target.value)} className="input" placeholder="اسم الكابتن" />
        </Field>
        {vessel.master && form.master !== vessel.master && (
          <p className="text-xs text-[#6B4E24] bg-[#F5E9D2] rounded-md px-3 py-2">
            سيتم أرشفة الكابتن السابق «{vessel.master}» تلقائياً في سجل الكباتن عند الحفظ.
          </p>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={() => onSave(form)} className="btn-primary">حفظ التعديلات</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Add Modal ----------

function AddModal({ onClose, onSave }) {
  const [form, setForm] = useState({ arName: "", enName: "", imo: "", exemptionStatus: "not_exempt", start: "", expiry: "", master: "" });
  const set = (k, val) => setForm(f => ({ ...f, [k]: val }));
  const canSave = form.arName.trim() && form.enName.trim();

  return (
    <Modal onClose={onClose} title="إضافة سفينة جديدة">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم بالعربية">
            <input value={form.arName} onChange={e => set("arName", e.target.value)} className="input" placeholder="اسم الناقلة" />
          </Field>
          <Field label="الاسم بالإنجليزية">
            <input value={form.enName} onChange={e => set("enName", e.target.value)} className="input mono" placeholder="VESSEL NAME" />
          </Field>
        </div>
        <Field label="رقم IMO">
          <input value={form.imo} onChange={e => set("imo", e.target.value)} className="input mono" placeholder="مثال: 9417945" />
        </Field>
        <Field label="حالة الإعفاء">
          <div className="flex gap-2">
            <button onClick={() => set("exemptionStatus", "exempt")} className={`toggle ${form.exemptionStatus === "exempt" ? "toggle-on-green" : ""}`}>مؤهلة للإعفاء</button>
            <button onClick={() => set("exemptionStatus", "not_exempt")} className={`toggle ${form.exemptionStatus === "not_exempt" ? "toggle-on-gray" : ""}`}>غير معفاة - تتطلب إرشاد</button>
          </div>
        </Field>
        {form.exemptionStatus === "exempt" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ بدء الإعفاء">
              <input type="date" value={form.start} onChange={e => set("start", e.target.value)} className="input mono" />
            </Field>
            <Field label="تاريخ انتهاء الإعفاء">
              <input type="date" value={form.expiry} onChange={e => set("expiry", e.target.value)} className="input mono" />
            </Field>
          </div>
        )}
        <Field label="اسم الكابتن الحالي">
          <input value={form.master} onChange={e => set("master", e.target.value)} className="input" placeholder="اسم الكابتن (اختياري)" />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button disabled={!canSave} onClick={() => onSave({ id: `v-${Date.now()}`, ...form, masterSince: form.master ? new Date().toISOString().slice(0, 10) : "" })}
            className="btn-primary" style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
            إضافة السفينة
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Add Movement Modal ----------

function AddMovementModal({ vessels, onClose, onSave }) {
  const [form, setForm] = useState({
    vesselId: vessels[0]?.id || "", date: "",
    berthFrom: "", berthTo: "", timeFrom: "", timeTo: "", duration: "",
    quantity: "", fuelType: "", servicedVessel: "",
  });
  const set = (k, val) => setForm(f => ({ ...f, [k]: val }));
  const canSave = form.vesselId && form.date;

  return (
    <Modal onClose={onClose} title="إضافة عملية تزويد بالوقود">
      <div className="grid gap-4">
        <Field label="ناقلة التزويد">
          <select value={form.vesselId} onChange={e => set("vesselId", e.target.value)} className="input">
            {vessels.map(v => (
              <option key={v.id} value={v.id}>{v.arName} / {v.enName}</option>
            ))}
          </select>
        </Field>
        <Field label="التاريخ">
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="input mono" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="من رصيف">
            <input value={form.berthFrom} onChange={e => set("berthFrom", e.target.value)} className="input" placeholder="مثال: B" />
          </Field>
          <Field label="إلى رصيف">
            <input value={form.berthTo} onChange={e => set("berthTo", e.target.value)} className="input" placeholder="مثال: E3" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="وقت البداية">
            <input value={form.timeFrom} onChange={e => set("timeFrom", e.target.value)} className="input mono" placeholder="مثال: 09:10" />
          </Field>
          <Field label="وقت النهاية">
            <input value={form.timeTo} onChange={e => set("timeTo", e.target.value)} className="input mono" placeholder="مثال: 15:35" />
          </Field>
        </div>
        <Field label="المدة (اختياري)">
          <input value={form.duration} onChange={e => set("duration", e.target.value)} className="input mono" placeholder="مثال: 6:25" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية">
            <input value={form.quantity} onChange={e => set("quantity", e.target.value)} className="input" placeholder="مثال: 200" />
          </Field>
          <Field label="نوع الوقود">
            <input value={form.fuelType} onChange={e => set("fuelType", e.target.value)} className="input" placeholder="مثال: FUEL / ديزل" />
          </Field>
        </div>
        <Field label="السفينة المستفيدة">
          <input value={form.servicedVessel} onChange={e => set("servicedVessel", e.target.value)} className="input" placeholder="اسم السفينة التي تم تزويدها" />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button disabled={!canSave} onClick={() => onSave({ id: `m-${Date.now()}`, ...form })}
            className="btn-primary" style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "not-allowed" }}>
            إضافة العملية
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Login Modal ----------

function LoginModal({ onClose, onSubmit }) {
  const [pin, setPin] = useState("");
  return (
    <Modal onClose={onClose} title="دخول المشرف">
      <div className="grid gap-4">
        <Field label="رمز الدخول (PIN)">
          <input
            type="password"
            value={pin}
            autoFocus
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onSubmit(pin); }}
            className="input mono"
            placeholder="••••"
          />
        </Field>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={() => onSubmit(pin)} className="btn-primary">دخول</button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Shared bits ----------

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-[#0A3D3F]/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div dir="rtl" onClick={e => e.stopPropagation()} className="bg-[#FFFFFF] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-[#DCE3E7]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF2F4] sticky top-0 bg-[#FFFFFF]">
          <h3 className="amiri font-bold text-lg text-[#0A3D3F]">{title}</h3>
          <button onClick={onClose} className="text-[#8B98A0] hover:text-[#0A3D3F]"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-[#55636B] mb-1.5">{label}</span>
      {children}
    </label>
  );
}

// ---------- Mount ----------

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<FleetDashboard />);
