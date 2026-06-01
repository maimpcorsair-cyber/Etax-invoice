// Presentational, props-driven Dashboard (design system v2 — "Statement/Console"
// hybrid). Pure render, no data fetching — so it can be previewed with mock data
// and unit-screenshotted. The real Dashboard maps its fetched state into these
// props. All money/count strings arrive preformatted.

export interface DashboardFocus {
  label: string;
  amount?: string | null;
  detail: string;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

export interface DashboardKpi {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'good' | 'due';
  dot?: 'good' | 'due';
}

export interface DashboardWorkItem {
  title: string;
  meta?: string;
  href: string;
  actionLabel: string;
  count?: number;
  chip?: { label: string; tone: 'due' | 'warn' };
}

export interface DashboardVat {
  salesVat: string;
  purchaseVat: string;
  netPayable: string;
  readinessPct: number;
  note: string;
  href: string;
}

export interface DashboardPipelineStep {
  key: string;
  title: string;
  value: string;
  on?: boolean;
}

export interface DashboardViewProps {
  greeting: string;
  contextLine: string;
  focus?: DashboardFocus | null;
  kpis: DashboardKpi[];
  worklistTitle: string;
  worklistHref: string;
  worklist: DashboardWorkItem[];
  vat?: DashboardVat | null;
  vatTitle: string;
  pipelineTitle: string;
  pipeline: DashboardPipelineStep[];
}

export default function DashboardView(props: DashboardViewProps) {
  const {
    greeting, contextLine, focus, kpis,
    worklistTitle, worklistHref, worklist,
    vat, vatTitle, pipelineTitle, pipeline,
  } = props;

  return (
    <div className="bb bb-wrap">
      <header className="bb-topbar">
        <div>
          <h1>{greeting}</h1>
          <div className="bb-sub">{contextLine}</div>
        </div>
      </header>

      {focus && (
        <section className="bb-focus">
          <div>
            <div className="bb-k">{focus.label}</div>
            {focus.amount && <div className="bb-big">{focus.amount}</div>}
            <p>{focus.detail}</p>
          </div>
          <div className="bb-acts">
            <a className="bb-btn bb-btn-light" href={focus.primary.href}>{focus.primary.label}</a>
            {focus.secondary && (
              <a className="bb-btn bb-btn-ghost" href={focus.secondary.href}>{focus.secondary.label}</a>
            )}
          </div>
        </section>
      )}

      {kpis.length > 0 && (
        <div className="bb-kpis">
          {kpis.map((k, i) => (
            <div className="bb-kpi" key={i}>
              <div className="bb-lab">
                {k.dot && <span className="bb-dot" style={{ background: k.dot === 'good' ? 'var(--bb-good)' : 'var(--bb-due)' }} />}
                {k.label}
              </div>
              <div className={`bb-v${k.tone && k.tone !== 'default' ? ` ${k.tone}` : ''}`}>{k.value}</div>
              {k.detail && <div className="bb-d">{k.detail}</div>}
            </div>
          ))}
        </div>
      )}

      <div className={`bb-grid${vat ? '' : ' solo'}`}>
        <section className="bb-panel">
          <h2>{worklistTitle} <a href={worklistHref}>ดูทั้งหมด →</a></h2>
          <div className="bb-list">
            {worklist.map((w, i) => (
              <a className="bb-row" href={w.href} key={i}>
                <span className="bb-grow">
                  <span className="bb-t">{w.title}</span>
                  {w.meta && <div className="bb-m">{w.meta}</div>}
                </span>
                {w.chip
                  ? <span className={`bb-chip ${w.chip.tone}`}>{w.chip.label}</span>
                  : typeof w.count === 'number' && <span className="bb-qty">{w.count}</span>}
                <span className="bb-go">{w.actionLabel} →</span>
              </a>
            ))}
          </div>
        </section>

        {vat && (
          <section className="bb-panel">
            <h2>{vatTitle}</h2>
            <div className="bb-vat">
              <div className="bb-vrow"><span className="bb-l">ภาษีขาย</span><span className="bb-vv">{vat.salesVat}</span></div>
              <div className="bb-vrow"><span className="bb-l">ภาษีซื้อ</span><span className="bb-vv">{vat.purchaseVat}</span></div>
              <div className="bb-vrow net"><span className="bb-l">ต้องนำส่งสุทธิ</span><span className="bb-vv">{vat.netPayable}</span></div>
              <div className="bb-meter"><i style={{ width: `${Math.max(0, Math.min(100, vat.readinessPct))}%` }} /></div>
              <div className="bb-note">{vat.note}</div>
              <a className="bb-btn bb-btn-navy" href={vat.href}>เปิดสรุป ภพ.30</a>
            </div>
          </section>
        )}
      </div>

      {pipeline.length > 0 && (
        <>
          <div className="bb-flow" aria-label={pipelineTitle}>
            {pipeline.map((s) => (
              <div className={`bb-s${s.on ? ' on' : ''}`} key={s.key}>
                <div className="bb-k">{s.key}</div>
                <div className="bb-t">{s.title}</div>
                <div className="bb-v">{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
