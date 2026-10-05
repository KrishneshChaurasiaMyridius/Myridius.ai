"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";

type CaseStatus = "draft" | "intake_review" | "analyst_review" | "committee_decision" | "decided";
type Case = {
  case_id: string;
  title: string;
  change_type: string;
  status: CaseStatus;
  version: number;
  inherent_risk: number;
  residual_risk: number;
  risk_assessment?: { rating: string; control_effectiveness: number };
  assessment_draft?: { summary: string; analyst_questions: string[]; citations: { source_id: string; title: string }[]; evidence_context: string[]; retrieval_query: string; decision_authority: string; prompt_version: string; execution_id: string };
  analyst_override?: { residual_risk: number };
  committee_decision?: { decision: string; conditions: { condition_id: string; description: string; owner: string; due_date: string; verification_criteria: string; status: string; verified_by?: string }[] };
  intake?: { title: string; change_type: string; business_rationale: string; business_owner: string; target_launch_date: string; jurisdictions: string[]; customer_exposure: string; delivery_channels: string[]; payment_characteristics: string[]; third_parties: string[]; proposed_controls: string[]; attachment_urls: string[] };
  document_evidence?: { document_id: string; title: string; document_type: string; extracted_jurisdictions: string[]; extracted_controls: string[]; risk_indicators: string[] }[];
};
type AuditEvent = { event_id: string; action: string; actor: string };
type RiskConfiguration = {
  version: string;
  factor_weights: Record<string, number>;
  control_mitigation_divisor: number;
  low_risk_maximum: number;
  moderate_risk_maximum: number;
  updated_by: string;
  updated_at: string;
};
type Actor = { actor_id: string; display_name: string; role: string };
type PolicySource = { source_id: string; title: string; topic: string; approved: boolean; reviewed_by?: string; retired_at?: string };
type WorkflowNotification = { notification_id: string; case_id: string; action: string; message: string; created_at: string; read_at?: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const steps = ["Intake", "Evidence", "Risk assessment", "Analyst review", "Committee decision"];
const initialIntake = {
  title: "Synthetic cross-border payments feature",
  change_type: "product_feature",
  business_rationale: "Enable synthetic cross-border payment simulation for the workbench demonstration.",
  business_owner: "Taylor Product Owner",
  target_launch_date: "2026-11-15T00:00",
  jurisdictions: "GB, US",
  customer_exposure: "moderate",
  delivery_channels: "web",
  payment_characteristics: "cross-border",
  third_parties: "Synthetic payment processor",
  proposed_controls: "Sanctions screening, Transaction monitoring",
  attachment_urls: "https://example.test/synthetic-change-brief.pdf",
};
const riskFactors = ["customer", "product", "channel", "geography", "transaction", "third_party"] as const;

function asList(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function stepFor(status: CaseStatus) {
  return { draft: 0, intake_review: 1, analyst_review: 3, committee_decision: 4, decided: 4 }[status];
}

export default function Home() {
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [riskConfiguration, setRiskConfiguration] = useState<RiskConfiguration | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);
  const [actorId, setActorId] = useState("product-owner");
  const activeActor = actors.find((actor) => actor.actor_id === actorId);
  const [riskInput, setRiskInput] = useState({ customer: 4, product: 5, channel: 3, geography: 4, transaction: 5, third_party: 3, control_effectiveness: 2 });
  const [overrideInput, setOverrideInput] = useState({ residual_risk: 4, rationale: "Cross-border launch uncertainty warrants a higher residual-risk rating for committee review." });
  const [decisionInput, setDecisionInput] = useState({ decision: "approve_with_conditions", rationale: "Approval is appropriate once the specified control verification is completed.", description: "Verify sanctions-screening coverage before launch.", owner: "Taylor Product Owner", due_date: "2026-10-31T00:00", verification_criteria: "Provide a test report demonstrating coverage for GB and US payment routes." });
  const [message, setMessage] = useState("Create a synthetic case to begin the governed demo.");
  const [working, setWorking] = useState(false);
  const [intake, setIntake] = useState(initialIntake);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<CaseStatus | "all">("all");
  const [documentInput, setDocumentInput] = useState({ title: "Synthetic control test report", document_type: "control_test", content: "Synthetic GB and US cross-border testing confirms sanctions screening and transaction monitoring.", source_url: "https://example.test/synthetic-control-report.pdf" });
  const [policySources, setPolicySources] = useState<PolicySource[]>([]);
  const [policyInput, setPolicyInput] = useState({ source_id: "RAW-SYNTHETIC-POLICY-03", title: "Synthetic Cross-Border Control Standard", topic: "controls_and_governance", excerpt: "Synthetic cross-border changes require documented sanctions screening and transaction monitoring control evidence." });
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);

  async function request<T>(path: string, options?: RequestInit, protectedAction = false): Promise<T> {
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(protectedAction ? { "X-Actor-Id": actorId } : {}),
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail ?? "Workflow action failed.");
    }
    return response.json() as Promise<T>;
  }

  async function loadQueue() {
    try { setCases(await request<Case[]>("/api/v1/cases")); }
    catch { setMessage("API unavailable. Start FastAPI on port 8000, then refresh."); }
  }

  async function loadRiskConfiguration() {
    try { setRiskConfiguration(await request<RiskConfiguration>("/api/v1/risk-configurations/active")); }
    catch { setMessage("API unavailable. Start FastAPI on port 8000, then refresh."); }
  }

  async function loadActors() {
    try { setActors(await request<Actor[]>("/api/v1/actors")); }
    catch { setMessage("Identity service unavailable. Start FastAPI on port 8000, then refresh."); }
  }

  async function loadPolicySources() {
    try { setPolicySources(await request<PolicySource[]>("/api/v1/policy-sources")); }
    catch { setMessage("Policy register unavailable. Start FastAPI on port 8000, then refresh."); }
  }

  async function loadNotifications() {
    try { setNotifications(await request<WorkflowNotification[]>("/api/v1/notifications", undefined, true)); }
    catch { setNotifications([]); }
  }

  async function loadCase(caseId: string) {
    try {
      const [caseDetail, auditEvents] = await Promise.all([request<Case>(`/api/v1/cases/${caseId}`), request<AuditEvent[]>(`/api/v1/cases/${caseId}/audit-events`)]);
      setActiveCase(caseDetail); setEvents(auditEvents);
      if (caseDetail.status === "draft" && caseDetail.intake) {
        setIntake({
          title: caseDetail.intake.title,
          change_type: caseDetail.intake.change_type,
          business_rationale: caseDetail.intake.business_rationale,
          business_owner: caseDetail.intake.business_owner,
          target_launch_date: new Date(caseDetail.intake.target_launch_date).toISOString().slice(0, 16),
          jurisdictions: caseDetail.intake.jurisdictions.join(", "),
          customer_exposure: caseDetail.intake.customer_exposure,
          delivery_channels: caseDetail.intake.delivery_channels.join(", "),
          payment_characteristics: caseDetail.intake.payment_characteristics.join(", "),
          third_parties: caseDetail.intake.third_parties.join(", "),
          proposed_controls: caseDetail.intake.proposed_controls.join(", "),
          attachment_urls: caseDetail.intake.attachment_urls.join(", "),
        });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load case."); }
  }

  useEffect(() => { void Promise.all([loadQueue(), loadRiskConfiguration(), loadActors(), loadPolicySources()]); }, []);
  useEffect(() => { void loadNotifications(); }, [actorId]);

  async function createCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const thirdParties = asList(intake.third_parties);
    if (intake.change_type === "vendor" && !thirdParties.length) {
      setMessage("Vendor changes require at least one third party.");
      return;
    }
    setWorking(true);
    try {
      const payload = {
        ...intake,
        target_launch_date: new Date(intake.target_launch_date).toISOString(),
        jurisdictions: asList(intake.jurisdictions),
        delivery_channels: asList(intake.delivery_channels),
        payment_characteristics: asList(intake.payment_characteristics),
        third_parties: thirdParties,
        proposed_controls: asList(intake.proposed_controls),
        attachment_urls: asList(intake.attachment_urls),
        is_synthetic: true,
      };
      const updatingDraft = activeCase?.status === "draft";
      const created = await request<Case>(updatingDraft ? `/api/v1/cases/${activeCase.case_id}/intake` : "/api/v1/cases", {
        method: updatingDraft ? "PUT" : "POST",
        body: JSON.stringify({
          ...payload,
        }),
      }, true);
      await Promise.all([loadQueue(), loadCase(created.case_id)]);
      setMessage(updatingDraft ? "Draft intake revised and versioned." : "Synthetic intake created. Product owner submission is now required.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to create demo case."); }
    finally { setWorking(false); }
  }

  async function advance(path: string, label: string, body?: object) {
    if (!activeCase) return;
    setWorking(true);
    try {
      const updated = await request<Case>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, true);
      await Promise.all([loadQueue(), loadCase(updated.case_id), loadNotifications()]);
      setMessage(label);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to advance case."); }
    finally { setWorking(false); }
  }

  async function addDocumentEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCase) return;
    setWorking(true);
    try {
      await request(`/api/v1/cases/${activeCase.case_id}/document-evidence`, {
        method: "POST",
        body: JSON.stringify({ ...documentInput, source_url: documentInput.source_url || undefined, is_synthetic: true }),
      }, true);
      await loadCase(activeCase.case_id);
      setMessage("Synthetic document evidence recorded and extracted for review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to record document evidence."); }
    finally { setWorking(false); }
  }

  async function createPolicySource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    try {
      await request<PolicySource>("/api/v1/policy-sources", { method: "POST", body: JSON.stringify(policyInput) }, true);
      await loadPolicySources();
      setMessage("Synthetic policy source registered for committee approval.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to add policy source."); }
    finally { setWorking(false); }
  }

  async function retirePolicySource(sourceId: string) {
    setWorking(true);
    try {
      await request<PolicySource>(`/api/v1/policy-sources/${sourceId}/retire`, { method: "POST" }, true);
      await loadPolicySources();
      setMessage("Policy source retired; it will not appear in future assessment retrieval.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to retire policy source."); }
    finally { setWorking(false); }
  }

  async function approvePolicySource(sourceId: string) {
    setWorking(true);
    try {
      await request<PolicySource>(`/api/v1/policy-sources/${sourceId}/approve`, { method: "POST" }, true);
      await loadPolicySources();
      setMessage("Policy source approved for future cited drafts.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to approve policy source."); }
    finally { setWorking(false); }
  }

  async function acknowledgeNotification(notification: WorkflowNotification) {
    setWorking(true);
    try {
      await request<WorkflowNotification>(`/api/v1/notifications/${notification.notification_id}/read`, { method: "POST" }, true);
      await Promise.all([loadNotifications(), loadCase(notification.case_id)]);
      setMessage("Workflow handoff acknowledged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to acknowledge notification."); }
    finally { setWorking(false); }
  }

  async function downloadEvidencePackage() {
    if (!activeCase) return;
    setWorking(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/cases/${activeCase.case_id}/evidence-package`, { headers: { "X-Actor-Id": actorId } });
      if (!response.ok) throw new Error("Evidence package could not be generated.");
      const packageData = await response.json();
      const file = new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${activeCase.case_id}-evidence-package.json`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      await loadCase(activeCase.case_id);
      setMessage("Verified evidence package downloaded. The export is recorded in the audit trail.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Evidence export failed."); }
    finally { setWorking(false); }
  }

  function onlyRoles(roles: string[], content: ReactNode) {
    if (activeActor && roles.includes(activeActor.role)) return content;
    return <p className="access-note">Required role: {roles.map((role) => role.replaceAll("_", " ")).join(" or ")}</p>;
  }

  const currentStep = activeCase ? stepFor(activeCase.status) : -1;
  const visibleCases = cases.filter((item) => {
    const matchesSearch = `${item.case_id} ${item.title} ${item.change_type}`.toLowerCase().includes(queueSearch.toLowerCase());
    return matchesSearch && (queueStatus === "all" || item.status === queueStatus);
  });
  return <main>
    <header><div><p className="eyebrow">FCRM GOVERNED WORKFLOW</p><h1>Risk Assessment Workbench</h1></div><div className="identity"><span className="environment">SYNTHETIC DEMO</span><label>Acting as<select value={actorId} onChange={(event) => setActorId(event.target.value)}>{actors.map((actor) => <option value={actor.actor_id} key={actor.actor_id}>{actor.display_name} · {actor.role.replaceAll("_", " ")}</option>)}</select></label></div></header>
    <section className="demo-bar" aria-live="polite"><span>{message}</span></section>
    <section className="inbox"><div><p className="label">WORKFLOW INBOX</p><h2>{notifications.filter((notification) => !notification.read_at).length} open handoff(s)</h2></div>{notifications.length ? <ul>{notifications.slice(0, 5).map((notification) => <li className={notification.read_at ? "read" : "unread"} key={notification.notification_id}><div><strong>{notification.action.replaceAll("_", " ")}</strong><span>{notification.message} · {notification.case_id}</span></div>{notification.read_at ? <small>Acknowledged</small> : <button type="button" disabled={working} onClick={() => void acknowledgeNotification(notification)}>Open and acknowledge</button>}</li>)}</ul> : <p className="muted">No workflow handoffs for this role.</p>}</section>
    {riskConfiguration && <section className="configuration"><div><p className="label">ACTIVE SCORING CONFIGURATION</p><h2>{riskConfiguration.version}</h2><p className="muted">Updated by {riskConfiguration.updated_by} · {new Date(riskConfiguration.updated_at).toLocaleDateString()}</p></div><dl><div><dt>Factor weights</dt><dd>{Object.entries(riskConfiguration.factor_weights).map(([factor, weight]) => `${factor}: ${weight}`).join(" · ")}</dd></div><div><dt>Residual-risk floor</dt><dd>1 / 5</dd></div><div><dt>Rating bands</dt><dd>Low ≤ {riskConfiguration.low_risk_maximum}; moderate ≤ {riskConfiguration.moderate_risk_maximum}</dd></div><div><dt>Control mitigation</dt><dd>Effectiveness ÷ {riskConfiguration.control_mitigation_divisor}</dd></div></dl></section>}
    {onlyRoles(["administrator", "committee_member"], <section className="policy-register"><div><p className="label">GOVERNED POLICY REGISTER</p><h2>Policy source review</h2><p className="muted">Registered sources require committee approval before they can be cited in new drafts.</p></div>{activeActor?.role === "administrator" && <form className="policy-form" onSubmit={(event) => void createPolicySource(event)}><label>Source ID<input required pattern="[A-Z0-9-]{4,80}" value={policyInput.source_id} onChange={(event) => setPolicyInput({ ...policyInput, source_id: event.target.value })} /></label><label>Topic<input required value={policyInput.topic} onChange={(event) => setPolicyInput({ ...policyInput, topic: event.target.value })} /></label><label>Title<input required minLength={10} value={policyInput.title} onChange={(event) => setPolicyInput({ ...policyInput, title: event.target.value })} /></label><label>Policy excerpt<textarea required minLength={20} value={policyInput.excerpt} onChange={(event) => setPolicyInput({ ...policyInput, excerpt: event.target.value })} /></label><button type="submit" disabled={working}>Register source for review</button></form>}<ul className="policy-list">{policySources.map((source) => <li key={source.source_id}><strong>{source.title}</strong><span>{source.source_id} · {source.topic} · {source.retired_at ? "retired" : source.approved ? "approved" : "pending review"}{source.reviewed_by ? ` · reviewed by ${source.reviewed_by}` : ""}</span>{activeActor?.role === "committee_member" && !source.approved && !source.retired_at && <button type="button" disabled={working} onClick={() => void approvePolicySource(source.source_id)}>Approve</button>}{activeActor?.role === "administrator" && source.approved && <button type="button" disabled={working} onClick={() => void retirePolicySource(source.source_id)}>Retire</button>}</li>)}</ul></section>)}
    <form className="intake-form" onSubmit={(event) => void createCase(event)}>
      <div><p className="label">PRODUCT OWNER INTAKE</p><h2>{activeCase?.status === "draft" ? `Revise ${activeCase.case_id}` : "Create synthetic change case"}</h2><p className="muted">All fields are synthetic demo data. Comma-separate multiple values.</p></div>
      <label>Change title<input required minLength={8} maxLength={160} value={intake.title} onChange={(event) => setIntake({ ...intake, title: event.target.value })} /></label>
      <label>Change type<select value={intake.change_type} onChange={(event) => setIntake({ ...intake, change_type: event.target.value })}><option value="product">Product</option><option value="product_feature">Product feature</option><option value="process">Process</option><option value="vendor">Vendor</option><option value="geography">Geography</option><option value="customer_segment">Customer segment</option></select></label>
      <label>Business owner<input required minLength={3} value={intake.business_owner} onChange={(event) => setIntake({ ...intake, business_owner: event.target.value })} /></label>
      <label>Target launch<input required type="datetime-local" value={intake.target_launch_date} onChange={(event) => setIntake({ ...intake, target_launch_date: event.target.value })} /></label>
      <label>Customer exposure<select value={intake.customer_exposure} onChange={(event) => setIntake({ ...intake, customer_exposure: event.target.value })}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label>
      <label>Jurisdictions<input required value={intake.jurisdictions} onChange={(event) => setIntake({ ...intake, jurisdictions: event.target.value })} /></label>
      <label>Delivery channels<input required value={intake.delivery_channels} onChange={(event) => setIntake({ ...intake, delivery_channels: event.target.value })} /></label>
      <label>Payment characteristics<input required value={intake.payment_characteristics} onChange={(event) => setIntake({ ...intake, payment_characteristics: event.target.value })} /></label>
      <label>Third parties{intake.change_type === "vendor" && <span className="required">Required for vendor changes</span>}<input required={intake.change_type === "vendor"} value={intake.third_parties} onChange={(event) => setIntake({ ...intake, third_parties: event.target.value })} /></label>
      <label>Proposed controls<input required value={intake.proposed_controls} onChange={(event) => setIntake({ ...intake, proposed_controls: event.target.value })} /></label>
      <label>Attachment URLs<input type="url" value={intake.attachment_urls} onChange={(event) => setIntake({ ...intake, attachment_urls: event.target.value })} /></label>
      <label className="rationale">Business rationale<textarea required minLength={20} maxLength={2000} value={intake.business_rationale} onChange={(event) => setIntake({ ...intake, business_rationale: event.target.value })} /></label>
      {onlyRoles(["product_owner"], <div className="intake-actions"><button type="submit" disabled={working}>{activeCase?.status === "draft" ? "Save draft revision" : "Create synthetic intake"}</button>{activeCase?.status === "draft" && <button className="secondary" type="button" disabled={working} onClick={() => { setActiveCase(null); setEvents([]); setIntake(initialIntake); }}>Start new intake</button>}</div>)}
    </form>
    <section className="workspace">
      <aside className="case-list"><p className="label">CASE QUEUE · {visibleCases.length}/{cases.length}</p><div className="queue-filters"><input aria-label="Search cases" placeholder="Search case queue" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} /><select aria-label="Filter by status" value={queueStatus} onChange={(event) => setQueueStatus(event.target.value as CaseStatus | "all")}><option value="all">All statuses</option>{["draft", "intake_review", "analyst_review", "committee_decision", "decided"].map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></div>{visibleCases.length ? visibleCases.map((item) => <button className={activeCase?.case_id === item.case_id ? "case-item selected" : "case-item"} type="button" key={item.case_id} onClick={() => void loadCase(item.case_id)}><strong>{item.title}</strong><span>{item.case_id} · {item.status.replace("_", " ")}</span></button>) : <p className="muted">No cases match this queue view.</p>}</aside>
      <section className="case-content">{!activeCase ? <div className="empty"><h2>Start a governed assessment</h2><p>Create a synthetic case, then progress it through explicit human gates.</p></div> : <>
        <section className="summary"><div><p className="label">{activeCase.status.replace("_", " ").toUpperCase()}</p><h2>{activeCase.title}</h2><p className="muted">{activeCase.case_id} · Version {activeCase.version} · {activeCase.change_type.replace("_", " ")}</p></div><div className="risk"><span>Residual risk</span><strong>{activeCase.residual_risk} / 5</strong><small>{activeCase.risk_assessment?.rating ?? "Not assessed"}</small></div></section>
        <section className="workflow">{steps.map((step, index) => <div className={index < currentStep ? "step complete" : index === currentStep ? "step current" : "step"} key={step}><span>{index + 1}</span><p>{step}</p></div>)}</section>
        <section className="decision-pack"><div><p className="label">DECISION PACK</p><h2>Review material</h2></div><dl><div><dt>Jurisdictions</dt><dd>{activeCase.intake?.jurisdictions.join(", ")}</dd></div><div><dt>Proposed controls</dt><dd>{activeCase.intake?.proposed_controls.join(", ")}</dd></div><div><dt>Evidence records</dt><dd>{activeCase.document_evidence?.length ?? 0}</dd></div><div><dt>Policy citations</dt><dd>{activeCase.assessment_draft?.citations.length ?? 0}</dd></div></dl>{activeCase.document_evidence?.length ? <ul>{activeCase.document_evidence.map((evidence) => <li key={evidence.document_id}><strong>{evidence.title}</strong><span>{evidence.document_type} · controls: {evidence.extracted_controls.join(", ") || "none detected"} · indicators: {evidence.risk_indicators.join(", ") || "none detected"}</span></li>)}</ul> : <p className="muted">No structured synthetic evidence recorded.</p>}</section>
        <section className="content"><article><p className="label">HUMAN ACTION REQUIRED</p><h2>{activeCase.status === "draft" ? "Product owner submission" : activeCase.status === "intake_review" ? "Run deterministic assessment" : activeCase.status === "analyst_review" ? "Analyst recommendation" : activeCase.status === "committee_decision" ? "Committee decision" : "Decision recorded"}</h2><p>The workflow cannot advance autonomously. Every material action records an audit event.</p><div className="facts"><div><span>Inherent risk</span><strong>{activeCase.inherent_risk} / 5</strong></div><div><span>Control effectiveness</span><strong>{activeCase.risk_assessment?.control_effectiveness ?? "-"} / 4</strong></div><div><span>Audit events</span><strong>{events.length}</strong></div></div>
          {activeCase.status === "draft" && onlyRoles(["product_owner"], <><form className="action-form" onSubmit={(event) => void addDocumentEvidence(event)}><p className="label">SYNTHETIC DOCUMENT EVIDENCE</p><label>Document title<input required minLength={5} maxLength={200} value={documentInput.title} onChange={(event) => setDocumentInput({ ...documentInput, title: event.target.value })} /></label><label>Document type<input required minLength={3} maxLength={100} value={documentInput.document_type} onChange={(event) => setDocumentInput({ ...documentInput, document_type: event.target.value })} /></label><label>Source URL (optional)<input type="url" value={documentInput.source_url} onChange={(event) => setDocumentInput({ ...documentInput, source_url: event.target.value })} /></label><label>Document text<textarea required minLength={20} maxLength={20000} value={documentInput.content} onChange={(event) => setDocumentInput({ ...documentInput, content: event.target.value })} /></label><button type="submit" disabled={working}>Record and extract evidence</button></form><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/submit`, "Case submitted for intake review.")}>Submit for intake review</button></>)}
          {activeCase.status === "intake_review" && onlyRoles(["analyst"], <form className="action-form" onSubmit={(event) => { event.preventDefault(); void advance(`/api/v1/cases/${activeCase.case_id}/risk-assessment`, "Deterministic assessment completed; analyst review is required.", { customer_risk: riskInput.customer, product_risk: riskInput.product, channel_risk: riskInput.channel, geography_risk: riskInput.geography, transaction_risk: riskInput.transaction, third_party_risk: riskInput.third_party, control_effectiveness: riskInput.control_effectiveness, analyst: activeActor?.display_name ?? "Analyst" }); }}><p className="label">ANALYST RISK INPUTS</p><div className="risk-inputs">{riskFactors.map((factor) => <label key={factor}>{factor.replace("_", " ")} risk<input required type="number" min="1" max="5" value={riskInput[factor]} onChange={(event) => setRiskInput({ ...riskInput, [factor]: Number(event.target.value) })} /></label>)}<label>Control effectiveness<input required type="number" min="0" max="4" value={riskInput.control_effectiveness} onChange={(event) => setRiskInput({ ...riskInput, control_effectiveness: Number(event.target.value) })} /></label></div><button type="submit" disabled={working}>Run risk assessment</button></form>)}
          {activeCase.status === "analyst_review" && <>{onlyRoles(["analyst"], <><div className="actions"><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/assessment-draft`, "Cited assessment draft prepared for analyst review.")}>Prepare cited draft</button><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/send-to-committee`, "Case sent to committee.")}>Send to committee</button></div><form className="action-form" onSubmit={(event) => { event.preventDefault(); void advance(`/api/v1/cases/${activeCase.case_id}/risk-override`, "Analyst override recorded with rationale.", { ...overrideInput, analyst: activeActor?.display_name ?? "Analyst" }); }}><p className="label">ANALYST OVERRIDE</p><label>Residual risk<input required type="number" min="1" max="5" value={overrideInput.residual_risk} onChange={(event) => setOverrideInput({ ...overrideInput, residual_risk: Number(event.target.value) })} /></label><label>Rationale<textarea required minLength={20} maxLength={2000} value={overrideInput.rationale} onChange={(event) => setOverrideInput({ ...overrideInput, rationale: event.target.value })} /></label><button type="submit" disabled={working}>Record override</button></form></>)}{activeCase.assessment_draft && <section className="draft"><p className="label">ASSESSMENT DRAFT · {activeCase.assessment_draft.decision_authority.replace("_", " ")}</p><p>{activeCase.assessment_draft.summary}</p><p className="muted">Retrieval query: {activeCase.assessment_draft.retrieval_query}</p><p className="muted">Prompt: {activeCase.assessment_draft.prompt_version} · Execution: {activeCase.assessment_draft.execution_id}</p><strong>Analyst questions</strong><ul>{activeCase.assessment_draft.analyst_questions.map((question) => <li key={question}>{question}</li>)}</ul><strong>Evidence context</strong><ul>{activeCase.assessment_draft.evidence_context.map((context) => <li key={context}>{context}</li>)}</ul><strong>Approved sources</strong><ul>{activeCase.assessment_draft.citations.map((citation) => <li key={citation.source_id}>{citation.title}</li>)}</ul></section>}</>}
          {activeCase.status === "committee_decision" && onlyRoles(["committee_member"], <form className="action-form" onSubmit={(event) => { event.preventDefault(); const conditionalApproval = decisionInput.decision === "approve_with_conditions"; void advance(`/api/v1/cases/${activeCase.case_id}/committee-decision`, "Human committee decision recorded.", { decision: decisionInput.decision, rationale: decisionInput.rationale, committee_member: activeActor?.display_name ?? "Committee member", conditions: conditionalApproval ? [{ description: decisionInput.description, owner: decisionInput.owner, due_date: new Date(decisionInput.due_date).toISOString(), verification_criteria: decisionInput.verification_criteria }] : [] }); }}><p className="label">COMMITTEE DECISION</p><label>Decision<select value={decisionInput.decision} onChange={(event) => setDecisionInput({ ...decisionInput, decision: event.target.value })}><option value="approve">Approve</option><option value="reject">Reject</option><option value="defer">Defer</option><option value="approve_with_conditions">Approve with conditions</option></select></label><label>Decision rationale<textarea required minLength={20} maxLength={2000} value={decisionInput.rationale} onChange={(event) => setDecisionInput({ ...decisionInput, rationale: event.target.value })} /></label>{decisionInput.decision === "approve_with_conditions" && <div className="condition-fields"><label>Condition description<input required minLength={10} value={decisionInput.description} onChange={(event) => setDecisionInput({ ...decisionInput, description: event.target.value })} /></label><label>Condition owner<input required minLength={3} value={decisionInput.owner} onChange={(event) => setDecisionInput({ ...decisionInput, owner: event.target.value })} /></label><label>Due date<input required type="datetime-local" value={decisionInput.due_date} onChange={(event) => setDecisionInput({ ...decisionInput, due_date: event.target.value })} /></label><label>Verification criteria<textarea required minLength={10} maxLength={1000} value={decisionInput.verification_criteria} onChange={(event) => setDecisionInput({ ...decisionInput, verification_criteria: event.target.value })} /></label></div>}<button type="submit" disabled={working}>Record committee decision</button></form>)}
          {activeCase.status === "decided" && <><p className="decision">{activeCase.committee_decision?.decision.replaceAll("_", " ")} · {activeCase.committee_decision?.conditions.length ?? 0} condition(s)</p>{activeCase.committee_decision?.conditions.map((condition) => <div className="condition" key={condition.condition_id}><strong>{condition.description}</strong><span>{condition.status} · {condition.owner} · due {new Date(condition.due_date).toLocaleDateString()}</span><small>{condition.verification_criteria}</small>{condition.status === "open" && onlyRoles(["analyst"], <button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/conditions/${condition.condition_id}/verify`, "Condition verification recorded.", { verifier: "Alex FCRM Analyst", evidence_summary: "Reviewed the test report confirming sanctions coverage for GB and US payment routes." })}>Verify condition</button>)}{condition.verified_by && <small>Verified by {condition.verified_by}</small>}</div>)}{onlyRoles(["auditor", "analyst", "committee_member"], <button type="button" disabled={working} onClick={() => void downloadEvidencePackage()}>Download evidence package</button>)}</>}
        </article><aside><p className="label">AUDIT TIMELINE</p><ol className="timeline">{events.map((event) => <li key={event.event_id}><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.actor}</span></li>)}</ol></aside></section>
      </>}</section>
    </section>
  </main>;
}