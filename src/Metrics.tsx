import { useCallback, useEffect, useMemo, useState } from "react";

interface DayPoint {
  date: string;
  upload: number;
  download: number;
  conversion: number;
}

interface MetricsData {
  totals: { upload: number; download: number; conversion: number };
  since: string;
  series: DayPoint[];
}

type MetricKey = "upload" | "download" | "conversion";

const KEY_STORAGE = "morph-metrics-key";

const METRIC_META: Record<MetricKey, { label: string; color: string }> = {
  upload: { label: "Uploads", color: "#7c5cff" },
  download: { label: "Downloads", color: "#22d3ee" },
  conversion: { label: "Conversions", color: "#34e0a1" },
};

export default function Metrics() {
  const [key, setKey] = useState<string>(() => sessionStorage.getItem(KEY_STORAGE) ?? "");
  const [input, setInput] = useState("");
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const fetchMetrics = useCallback(async (k: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/metrics", { headers: { "x-metrics-key": k } });
      if (res.status === 401) {
        setError("Incorrect password.");
        sessionStorage.removeItem(KEY_STORAGE);
        setKey("");
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const json = (await res.json()) as MetricsData;
      setData(json);
      sessionStorage.setItem(KEY_STORAGE, k);
      setKey(k);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) void fetchMetrics(key);
    // run once on mount with any stored key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    sessionStorage.removeItem(KEY_STORAGE);
    setKey("");
    setData(null);
    setInput("");
  };

  if (!data) {
    return (
      <div className="page">
        <div className="aurora" aria-hidden />
        <div className="gate">
          <div className="logo">
            <span className="logo-mark">◆</span> Morph
          </div>
          <h2>Metrics</h2>
          <p className="gate-sub">Enter the password to view traffic.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) void fetchMetrics(input.trim());
            }}
          >
            <input
              type="password"
              className="gate-input"
              placeholder="Password"
              value={input}
              autoFocus
              onChange={(e) => setInput(e.target.value)}
            />
            <button className="btn primary" type="submit" disabled={loading || !input.trim()}>
              {loading ? <span className="spinner" /> : "View metrics"}
            </button>
          </form>
          {error && <div className="gate-err">⚠ {error}</div>}
          <a className="gate-back" href="/">
            ← Back to converter
          </a>
        </div>
      </div>
    );
  }

  return <Dashboard data={data} onRefresh={() => void fetchMetrics(key)} onLogout={logout} loading={loading} />;
}

function Dashboard({
  data,
  onRefresh,
  onLogout,
  loading,
}: {
  data: MetricsData;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
}) {
  const [metric, setMetric] = useState<MetricKey>("upload");

  const last7 = useMemo(() => {
    const slice = data.series.slice(-7);
    return {
      upload: slice.reduce((s, d) => s + d.upload, 0),
      download: slice.reduce((s, d) => s + d.download, 0),
      conversion: slice.reduce((s, d) => s + d.conversion, 0),
    };
  }, [data.series]);

  const sinceLabel = new Date(data.since).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="page">
      <div className="aurora" aria-hidden />
      <header className="hero metrics-hero">
        <div className="logo">
          <span className="logo-mark">◆</span> Morph
        </div>
        <h1>
          <span className="grad">Metrics</span>
        </h1>
        <p className="tagline">Aggregate activity across all visitors · tracking since {sinceLabel}</p>
      </header>

      <main className="stage">
        <div className="tiles">
          {(Object.keys(METRIC_META) as MetricKey[]).map((k) => (
            <div className="tile" key={k}>
              <div className="tile-dot" style={{ background: METRIC_META[k].color }} />
              <div className="tile-label">{METRIC_META[k].label}</div>
              <div className="tile-value">{data.totals[k].toLocaleString()}</div>
              <div className="tile-sub">{last7[k].toLocaleString()} in last 7 days</div>
            </div>
          ))}
        </div>

        <section className="panel">
          <div className="panel-head">
            <div className="counter">
              <strong>Last 30 days</strong>
            </div>
            <div className="panel-actions">
              <div className="seg">
                {(Object.keys(METRIC_META) as MetricKey[]).map((k) => (
                  <button
                    key={k}
                    className={`seg-btn${metric === k ? " active" : ""}`}
                    onClick={() => setMetric(k)}
                    style={metric === k ? { color: METRIC_META[k].color } : undefined}
                  >
                    {METRIC_META[k].label}
                  </button>
                ))}
              </div>
              <button className="btn ghost" onClick={onRefresh} disabled={loading}>
                {loading ? <span className="spinner" /> : "↻ Refresh"}
              </button>
            </div>
          </div>
          <div className="chart-wrap">
            <BarChart series={data.series} metric={metric} color={METRIC_META[metric].color} />
          </div>
        </section>

        <div className="metrics-foot-actions">
          <a className="btn ghost" href="/">
            ← Back to converter
          </a>
          <button className="btn secondary" onClick={onLogout}>
            Lock metrics
          </button>
        </div>
      </main>
    </div>
  );
}

function BarChart({ series, metric, color }: { series: DayPoint[]; metric: MetricKey; color: string }) {
  const width = 860;
  const height = 260;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const max = Math.max(1, ...series.map((d) => d[metric]));
  const n = series.length;
  const slot = (width - padX * 2) / n;
  const barW = Math.max(3, slot * 0.62);
  const plotH = height - padTop - padBottom;

  // Label roughly every 5th day to avoid clutter.
  const labelEvery = 5;

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${METRIC_META[metric].label} per day for the last ${n} days`}
    >
      {/* baseline */}
      <line x1={padX} y1={height - padBottom} x2={width - padX} y2={height - padBottom} stroke="rgba(255,255,255,0.12)" />
      {series.map((d, i) => {
        const v = d[metric];
        const h = (v / max) * plotH;
        const x = padX + i * slot + (slot - barW) / 2;
        const y = height - padBottom - h;
        const showLabel = i % labelEvery === 0 || i === n - 1;
        return (
          <g key={d.date}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill={color} opacity={v === 0 ? 0.18 : 0.9}>
              <title>{`${d.date}: ${v.toLocaleString()} ${METRIC_META[metric].label.toLowerCase()}`}</title>
            </rect>
            {showLabel && (
              <text x={x + barW / 2} y={height - 10} textAnchor="middle" className="chart-label">
                {d.date.slice(5)}
              </text>
            )}
          </g>
        );
      })}
      <text x={padX} y={12} className="chart-max">
        max {max.toLocaleString()}
      </text>
    </svg>
  );
}
