"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { FCRM_ROLE_CLAIM, useWorkbenchAuth } from "./auth-provider";

type CaseStatus = "draft" | "intake_review" | "analyst_review" | "committee_decision" | "decided";
type Case = {
  case_id: string;
  title: string;
  change_type: string;
  status: CaseStatus;
  version: number;
  inherent_risk: number;
  residual_risk: number;
  risk_assessment?: {
    rating: string;
    control_effectiveness: number;
    factor_scores?: Record<string, number>;
    configuration_version?: string;
    configuration_snapshot?: RiskConfiguration;
  };
  assessment_draft?: {
    summary: string;
    risk_factor_analysis?: { factor: string; score: number; rationale: string; evidence_refs: string[] }[];
    control_observations?: string[];
    evidence_gaps?: string[];
    actual_input_tokens?: number | null;
    actual_output_tokens?: number | null;
    analyst_questions: string[];
    citations: { source_id: string; source_version: number; title: string; excerpt: string; topic: string; source_url?: string | null; synthetic_data: boolean }[];
    evidence_context: string[];
    retrieval_query: string;
    decision_authority: string;
    prompt_version: string;
    execution_id: string;
    generator?: string;
  };
  analyst_override?: { residual_risk: number };
  committee_decision?: { decision: string; conditions: { condition_id: string; description: string; owner: string; due_date: string; verification_criteria: string; status: string; verified_by?: string }[] };
  intake?: { title: string; change_type: string; business_rationale: string; business_owner: string; target_launch_date: string; jurisdictions: string[]; customer_exposure: string; delivery_channels: string[]; payment_characteristics: string[]; third_parties: string[]; proposed_controls: string[]; attachment_urls: string[] };
  document_evidence?: { document_id: string; title: string; document_type: string; content_sha256?: string; content_size_bytes?: number; original_filename?: string; media_type?: string; ingestion_method: "structured_text" | "uploaded_text"; extracted_jurisdictions: string[]; extracted_controls: string[]; risk_indicators: string[] }[];
};
type AuditEvent = { event_id: string; action: string; actor: string; occurred_at: string };
type EvidenceIntegrity = { document_id: string; valid: boolean; content_sha256?: string; content_size_bytes?: number };
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
type PolicySource = { source_id: string; source_version: number; title: string; topic: string; source_url?: string | null; synthetic_data: boolean; approved: boolean; effective_from: string; supersedes_source_id?: string | null; superseded_by_source_id?: string | null; reviewed_by?: string; retired_at?: string };
type WorkflowNotification = { notification_id: string; case_id: string; action: string; message: string; created_at: string; read_at?: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const steps = ["Intake", "Evidence", "Risk assessment", "Analyst review", "Committee decision"];
const initialIntake = {
  title: "Cross-border payments feature",
  change_type: "product_feature",
  business_rationale: "Enable cross-border payment processing for business customers.",
  business_owner: "Taylor Product Owner",
  target_launch_date: "2026-11-15T00:00",
  jurisdictions: "GB, US",
  customer_exposure: "moderate",
  delivery_channels: "web",
  payment_characteristics: "cross-border",
  third_parties: "Payment processor",
  proposed_controls: "Sanctions screening, Transaction monitoring",
  attachment_urls: "https://example.test/change-brief.pdf",
};
const riskFactors = ["customer", "product", "channel", "geography", "transaction", "third_party"] as const;
const applicationRoles = ["product_owner", "analyst", "committee_member", "auditor", "administrator"];

function IntakeField({ label, help, children, className }: { label: string; help: string; children: ReactNode; className?: string }) {
  return <label className={className}><span className="field-label-row"><span>{label}</span><details className="field-tip"><summary aria-label="Show field guidance" title={`Help: ${label}`}>i</summary><span role="tooltip">{help}</span></details></span>{children}</label>;
}

function asList(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function stepFor(status: CaseStatus) {
  return { draft: 0, intake_review: 1, analyst_review: 3, committee_decision: 4, decided: 4 }[status];
}

export default function Home() {
  const auth = useWorkbenchAuth();
  const [cases, setCases] = useState<Case[]>([]);
  const [activeCase, setActiveCase] = useState<Case | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [riskConfiguration, setRiskConfiguration] = useState<RiskConfiguration | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);
  const [oidcActor, setOidcActor] = useState<Actor | null>(null);
  const [oidcIdentityLoading, setOidcIdentityLoading] = useState(true);
  const [oidcIdentityError, setOidcIdentityError] = useState("");
  const [actorId, setActorId] = useState("product-owner");
  const activeActor = auth.mode === "demo" ? actors.find((actor) => actor.actor_id === actorId) : oidcActor ?? undefined;
  const identityReady = auth.mode === "demo" || (auth.configured && !auth.isLoading && auth.isAuthenticated && Boolean(activeActor));
  const [riskInput, setRiskInput] = useState({ customer: 4, product: 5, channel: 3, geography: 4, transaction: 5, third_party: 3, control_effectiveness: 2 });
  const [overrideInput, setOverrideInput] = useState({ residual_risk: 4, rationale: "Cross-border launch uncertainty warrants a higher residual-risk rating for committee review." });
  const [decisionInput, setDecisionInput] = useState({ decision: "approve_with_conditions", rationale: "Approval is appropriate once the specified control verification is completed.", description: "Verify sanctions-screening coverage before launch.", owner: "Taylor Product Owner", due_date: "2026-10-31T00:00", verification_criteria: "Provide a test report demonstrating coverage for GB and US payment routes." });
  const [message, setMessage] = useState("Create a case to begin the governed workflow.");
  const [working, setWorking] = useState(false);
  const [intake, setIntake] = useState(initialIntake);
  const [queueSearch, setQueueSearch] = useState("");
  const [queueStatus, setQueueStatus] = useState<CaseStatus | "all">("all");
  const [documentInput, setDocumentInput] = useState({ title: "Control test report", document_type: "control_test", content: "GB and US cross-border testing confirms sanctions screening and transaction monitoring.", source_url: "https://example.test/control-report.pdf" });
  const [evidenceUpload, setEvidenceUpload] = useState<File | null>(null);
  const [evidenceIntegrity, setEvidenceIntegrity] = useState<Record<string, EvidenceIntegrity>>({});
  const [policySources, setPolicySources] = useState<PolicySource[]>([]);
  const [officialPolicyInput, setOfficialPolicyInput] = useState({ source_id: "POLICY-EXTERNAL-01", source_version: 1, supersedes_source_id: "", title: "", topic: "risk_based_approach", excerpt: "", source_url: "" });
  const [notifications, setNotifications] = useState<WorkflowNotification[]>([]);

  async function request<T>(path: string, options?: RequestInit, protectedAction = false): Promise<T> {
    const identityHeaders = protectedAction ? await protectedHeaders() : {};
    const response = await fetch(`${apiUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...identityHeaders,
        ...options?.headers,
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail ?? "Workflow action failed.");
    }
    return response.json() as Promise<T>;
  }

  async function protectedHeaders(): Promise<Record<string, string>> {
    if (auth.mode === "oidc") return { Authorization: `Bearer ${await auth.getAccessToken()}` };
    return { "X-Actor-Id": actorId };
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

  useEffect(() => {
    if (auth.mode !== "oidc") {
      setOidcActor(null);
      setOidcIdentityError("");
      setOidcIdentityLoading(false);
      return;
    }
    if (auth.isLoading) return;
    if (!auth.isAuthenticated) {
      setOidcActor(null);
      setOidcIdentityError("");
      setOidcIdentityLoading(false);
      return;
    }

    let cancelled = false;
    setOidcIdentityLoading(true);
    void request<Actor>("/api/v1/identity/me", undefined, true)
      .then((actor) => {
        if (!cancelled) {
          setOidcActor(actor);
          setOidcIdentityError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setOidcActor(null);
          setOidcIdentityError(error instanceof Error ? error.message : "Unable to validate your workbench identity.");
        }
      })
      .finally(() => {
        if (!cancelled) setOidcIdentityLoading(false);
      });

    return () => { cancelled = true; };
  }, [auth.mode, auth.isLoading, auth.isAuthenticated]);

  useEffect(() => {
    if (!identityReady) return;
    const loads = [loadQueue(), loadRiskConfiguration(), loadPolicySources()];
    if (auth.mode === "demo") loads.push(loadActors());
    void Promise.all(loads);
  }, [identityReady, auth.mode]);
  useEffect(() => { if (identityReady) void loadNotifications(); }, [actorId, identityReady, oidcActor?.actor_id]);

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
        business_owner: auth.mode === "oidc" ? activeActor?.display_name ?? intake.business_owner : intake.business_owner,
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
      setMessage(updatingDraft ? "Draft intake revised and versioned." : "Intake created. Product owner submission is now required.");
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
      setMessage("Document evidence recorded and extracted for review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to record document evidence."); }
    finally { setWorking(false); }
  }

  async function uploadDocumentEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCase || !evidenceUpload) {
      setMessage("Select a UTF-8 text or Markdown document to upload.");
      return;
    }
    if (!['text/plain', 'text/markdown'].includes(evidenceUpload.type)) {
      setMessage("Only plain-text or Markdown evidence can be uploaded.");
      return;
    }
    setWorking(true);
    try {
      const payload = new FormData();
      payload.set("title", documentInput.title);
      payload.set("document_type", documentInput.document_type);
      payload.set("is_synthetic", "true");
      payload.set("file", evidenceUpload);
      const response = await fetch(`${apiUrl}/api/v1/cases/${activeCase.case_id}/document-evidence/upload`, {
        method: "POST",
        headers: await protectedHeaders(),
        body: payload,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail ?? "Evidence upload failed.");
      }
      setEvidenceUpload(null);
      await loadCase(activeCase.case_id);
      setMessage("Text evidence uploaded, hashed, and extracted for review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to upload document evidence."); }
    finally { setWorking(false); }
  }

  async function verifyDocumentEvidence(documentId: string) {
    if (!activeCase) return;
    setWorking(true);
    try {
      const verification = await request<EvidenceIntegrity>(`/api/v1/cases/${activeCase.case_id}/document-evidence/${documentId}/integrity`, undefined, true);
      setEvidenceIntegrity({ ...evidenceIntegrity, [documentId]: verification });
      setMessage(verification.valid ? "Evidence integrity verified." : "Evidence integrity verification failed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to verify document integrity."); }
    finally { setWorking(false); }
  }

  async function createOfficialPolicySource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    try {
      await request<PolicySource>("/api/v1/policy-sources", {
        method: "POST",
        body: JSON.stringify({ ...officialPolicyInput, supersedes_source_id: officialPolicyInput.supersedes_source_id || undefined, synthetic_data: false }),
      }, true);
      await loadPolicySources();
      setMessage("Sourced policy excerpt registered and awaiting committee approval.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to register sourced policy excerpt."); }
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
      requestAnimationFrame(() => document.getElementById("case-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setMessage("Workflow handoff acknowledged.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to acknowledge notification."); }
    finally { setWorking(false); }
  }

  async function downloadEvidencePackage() {
    if (!activeCase) return;
    setWorking(true);
    try {
      const response = await fetch(`${apiUrl}/api/v1/cases/${activeCase.case_id}/evidence-package`, { headers: await protectedHeaders() });
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
    return null;
  }

  const currentStep = activeCase ? stepFor(activeCase.status) : -1;
  const roleNavigation: { label: string; target: string }[] = {
    product_owner: [{ label: "Inbox", target: "work-inbox" }, { label: "New intake", target: "product-intake" }, { label: "Evidence & case", target: "case-workspace" }, { label: "My cases", target: "case-queue" }],
    analyst: [{ label: "Inbox", target: "work-inbox" }, { label: "Case queue", target: "case-queue" }, { label: "Active review", target: "case-workspace" }, { label: "Scoring rules", target: "risk-configuration" }],
    committee_member: [{ label: "Inbox", target: "work-inbox" }, { label: "Case queue", target: "case-queue" }, { label: "Policy sources", target: "policy-library" }, { label: "Decision review", target: "case-workspace" }],
    administrator: [{ label: "Inbox", target: "work-inbox" }, { label: "Policy sources", target: "policy-library" }, { label: "Scoring rules", target: "risk-configuration" }, { label: "Case queue", target: "case-queue" }],
    auditor: [{ label: "Case queue", target: "case-queue" }, { label: "Audit timeline", target: "audit-timeline" }, { label: "Case details", target: "case-workspace" }],
  }[activeActor?.role ?? ""] ?? [];
  const visibleCases = cases.filter((item) => {
    const matchesSearch = `${item.case_id} ${item.title} ${item.change_type}`.toLowerCase().includes(queueSearch.toLowerCase());
    return matchesSearch && (queueStatus === "all" || item.status === queueStatus);
  });

  if (auth.mode === "invalid") return <main className="auth-gate"><p className="eyebrow">WORKBENCH CONFIGURATION</p><h1>Authentication mode is invalid</h1><p>Set NEXT_PUBLIC_AUTH_MODE to either demo or oidc.</p></main>;
  if (auth.mode === "oidc" && !auth.configured) return <main className="auth-gate"><p className="eyebrow">AUTH0 CONFIGURATION</p><h1>Sign-in is not configured</h1><p>Set NEXT_PUBLIC_AUTH0_DOMAIN, NEXT_PUBLIC_AUTH0_CLIENT_ID, and NEXT_PUBLIC_AUTH0_AUDIENCE in the frontend environment, then rebuild and redeploy.</p></main>;
  if (auth.mode === "oidc" && (auth.isLoading || oidcIdentityLoading)) return <main className="auth-gate"><p className="eyebrow">AUTH0</p><h1>Checking your session</h1></main>;
  if (auth.mode === "oidc" && !auth.isAuthenticated) return <main className="auth-gate"><p className="eyebrow">SECURE WORKBENCH</p><h1>Risk Assessment Workbench</h1><p>Sign in with your assigned FCRM role to continue.</p><button type="button" onClick={() => void auth.login()}>Sign in</button></main>;
  if (auth.mode === "oidc" && !activeActor) return <main className="auth-gate"><p className="eyebrow">IDENTITY NOT AUTHORIZED</p><h1>Could not validate your workbench identity</h1><p>{oidcIdentityError || `The API token must include ${FCRM_ROLE_CLAIM} with one of: ${applicationRoles.join(", ")}.`}</p><button type="button" onClick={auth.logout}>Sign out</button></main>;

  const unreadHandoffs = notifications.filter((notification) => !notification.read_at).length;
  const inbox = <details className="inbox" id="work-inbox">
    <summary><span className="label">WORKFLOW INBOX</span><span>{unreadHandoffs} open handoff(s)</span></summary>
    {notifications.length ? <ul>{notifications.slice(0, 5).map((notification) => <li className={notification.read_at ? "read" : "unread"} key={notification.notification_id}><div><strong>{notification.action.replaceAll("_", " ")}</strong><span>{notification.message} · {notification.case_id}</span></div>{notification.read_at ? <small>Acknowledged</small> : <button type="button" disabled={working} onClick={() => void acknowledgeNotification(notification)}>Open and acknowledge</button>}</li>)}</ul> : <p className="muted">No workflow handoffs for this role.</p>}
  </details>;

  return <main>
    <header><div><p className="brand">Myridius.ai <span>FCRM workbench</span></p><h1>Risk Assessment Workbench</h1></div><div className="identity">{auth.mode === "demo" ? <><span className="environment">DEMO MODE</span><label>Acting as<select value={actorId} onChange={(event) => setActorId(event.target.value)}>{actors.map((actor) => <option value={actor.actor_id} key={actor.actor_id}>{actor.display_name} · {actor.role.replaceAll("_", " ")}</option>)}</select></label></> : <><span className="environment">OIDC AUTHENTICATED</span><span>{activeActor?.display_name} · {activeActor?.role.replaceAll("_", " ")}</span><button type="button" onClick={auth.logout}>Sign out</button></>}</div></header>
    <section className="demo-bar" aria-live="polite"><span>{message}</span></section>
    {roleNavigation.length > 0 && <nav className="role-navigation" aria-label={`${activeActor?.role.replaceAll("_", " ")} workflow navigation`}><span>WORKSPACE</span>{roleNavigation.map((item) => <a href={`#${item.target}`} key={item.target}>{item.label}</a>)}</nav>}
    {riskConfiguration && onlyRoles(["analyst", "committee_member", "administrator"], <section className="configuration" id="risk-configuration">
      <div><p className="label">ACTIVE SCORING CONFIGURATION</p><h2>{riskConfiguration.version}</h2><p className="muted">Updated by {riskConfiguration.updated_by} · {new Date(riskConfiguration.updated_at).toLocaleDateString()}</p></div>
      <dl>
        <div><dt>Factor weights</dt><dd>{Object.entries(riskConfiguration.factor_weights).map(([factor, weight]) => `${factor}: ${weight}`).join(" · ")}</dd></div>
        <div><dt>Residual-risk floor</dt><dd>1 / 5</dd></div>
        <div><dt>Rating bands</dt><dd>Low ≤ {riskConfiguration.low_risk_maximum}; moderate ≤ {riskConfiguration.moderate_risk_maximum}</dd></div>
        <div><dt>Control mitigation</dt><dd>Effectiveness ÷ {riskConfiguration.control_mitigation_divisor}</dd></div>
      </dl>
    </section>)}
    {onlyRoles(["administrator", "committee_member"], <section className="policy-register" id="policy-library">
      <div><p className="label">GOVERNED POLICY REGISTER</p><h2>Policy source review</h2><p className="muted">Sourced materials require committee approval before they can be cited in new drafts.</p></div>
      <p className="muted">Register source-linked revisions. Committee approval activates a revision and retires the prior approved version.</p><p className="policy-warning">Sample policy entries are for demonstration only, are not authoritative guidance, and are excluded from OIDC assessments.</p>
      {activeActor?.role === "administrator" && <form className="policy-form" onSubmit={(event) => void createOfficialPolicySource(event)}>
        <label>Source ID<input required pattern="[A-Z0-9-]{4,80}" value={officialPolicyInput.source_id} onChange={(event) => setOfficialPolicyInput({ ...officialPolicyInput, source_id: event.target.value })} /></label>
        <label>Topic<input required value={officialPolicyInput.topic} onChange={(event) => setOfficialPolicyInput({ ...officialPolicyInput, topic: event.target.value })} /></label>
        <label>Title<input required minLength={10} value={officialPolicyInput.title} onChange={(event) => setOfficialPolicyInput({ ...officialPolicyInput, title: event.target.value })} /></label>
        <label>Source URL<input required type="url" value={officialPolicyInput.source_url} onChange={(event) => setOfficialPolicyInput({ ...officialPolicyInput, source_url: event.target.value })} /></label>
        <label>Policy excerpt<textarea required minLength={20} value={officialPolicyInput.excerpt} onChange={(event) => setOfficialPolicyInput({ ...officialPolicyInput, excerpt: event.target.value })} /></label>
        <label>Revision of<select value={officialPolicyInput.supersedes_source_id} onChange={(event) => { const previous = policySources.find((source) => source.source_id === event.target.value); setOfficialPolicyInput({ ...officialPolicyInput, supersedes_source_id: event.target.value, source_version: previous ? previous.source_version + 1 : 1, topic: previous?.topic ?? officialPolicyInput.topic }); }}><option value="">New source (version 1)</option>{policySources.filter((source) => source.approved && !source.retired_at && !source.superseded_by_source_id && !source.synthetic_data).map((source) => <option key={source.source_id} value={source.source_id}>{source.source_id} · v{source.source_version}</option>)}</select></label>
        <label>Version<input type="number" min="1" value={officialPolicyInput.source_version} readOnly /></label>
        <button type="submit" disabled={working}>Register source for review</button>
      </form>}
      <ul className="policy-list">{policySources.map((source) => <li key={source.source_id}><strong>{source.title}</strong><span>{source.source_id} · v{source.source_version} · {source.topic} · effective {new Date(source.effective_from).toLocaleDateString()} · {source.synthetic_data ? "demo sample · " : ""}{source.retired_at ? source.superseded_by_source_id ? `superseded by ${source.superseded_by_source_id}` : "retired" : source.approved ? "approved" : "pending review"}</span>{source.source_url && <a href={source.source_url} target="_blank" rel="noreferrer">Open source</a>}{activeActor?.role === "committee_member" && !source.approved && !source.retired_at && <button type="button" disabled={working} onClick={() => void approvePolicySource(source.source_id)}>Approve</button>}{activeActor?.role === "administrator" && source.approved && <button type="button" disabled={working} onClick={() => void retirePolicySource(source.source_id)}>Retire</button>}</li>)}</ul>
    </section>)}
    {onlyRoles(["product_owner"], <form className="intake-form" id="product-intake" onSubmit={(event) => void createCase(event)}>
      <div><p className="label">PRODUCT OWNER INTAKE</p><h2>{activeCase?.status === "draft" ? `Revise ${activeCase.case_id}` : "Create change case"}</h2><p className="muted">Describe the proposed change and its expected customer, operational, and control impact.</p></div>
      <IntakeField label="Change title" help="Use a short, specific name that identifies the product, process, vendor, or customer change."><input required minLength={8} maxLength={160} value={intake.title} onChange={(event) => setIntake({ ...intake, title: event.target.value })} /></IntakeField>
      <IntakeField label="Change type" help="Choose the category that best describes the primary change."><select value={intake.change_type} onChange={(event) => setIntake({ ...intake, change_type: event.target.value })}><option value="product">Product</option><option value="product_feature">Product feature</option><option value="process">Process</option><option value="vendor">Vendor</option><option value="geography">Geography</option><option value="customer_segment">Customer segment</option></select></IntakeField>
      <IntakeField label="Business owner" help="The signed-in account responsible for this intake and follow-up, filled from your verified identity."><input required minLength={3} readOnly={auth.mode === "oidc"} value={auth.mode === "oidc" ? activeActor?.display_name ?? intake.business_owner : intake.business_owner} onChange={(event) => setIntake({ ...intake, business_owner: event.target.value })} /></IntakeField>
      <IntakeField label="Target launch" help="Enter the expected date and time the change will reach customers or production."><input required type="datetime-local" value={intake.target_launch_date} onChange={(event) => setIntake({ ...intake, target_launch_date: event.target.value })} /></IntakeField>
      <IntakeField label="Customer exposure" help="Estimate customer impact if the change creates financial-crime risk: low, moderate, or high."><select value={intake.customer_exposure} onChange={(event) => setIntake({ ...intake, customer_exposure: event.target.value })}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></IntakeField>
      <IntakeField label="Jurisdictions" help="List countries or territories where the change will operate, separated by commas."><input required value={intake.jurisdictions} onChange={(event) => setIntake({ ...intake, jurisdictions: event.target.value })} /></IntakeField>
      <IntakeField label="Delivery channels" help="List how customers access the product, such as web, mobile, branch, or API."><input required value={intake.delivery_channels} onChange={(event) => setIntake({ ...intake, delivery_channels: event.target.value })} /></IntakeField>
      <IntakeField label="Payment characteristics" help="Describe payment types, flows, currencies, speed, or cross-border features."><input required value={intake.payment_characteristics} onChange={(event) => setIntake({ ...intake, payment_characteristics: event.target.value })} /></IntakeField>
      <IntakeField label="Third parties" help="List vendors or other external parties involved. Vendor changes require at least one party."><>{intake.change_type === "vendor" && <span className="required">Required for vendor changes</span>}<input required={intake.change_type === "vendor"} value={intake.third_parties} onChange={(event) => setIntake({ ...intake, third_parties: event.target.value })} /></></IntakeField>
      <IntakeField label="Proposed controls" help="List safeguards planned to prevent or detect financial-crime risks, separated by commas."><input required value={intake.proposed_controls} onChange={(event) => setIntake({ ...intake, proposed_controls: event.target.value })} /></IntakeField>
      <IntakeField label="Attachment URLs" help="Optionally link supporting briefs, diagrams, test results, or control documentation."><input type="url" value={intake.attachment_urls} onChange={(event) => setIntake({ ...intake, attachment_urls: event.target.value })} /></IntakeField>
      <IntakeField className="rationale" label="Business rationale" help="Explain the business need, expected benefit, affected customers, and material operational or risk changes."><textarea required minLength={20} maxLength={2000} value={intake.business_rationale} onChange={(event) => setIntake({ ...intake, business_rationale: event.target.value })} /></IntakeField>
      <div className="intake-actions"><button type="submit" disabled={working}>{activeCase?.status === "draft" ? "Save draft revision" : "Create intake"}</button>{activeCase?.status === "draft" && <button className="secondary" type="button" disabled={working} onClick={() => { setActiveCase(null); setEvents([]); setIntake(initialIntake); }}>Start new intake</button>}</div>
    </form>)}
    {activeCase?.status === "draft" && onlyRoles(["product_owner"], <form className="action-form evidence-upload" id="evidence-upload" onSubmit={(event) => void uploadDocumentEvidence(event)}>
      <p className="label">TEXT DOCUMENT UPLOAD</p>
      <label>Document title<input required minLength={5} maxLength={200} value={documentInput.title} onChange={(event) => setDocumentInput({ ...documentInput, title: event.target.value })} /></label>
      <label>Document type<input required minLength={3} maxLength={100} value={documentInput.document_type} onChange={(event) => setDocumentInput({ ...documentInput, document_type: event.target.value })} /></label>
      <label>Source URL (optional)<input type="url" value={documentInput.source_url} onChange={(event) => setDocumentInput({ ...documentInput, source_url: event.target.value })} /></label>
      <label>Document text<textarea required minLength={20} maxLength={20000} value={documentInput.content} onChange={(event) => setDocumentInput({ ...documentInput, content: event.target.value })} /></label>
      <button type="submit" disabled={working || !evidenceUpload}>Upload and extract evidence</button>
    </form>)}
    {activeCase?.document_evidence?.length ? <section className="evidence-provenance">
      <p className="label">EVIDENCE PROVENANCE</p>
      <h2>Recorded evidence</h2>
      <p className="muted">Server-calculated hashes are available for integrity review.</p>
      <ul>{activeCase.document_evidence.map((evidence) => { const verification = evidenceIntegrity[evidence.document_id]; return <li key={evidence.document_id}><div><strong>{evidence.title}</strong><span>{evidence.ingestion_method === "uploaded_text" ? `${evidence.original_filename} · ${evidence.media_type}` : "Structured text"}</span><span>SHA-256: {evidence.content_sha256 ?? "not recorded"} · {evidence.content_size_bytes ?? 0} bytes</span></div>{activeActor?.role !== "administrator" && <button type="button" disabled={working} onClick={() => void verifyDocumentEvidence(evidence.document_id)}>Verify integrity</button>}{verification && <span className={verification.valid ? "integrity-valid" : "integrity-invalid"}>{verification.valid ? "Integrity verified" : "Integrity failed"}</span>}</li>; })}</ul>
    </section> : null}
    <section className="workspace">
      <aside className="case-list" id="case-queue">
        <p className="label">CASE QUEUE · {visibleCases.length}/{cases.length}</p>
        <div className="queue-filters">
          <input aria-label="Search cases" placeholder="Search case queue" value={queueSearch} onChange={(event) => setQueueSearch(event.target.value)} />
          <select aria-label="Filter by status" value={queueStatus} onChange={(event) => setQueueStatus(event.target.value as CaseStatus | "all")}>
            <option value="all">All statuses</option>
            {["draft", "intake_review", "analyst_review", "committee_decision", "decided"].map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
          </select>
        </div>
        {visibleCases.length ? visibleCases.map((item) => <button className={activeCase?.case_id === item.case_id ? "case-item selected" : "case-item"} type="button" key={item.case_id} onClick={() => void loadCase(item.case_id)}>
          <span className="case-title">{item.title}</span>
          <span>{item.case_id} · {item.status.replace("_", " ")}</span>
        </button>) : <p className="muted">No cases match this queue view.</p>}
      </aside>
      <section className="case-content" id="case-workspace">
        {!activeCase ? <div className="empty"><h2>Start a governed assessment</h2><p>Create a case, then progress it through explicit human gates.</p></div> : <>
          <section className="summary">
            <div><p className="label">{activeCase.status.replace("_", " ").toUpperCase()}</p><h2>{activeCase.title}</h2><p className="muted">{activeCase.case_id} · Version {activeCase.version} · {activeCase.change_type.replace("_", " ")}</p></div>
            <div className="risk">
              <span>Residual risk</span>
              <strong>{activeCase.residual_risk} / 5</strong>
              <small>{activeCase.risk_assessment?.rating ?? "Not assessed"}</small>
            </div>
          </section>
          <section className="workflow">{steps.map((step, index) => <div className={index < currentStep ? "step complete" : index === currentStep ? "step current" : "step"} key={step}>
            <span>{index + 1}</span>
            <p>{step}</p>
          </div>)}</section>
          <section className="decision-pack">
            <div><p className="label">DECISION PACK</p><h2>Review material</h2></div>
            <dl>
              <div><dt>Jurisdictions</dt><dd>{activeCase.intake?.jurisdictions.join(", ")}</dd></div>
              <div><dt>Proposed controls</dt><dd>{activeCase.intake?.proposed_controls.join(", ")}</dd></div>
              <div><dt>Evidence records</dt><dd>{activeCase.document_evidence?.length ?? 0}</dd></div>
              <div><dt>Policy citations</dt><dd>{activeCase.assessment_draft?.citations.length ?? 0}</dd></div>
            </dl>
            {activeCase.document_evidence?.length ? <ul>{activeCase.document_evidence.map((evidence) => <li key={evidence.document_id}><strong>{evidence.title}</strong><span>{evidence.document_type} · controls: {evidence.extracted_controls.join(", ") || "none detected"} · indicators: {evidence.risk_indicators.join(", ") || "none detected"}</span></li>)}</ul> : <p className="muted">No structured evidence recorded.</p>}
          </section>
          {activeCase.risk_assessment?.factor_scores && <section className="risk-breakdown">
            <div><p className="label">DETERMINISTIC RISK BREAKDOWN</p><h2>How the score was calculated</h2><p className="muted">Analyst-entered factor scores are combined using the configuration saved with this assessment. Controls reduce, but never eliminate, residual risk.</p></div>
            <p className="risk-method">{activeCase.risk_assessment.configuration_version ?? activeCase.risk_assessment.configuration_snapshot?.version ?? "risk-config-v1"} · Control effectiveness {activeCase.risk_assessment.control_effectiveness}/4 · Inherent {activeCase.inherent_risk}/5 · Residual {activeCase.residual_risk}/5</p>
            <ul>{Object.entries(activeCase.risk_assessment.factor_scores).map(([factor, score]) => <li key={factor}><span>{factor.replaceAll("_", " ")}</span><strong>{score} / 5</strong><small>Weight {activeCase.risk_assessment?.configuration_snapshot?.factor_weights?.[factor] ?? riskConfiguration?.factor_weights[factor] ?? "n/a"}</small></li>)}</ul>
          </section>}
          <section className="content">
            <article>
              <p className="label">HUMAN ACTION REQUIRED</p>
              <h2>{activeCase.status === "draft" ? "Product owner submission" : activeCase.status === "intake_review" ? "Run deterministic assessment" : activeCase.status === "analyst_review" ? "Analyst recommendation" : activeCase.status === "committee_decision" ? "Committee decision" : "Decision recorded"}</h2>
              <p>The workflow cannot advance autonomously. Every material action records an audit event.</p>
              <div className="facts">
                <div><span>Inherent risk</span><strong>{activeCase.inherent_risk} / 5</strong></div>
                <div><span>Control effectiveness</span><strong>{activeCase.risk_assessment?.control_effectiveness ?? "-"} / 4</strong></div>
                <div><span>Audit events</span><strong>{events.length}</strong></div>
              </div>
              {activeCase.status === "draft" && onlyRoles(["product_owner"], <><form className="action-form draft-evidence-form" id="record-evidence-form" onSubmit={(event) => void addDocumentEvidence(event)}>
                <p className="label">DOCUMENT EVIDENCE</p>
                <label>Document title<input required minLength={5} maxLength={200} value={documentInput.title} onChange={(event) => setDocumentInput({ ...documentInput, title: event.target.value })} /></label>
                <label>Document type<input required minLength={3} maxLength={100} value={documentInput.document_type} onChange={(event) => setDocumentInput({ ...documentInput, document_type: event.target.value })} /></label>
                <label>Source URL (optional)<input type="url" value={documentInput.source_url} onChange={(event) => setDocumentInput({ ...documentInput, source_url: event.target.value })} /></label>
                <label>Document text<textarea required minLength={20} maxLength={20000} value={documentInput.content} onChange={(event) => setDocumentInput({ ...documentInput, content: event.target.value })} /></label>
              </form><div className="draft-actions"><button type="submit" form="record-evidence-form" disabled={working}>Record and extract evidence</button><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/submit`, "Case submitted for intake review.")}>Submit for intake review</button></div></>)}
              {activeCase.status === "intake_review" && onlyRoles(["analyst"], <form className="action-form" onSubmit={(event) => { event.preventDefault(); void advance(`/api/v1/cases/${activeCase.case_id}/risk-assessment`, "Deterministic assessment completed; analyst review is required.", { customer_risk: riskInput.customer, product_risk: riskInput.product, channel_risk: riskInput.channel, geography_risk: riskInput.geography, transaction_risk: riskInput.transaction, third_party_risk: riskInput.third_party, control_effectiveness: riskInput.control_effectiveness, analyst: activeActor?.display_name ?? "Analyst" }); }}><p className="label">ANALYST RISK INPUTS</p>
                <div className="risk-inputs">
                  {riskFactors.map((factor) => <label key={factor}>{factor.replace("_", " ")} risk<input required type="number" min="1" max="5" value={riskInput[factor]} onChange={(event) => setRiskInput({ ...riskInput, [factor]: Number(event.target.value) })} /></label>)}<label>Control effectiveness<input required type="number" min="0" max="4" value={riskInput.control_effectiveness} onChange={(event) => setRiskInput({ ...riskInput, control_effectiveness: Number(event.target.value) })} /></label>
                </div>
                <button type="submit" disabled={working}>Run risk assessment</button>
              </form>)}
              {activeCase.status === "analyst_review" && <>{onlyRoles(["analyst"], <><div className="actions"><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/assessment-draft`, "Cited assessment draft prepared for analyst review.")}>Prepare cited draft</button><button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/send-to-committee`, "Case sent to committee.")}>Send to committee</button></div><form className="action-form" onSubmit={(event) => { event.preventDefault(); void advance(`/api/v1/cases/${activeCase.case_id}/risk-override`, "Analyst override recorded with rationale.", { ...overrideInput, analyst: activeActor?.display_name ?? "Analyst" }); }}><p className="label">ANALYST OVERRIDE</p>
                <label>Residual risk<input required type="number" min="1" max="5" value={overrideInput.residual_risk} onChange={(event) => setOverrideInput({ ...overrideInput, residual_risk: Number(event.target.value) })} /></label>
                <label>Rationale<textarea required minLength={20} maxLength={2000} value={overrideInput.rationale} onChange={(event) => setOverrideInput({ ...overrideInput, rationale: event.target.value })} /></label>
                <button type="submit" disabled={working}>Record override</button>
              </form></>)}{activeCase.assessment_draft && <section className="draft">
                <p className="label">ASSESSMENT DRAFT · {activeCase.assessment_draft.decision_authority.replace("_", " ")}</p>
                <p>{activeCase.assessment_draft.summary}</p>
                <p className="muted">Generated by: {activeCase.assessment_draft.generator ?? "unknown provider"}{typeof activeCase.assessment_draft.actual_input_tokens === "number" && ` · ${activeCase.assessment_draft.actual_input_tokens} input / ${activeCase.assessment_draft.actual_output_tokens ?? 0} output tokens`}</p>
                <div className="draft-section">
                  <h3>Risk factor analysis</h3>
                  {activeCase.assessment_draft.risk_factor_analysis?.length ? <ul className="factor-analysis">{activeCase.assessment_draft.risk_factor_analysis.map((insight) => <li key={insight.factor}><div><strong>{insight.factor.replaceAll("_", " ")}</strong><span className="factor-score">{insight.score} / 5</span></div><p>{insight.rationale}</p>{insight.evidence_refs.length > 0 && <small>Evidence: {insight.evidence_refs.map((reference) => activeCase.document_evidence?.find((document) => document.document_id === reference)?.title ?? reference).join(", ")}</small>}</li>)}</ul> : <p className="muted">No factor-level analysis was returned.</p>}
                </div>
                <div className="draft-section">
                  <h3>Control observations</h3>
                  {activeCase.assessment_draft.control_observations?.length ? <ul>{activeCase.assessment_draft.control_observations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="muted">No control observations.</p>}
                </div>
                <div className="draft-section">
                  <h3>Evidence gaps</h3>
                  {activeCase.assessment_draft.evidence_gaps?.length ? <ul>{activeCase.assessment_draft.evidence_gaps.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="muted">No evidence gaps identified.</p>}
                </div>
                <div className="draft-section">
                  <h3>Analyst questions</h3>
                  <ul>{activeCase.assessment_draft.analyst_questions.map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}</ul>
                </div>
                <div className="draft-section">
                  <h3>Approved source excerpts</h3>
                  <ul className="citation-list">{activeCase.assessment_draft.citations.map((citation) => <li key={citation.source_id}><strong>{citation.title}</strong><span>{citation.source_id} · v{citation.source_version} · {citation.topic}</span>{citation.synthetic_data && <small className="synthetic-source-label">DEMO SAMPLE · NOT AUTHORITATIVE</small>}<p>{citation.excerpt}</p>{citation.source_url && <a href={citation.source_url} target="_blank" rel="noreferrer">Open source</a>}</li>)}</ul>
                </div>
                <details className="draft-context">
                  <summary>Generation context and provenance</summary>
                  <p><strong>Retrieval:</strong> {activeCase.assessment_draft.retrieval_query}</p>
                  <p><strong>Prompt:</strong> {activeCase.assessment_draft.prompt_version} · <strong>Execution:</strong> {activeCase.assessment_draft.execution_id}</p>
                  <ul>{activeCase.assessment_draft.evidence_context.map((context, index) => <li key={`${index}-${context}`}>{context}</li>)}</ul>
                </details>
              </section>}</>}
              {activeCase.status === "committee_decision" && onlyRoles(["committee_member"], <form className="action-form" onSubmit={(event) => { event.preventDefault(); const conditionalApproval = decisionInput.decision === "approve_with_conditions"; void advance(`/api/v1/cases/${activeCase.case_id}/committee-decision`, "Human committee decision recorded.", { decision: decisionInput.decision, rationale: decisionInput.rationale, committee_member: activeActor?.display_name ?? "Committee member", conditions: conditionalApproval ? [{ description: decisionInput.description, owner: decisionInput.owner, due_date: new Date(decisionInput.due_date).toISOString(), verification_criteria: decisionInput.verification_criteria }] : [] }); }}><p className="label">COMMITTEE DECISION</p>
                <label>Decision<select value={decisionInput.decision} onChange={(event) => setDecisionInput({ ...decisionInput, decision: event.target.value })}><option value="approve">Approve</option><option value="reject">Reject</option><option value="defer">Defer</option><option value="approve_with_conditions">Approve with conditions</option></select></label>
                <label>Decision rationale<textarea required minLength={20} maxLength={2000} value={decisionInput.rationale} onChange={(event) => setDecisionInput({ ...decisionInput, rationale: event.target.value })} /></label>
                {decisionInput.decision === "approve_with_conditions" && <div className="condition-fields">
                  <label>Condition description<input required minLength={10} value={decisionInput.description} onChange={(event) => setDecisionInput({ ...decisionInput, description: event.target.value })} /></label>
                  <label>Condition owner<input required minLength={3} value={decisionInput.owner} onChange={(event) => setDecisionInput({ ...decisionInput, owner: event.target.value })} /></label>
                  <label>Due date<input required type="datetime-local" value={decisionInput.due_date} onChange={(event) => setDecisionInput({ ...decisionInput, due_date: event.target.value })} /></label>
                  <label>Verification criteria<textarea required minLength={10} maxLength={1000} value={decisionInput.verification_criteria} onChange={(event) => setDecisionInput({ ...decisionInput, verification_criteria: event.target.value })} /></label>
                </div>}
                <button type="submit" disabled={working}>Record committee decision</button>
              </form>)}
              {activeCase.status === "decided" && <><p className="decision">{activeCase.committee_decision?.decision.replaceAll("_", " ")} · {activeCase.committee_decision?.conditions.length ?? 0} condition(s)</p>
                {activeCase.committee_decision?.conditions.map((condition) => <div className="condition" key={condition.condition_id}><strong>{condition.description}</strong><span>{condition.status} · {condition.owner} · due {new Date(condition.due_date).toLocaleDateString()}</span><small>{condition.verification_criteria}</small>{condition.status === "open" && onlyRoles(["analyst"], <button type="button" disabled={working} onClick={() => void advance(`/api/v1/cases/${activeCase.case_id}/conditions/${condition.condition_id}/verify`, "Condition verification recorded.", { verifier: "Alex FCRM Analyst", evidence_summary: "Reviewed the test report confirming sanctions coverage for GB and US payment routes." })}>Verify condition</button>)}{condition.verified_by && <small>Verified by {condition.verified_by}</small>}</div>)}{onlyRoles(["auditor", "analyst", "committee_member"], <button type="button" disabled={working} onClick={() => void downloadEvidencePackage()}>Download evidence package</button>)}</>}
            </article><aside id="audit-timeline"><p className="label">AUDIT TIMELINE</p><ol className="timeline">{events.map((event) => <li key={event.event_id}><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.actor}</span><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time></li>)}</ol></aside></section>
        </>}
      </section>
    </section>
    {inbox}
  </main>;
}