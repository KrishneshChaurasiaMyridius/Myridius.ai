const steps = ["Intake", "Evidence", "Risk assessment", "Analyst review", "Committee decision"];

export default function Home() {
  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">FCRM GOVERNED WORKFLOW</p>
          <h1>Risk Assessment Workbench</h1>
        </div>
        <span className="environment">SYNTHETIC DEMO</span>
      </header>
      <section className="summary" aria-labelledby="case-title">
        <div>
          <p className="label">ACTIVE CASE</p>
          <h2 id="case-title">Cross-border payments feature expansion</h2>
          <p className="muted">RAW-DEMO-001 · Product feature · Submitted 03 Oct 2026</p>
        </div>
        <div className="risk">
          <span>Residual risk</span>
          <strong>3 / 5</strong>
          <small>Moderate</small>
        </div>
      </section>
      <section className="workflow" aria-label="Assessment workflow">
        {steps.map((step, index) => (
          <div className={index < 3 ? "step complete" : index === 3 ? "step current" : "step"} key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </div>
        ))}
      </section>
      <section className="content">
        <article>
          <p className="label">ANALYST REVIEW REQUIRED</p>
          <h2>Review the proposed assessment</h2>
          <p>The system prepared a cited draft from approved synthetic policy material. A human analyst must accept, correct or override every decision-relevant output.</p>
          <div className="facts">
            <div><span>Inherent risk</span><strong>4 / 5</strong></div>
            <div><span>Control effectiveness</span><strong>2 / 5</strong></div>
            <div><span>Policy citations</span><strong>4 linked</strong></div>
          </div>
          <button type="button">Open analyst review</button>
        </article>
        <aside>
          <p className="label">GOVERNANCE</p>
          <ul>
            <li>AI never approves or rejects a case.</li>
            <li>Controls reduce, never eliminate, risk.</li>
            <li>Every change and override is attributable.</li>
          </ul>
        </aside>
      </section>
    </main>
  );
}