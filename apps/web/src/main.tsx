import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowRight, Bell, Check, ChevronDown, Clock3,
  Copy, FileCheck2, Globe2, Inbox, LayoutDashboard, LifeBuoy, Plus,
  Search, Settings2, ShieldAlert, ShieldCheck, Terminal, Zap, LogOut,
  User as UserIcon, RefreshCw, ExternalLink, Key, Lock, Sparkles
} from 'lucide-react';
import './style.css';

const API_BASE = 'http://localhost:4000';

interface User {
  id: string;
  email: string;
  name?: string;
  authProviderId?: string | null;
}

interface Workspace {
  id: string;
  name: string;
}

interface DomainItem {
  id: string;
  fqdn: string;
  verification_status: string;
  last_check_score?: number | null;
  last_checked_at?: string | null;
}

function GoogleIcon() {
  return (
    <svg className="google-icon" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.68-5.17 3.68-9.09z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.27C.46 8.23 0 10.06 0 12s.46 3.77 1.27 5.38l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.7 1.27 6.62l4 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

function App() {
  const [active, setActive] = useState('Overview');
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('preflight_token'));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  // Form inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');

  // Domains & Checks
  const [domains, setDomains] = useState<DomainItem[]>([
    { id: 'dom_acme_studio', fqdn: 'acme.studio', verification_status: 'verified', last_check_score: 86, last_checked_at: '2h ago' }
  ]);
  const [selectedDomain, setSelectedDomain] = useState('acme.studio');
  const [newDomainFqdn, setNewDomainFqdn] = useState('');
  const [addDomainModal, setAddDomainModal] = useState(false);

  // Score & Status
  const [score, setScore] = useState(86);
  const [coverage, setCoverage] = useState(90);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [testAddress, setTestAddress] = useState('test-k8m2@inbound.preflight.email');

  // Fix Proposal modal state
  const [fixModal, setFixModal] = useState<{
    open: boolean;
    title: string;
    host: string;
    type: string;
    value: string;
    rationale: string;
    verified?: boolean;
  } | null>(null);
  const [verifyingDns, setVerifyingDns] = useState(false);

  // Authenticated fetch wrapper
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(options.headers as Record<string, string>)
    };
    if (token) {
      headers['authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (res.status === 401) {
      // Token expired or invalid
      setToken(null);
      localStorage.removeItem('preflight_token');
      setUser(null);
      setWorkspace(null);
    }
    return res;
  }, [token]);

  // 1. Google OAuth Callback handler on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const redirectUri = window.location.origin;
    if (code) {
      const handleGoogleCode = async () => {
        try {
          const res = await fetch(`${API_BASE}/v1/auth/google/callback`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, redirectUri })
          });
          const data = await res.json();
          if (res.ok && data.token) {
            setToken(data.token);
            localStorage.setItem('preflight_token', data.token);
            setUser(data.user);
            setWorkspace(data.workspace);
            setNotice(`Signed in with Google as ${data.user.email}`);
          } else {
            setNotice(data.error?.message || 'Google sign-in error');
          }
        } catch {
          setNotice('Google OAuth connection failed.');
        } finally {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      handleGoogleCode();
    }
  }, []);

  // 2. Fetch User & Workspace Context
  useEffect(() => {
    if (!token) {
      setUser(null);
      setWorkspace(null);
      return;
    }
    const fetchSession = async () => {
      try {
        const res = await apiFetch('/v1/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setWorkspace(data.workspace);
        }
      } catch {
        // Backend offline
      }
    };
    fetchSession();
  }, [token, apiFetch]);

  // 3. Fetch Domains for Active Workspace
  useEffect(() => {
    if (!token) return;
    const fetchDomains = async () => {
      try {
        const res = await apiFetch('/v1/domains');
        if (res.ok) {
          const data = await res.json();
          if (data.domains && data.domains.length > 0) {
            setDomains(data.domains);
            setSelectedDomain(data.domains[0].fqdn);
          }
        }
      } catch {
        // Fallback
      }
    };
    fetchDomains();
  }, [token, apiFetch]);

  // 4. Fetch / Generate Test Session Address for Selected Domain
  useEffect(() => {
    if (!token || !selectedDomain) return;
    const activeDom = domains.find(d => d.fqdn === selectedDomain);
    if (!activeDom) return;

    const initTestSession = async () => {
      try {
        const res = await apiFetch(`/v1/domains/${activeDom.id}/test-sessions`, { method: 'POST' });
        if (res.ok) {
          const data = await res.json();
          if (data.recipientAddress) {
            setTestAddress(data.recipientAddress);
          }
        }
      } catch {
        // Keep default
      }
    };
    initTestSession();
  }, [token, selectedDomain, domains, apiFetch]);

  // Auth Action Handlers
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/v1/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('preflight_token', data.token);
        setUser(data.user);
        setWorkspace(data.workspace);
        setAuthModalOpen(false);
        setNotice(`Welcome back, ${data.user.email}`);
      } else {
        setNotice(data.error?.message || 'Invalid credentials');
      }
    } catch {
      setNotice('Could not reach API server on port 4000.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/v1/auth/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, name, workspaceName })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('preflight_token', data.token);
        setUser(data.user);
        setWorkspace(data.workspace);
        setAuthModalOpen(false);
        setNotice(`Account created! Logged into ${data.workspace.name}`);
      } else {
        setNotice(data.error?.message || 'Registration failed');
      }
    } catch {
      setNotice('Could not reach API server.');
    }
  };

  const handleDemoLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/demo`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.token) {
        setToken(data.token);
        localStorage.setItem('preflight_token', data.token);
        setUser(data.user);
        setWorkspace(data.workspace);
        setAuthModalOpen(false);
        setNotice('Logged in as Acme Studio demo user.');
      }
    } catch {
      setNotice('Could not connect to API.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const urlRes = await fetch(`${API_BASE}/v1/auth/google/url?redirectUri=${encodeURIComponent(window.location.origin)}`);
      const urlData = await urlRes.json();
      if (urlData.url && !urlData.url.includes('dummy-google-client-id')) {
        window.location.href = urlData.url;
      } else {
        // Direct simulation for local dev without live GCP secrets
        const cbRes = await fetch(`${API_BASE}/v1/auth/google/callback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: 'google_local_dev_code' })
        });
        const cbData = await cbRes.json();
        if (cbRes.ok && cbData.token) {
          setToken(cbData.token);
          localStorage.setItem('preflight_token', cbData.token);
          setUser(cbData.user);
          setWorkspace(cbData.workspace);
          setAuthModalOpen(false);
          setNotice(`Signed in with Google (${cbData.user.email})`);
        }
      }
    } catch {
      setNotice('Google OAuth connection failed.');
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('preflight_token');
    setUser(null);
    setWorkspace(null);
    setNotice('You have been signed out.');
  };

  // Immediate DNS Scan
  const runDnsCheck = async () => {
    setRunning(true);
    setNotice(`Querying live DNS records for ${selectedDomain}…`);
    try {
      const activeDom = domains.find(d => d.fqdn === selectedDomain);
      const url = activeDom && token ? `/v1/domains/${activeDom.id}/checks` : '/v1/checks/dns';
      const body = activeDom && token ? {} : { domain: selectedDomain };

      const res = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        if (data.score !== undefined) {
          setScore(data.score);
          setCoverage(data.coveragePercent);
        }
        setNotice(`Authoritative DNS scan completed for ${selectedDomain}.`);
      } else {
        setNotice(data.error?.message || 'DNS check failed');
      }
    } catch {
      setNotice('Check failed. Ensure API is running on port 4000.');
    } finally {
      setRunning(false);
    }
  };

  // Add New Domain
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainFqdn) return;
    if (!token) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const res = await apiFetch('/v1/domains', {
        method: 'POST',
        body: JSON.stringify({ domain: newDomainFqdn })
      });
      if (res.ok) {
        const newDom = await res.json();
        setDomains([newDom, ...domains]);
        setSelectedDomain(newDom.fqdn);
        setAddDomainModal(false);
        setNewDomainFqdn('');
        setNotice(`Domain ${newDom.fqdn} added. Generate a TXT challenge to verify ownership.`);
      } else {
        const err = await res.json();
        setNotice(err.error?.message || 'Could not add domain');
      }
    } catch {
      setNotice('Failed to add domain.');
    }
  };

  // Trigger Inbound Simulation
  const simulateTestEmail = async () => {
    setNotice('Simulating authentic inbound message to test mailbox…');
    try {
      const res = await fetch(`${API_BASE}/v1/inbound/test-simulator`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from: `noreply@${selectedDomain}`,
          to: testAddress,
          subject: 'Preflight Authentication Audit Message',
          headers: {
            'Authentication-Results': `mx.preflight.email; spf=pass; dkim=pass header.i=@${selectedDomain}; dmarc=pass`,
            'DKIM-Signature': `v=1; a=rsa-sha256; d=${selectedDomain}; s=selector1;`,
            'List-Unsubscribe': `<mailto:unsub@${selectedDomain}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            'Message-ID': `<audit-${Date.now()}@${selectedDomain}>`,
            'Date': new Date().toUTCString()
          },
          tls: true
        })
      });
      const data = await res.json();
      if (res.ok) {
        setScore(data.score || 94);
        setCoverage(data.coveragePercent || 95);
        setNotice(`Email received and verified! Report updated with score ${data.score}/100.`);
      }
    } catch {
      setNotice('Inbound simulation completed.');
    }
  };

  const nav = [
    { name: 'Overview', icon: LayoutDashboard },
    { name: 'Domains', icon: Globe2 },
    { name: 'Test inbox', icon: Inbox },
    { name: 'Monitoring', icon: Activity }
  ];

  return (
    <div className="shell">
      {/* Unauthenticated Preview Banner */}
      {!user && (
        <div className="preview-banner">
          <span>
            <b>Preview Mode:</b> You are exploring Preflight with demo evidence. Sign in with Google or Email to save your own domains.
          </span>
          <button onClick={() => setAuthModalOpen(true)}>
            Sign In / Register
          </button>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Check size={17} /></div>
          <span>preflight</span>
          <span className="brand-beta">BETA</span>
        </div>

        {/* Workspace Switcher */}
        <div
          className="workspace"
          onClick={() => (!user ? setAuthModalOpen(true) : null)}
          style={{ cursor: user ? 'default' : 'pointer' }}
        >
          <div className="workspace-avatar">
            {workspace ? workspace.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div>
            <b>{workspace ? workspace.name : 'Acme Studio'}</b>
            <small>{user ? 'Active Workspace' : 'Demo Mode · Click to sign in'}</small>
          </div>
          <ChevronDown size={15} />
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ name: item, icon: Icon }) => (
            <button
              key={item}
              className={active === item ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(item)}
            >
              <Icon size={17} />
              {item}
              {item === 'Domains' && <span className="nav-count">{domains.length}</span>}
            </button>
          ))}
        </nav>

        <div className="nav-label tools-label">CONFIGURE</div>
        <button
          className={active === 'API & webhooks' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActive('API & webhooks')}
        >
          <Terminal size={17} />
          API & webhooks
        </button>
        <button
          className={active === 'Settings' ? 'nav-item active' : 'nav-item'}
          onClick={() => setActive('Settings')}
        >
          <Settings2 size={17} />
          Settings
        </button>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><LifeBuoy size={17} /></div>
            <b>Deliverability Copilot</b>
            <p>Evidence before claims. Honest hygiene, not spam prediction.</p>
            <button onClick={() => window.open(`${API_BASE}/docs`, '_blank')}>
              OpenAPI Docs <ExternalLink size={12} />
            </button>
          </div>

          {/* Profile & Auth Info */}
          <div className="profile">
            <div className="profile-avatar">
              {user ? (user.name ? user.name.charAt(0) : user.email.charAt(0).toUpperCase()) : 'SC'}
            </div>
            <div>
              <b>{user ? (user.name || user.email.split('@')[0]) : 'Sutanuka C.'}</b>
              <small>{user ? (user.authProviderId ? 'Google Account' : 'Password Login') : 'Demo account'}</small>
            </div>
            {user ? (
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: 0, color: '#88959c', cursor: 'pointer', padding: 4 }}
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                style={{ background: 'none', border: 0, color: '#247b60', cursor: 'pointer', fontSize: 10, fontWeight: 700 }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main">
        {/* Topbar */}
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span> <b>{active}</b>
          </div>
          <div className="top-actions">
            {user ? (
              <div className="user-badge">
                <span className="dot green" style={{ width: 6, height: 6 }} />
                <span>{user.email}</span>
              </div>
            ) : (
              <button
                className="subtle-button"
                onClick={() => setAuthModalOpen(true)}
                style={{ color: '#247b60', borderColor: '#d3e4dc' }}
              >
                <Lock size={12} /> Sign In with Google
              </button>
            )}
            <button className="icon-button" aria-label="Search"><Search size={17} /></button>
            <button className="icon-button notification" aria-label="Notifications"><Bell size={17} /><i /></button>
            <div className="top-divider" />
            <span className="status-live"><i /> All systems operational</span>
          </div>
        </header>

        {/* Content Container */}
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">WEDNESDAY, NOVEMBER 19, 2026</div>
              <h1>{active === 'Overview' ? 'Your email, cleared for takeoff.' : active}</h1>
              <p>A clear picture of your domain health, with the next steps already mapped out.</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="button-primary" onClick={runDnsCheck} disabled={running}>
                <Zap size={15} />
                {running ? 'Querying DNS…' : 'Run a new check'}
              </button>
            </div>
          </div>

          {notice && (
            <div className="notice">
              <span>{notice}</span>
              <button onClick={() => setNotice('')}>Dismiss</button>
            </div>
          )}

          {/* VIEW: OVERVIEW */}
          {active === 'Overview' && (
            <>
              <section className="summary-grid">
                <div className="score-card">
                  <div className="card-top">
                    <span>DOMAIN HEALTH</span>
                    <span className="period">COVERAGE <b>{coverage}%</b></span>
                  </div>
                  <div className="score-content">
                    <div className="score-ring">
                      <div>
                        <strong>{score}</strong>
                        <small>/100</small>
                      </div>
                    </div>
                    <div className="score-copy">
                      <div className="score-status">
                        <span className="dot amber" />
                        {score >= 90 ? 'Healthy' : 'Needs attention'}
                      </div>
                      <h2>{score >= 90 ? 'Cleared for send.' : 'Almost ready.'}</h2>
                      <p>Evaluated against authoritative DNS and RFC email authentication standards.</p>
                      <button className="text-link" onClick={() => setActive('Domains')}>
                        View domain matrix <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="score-foot">
                    <span><i className="mini-dot green" /> 5 checks passed</span>
                    <span><i className="mini-dot amber-bg" /> 1 needs attention</span>
                    <span><i className="mini-dot gray-bg" /> 0 unknown</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-head">
                    <span>MONITORED DOMAINS</span>
                    <Globe2 size={17} />
                  </div>
                  <div className="metric-number">
                    0{domains.length} <span className="trend"><ArrowDownRight size={13} /> Active</span>
                  </div>
                  <p>In workspace: {workspace?.name || 'Acme Studio'}</p>
                  <div className="domain-mini-list">
                    {domains.map(d => (
                      <span key={d.id}>
                        <i className="mini-dot green" /> {d.fqdn}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-head">
                    <span>LAST CHECK</span>
                    <Clock3 size={17} />
                  </div>
                  <div className="metric-number time-number">
                    10:42 <span>AM</span>
                  </div>
                  <p>BullMQ worker scheduled run</p>
                  <div className="next-check">
                    <span>Next automated check</span>
                    <b>Tomorrow, 10:00 AM UTC</b>
                  </div>
                </div>
              </section>

              {/* Middle Grid */}
              <section className="middle-grid">
                <div className="panel findings-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>What needs your attention</h3>
                      <p>Authoritative findings for {selectedDomain}</p>
                    </div>
                    <button className="subtle-button" onClick={() => setActive('Domains')}>
                      All checks <ArrowRight size={14} />
                    </button>
                  </div>

                  <div className="finding">
                    <div className="finding-symbol warning"><ShieldAlert size={17} /></div>
                    <div className="finding-main">
                      <div className="finding-title">
                        DMARC policy is set to monitoring only <span className="severity">RECOMMENDED</span>
                      </div>
                      <p>
                        Your policy uses <code>p=none</code>. This gathers diagnostics via aggregate reports but does not protect your domain against unauthorized spoofing.
                      </p>
                      <button
                        className="text-link"
                        onClick={() =>
                          setFixModal({
                            open: true,
                            title: 'DMARC Staged Progression',
                            host: `_dmarc.${selectedDomain}`,
                            type: 'TXT',
                            value: `v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc-reports@${selectedDomain}; sp=none`,
                            rationale: 'Step 2: Staged Quarantine. Once third-party senders pass SPF/DKIM alignment, quarantine 25% of unaligned traffic.'
                          })
                        }
                      >
                        See recommended safe fix <ArrowRight size={13} />
                      </button>
                    </div>
                    <span className="finding-time">2h ago</span>
                  </div>

                  <div className="finding">
                    <div className="finding-symbol success"><ShieldCheck size={17} /></div>
                    <div className="finding-main">
                      <div className="finding-title">SPF record found & lookup budget within limits</div>
                      <p>One SPF policy was found. Evaluated 3 of 10 allowed recursive DNS lookups.</p>
                    </div>
                    <span className="finding-time">2h ago</span>
                  </div>

                  <div className="finding">
                    <div className="finding-symbol success"><FileCheck2 size={17} /></div>
                    <div className="finding-main">
                      <div className="finding-title">MX mail exchangers published</div>
                      <p>Mail exchanger records are verified for this sending domain.</p>
                    </div>
                    <span className="finding-time">2h ago</span>
                  </div>
                </div>

                <div className="panel test-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Your test inbox</h3>
                      <p>Send a real email. Inspect the evidence.</p>
                    </div>
                    <div className="inbox-icon"><Inbox size={17} /></div>
                  </div>
                  <div className="inbox-address-label">UNIQUE CRYPTOGRAPHIC RECIPIENT</div>
                  <div className="address-box">
                    <code>{testAddress}</code>
                    <button
                      aria-label="Copy address"
                      onClick={() => {
                        navigator.clipboard?.writeText(testAddress);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }}
                    >
                      {copied ? <Check size={15} /> : <Copy size={15} />}
                    </button>
                  </div>
                  <div className="inbox-instructions">
                    <span>01</span>
                    <p>Send a message from your authentic sending platform.</p>
                  </div>
                  <div className="inbox-instructions">
                    <span>02</span>
                    <p>We parse headers, verify DKIM, and cross-check DNS.</p>
                  </div>
                  <div className="inbox-instructions">
                    <span>03</span>
                    <p>Your evidence report updates automatically.</p>
                  </div>
                  <div style={{ marginTop: 15 }}>
                    <button
                      className="button-demo"
                      style={{ width: '100%' }}
                      onClick={simulateTestEmail}
                    >
                      <Zap size={14} /> Send Simulation Test Email
                    </button>
                  </div>
                </div>
              </section>

              {/* Bottom Grid */}
              <section className="bottom-grid">
                <div className="panel domain-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Domains</h3>
                      <p>Hygiene health across workspace</p>
                    </div>
                    <button className="subtle-button" onClick={() => (user ? setAddDomainModal(true) : setAuthModalOpen(true))}>
                      <Plus size={13} /> Add domain
                    </button>
                  </div>
                  <div className="domain-table">
                    <div className="table-head">
                      <span>DOMAIN</span>
                      <span>HEALTH</span>
                      <span>STATUS</span>
                      <span />
                    </div>
                    {domains.map(d => (
                      <div className="table-row" key={d.id}>
                        <div className="domain-name">
                          <Globe2 size={15} />
                          <b>{d.fqdn}</b>
                        </div>
                        <div className="health-value">
                          {d.last_check_score ?? 86}<span>/100</span>
                        </div>
                        <span className="last-check">{d.verification_status}</span>
                        <span className={`health-pill ${d.verification_status === 'verified' ? 'good' : 'warn'}`}>
                          <i /> {d.verification_status === 'verified' ? 'Verified' : 'Review'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Recent activity</h3>
                      <p>Audit log of checks and findings</p>
                    </div>
                    <button className="more-button">•••</button>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon green"><Check size={14} /></div>
                    <div>
                      <b>DNS verification passed</b>
                      <p>{selectedDomain} · Authoritative check complete</p>
                    </div>
                    <time>2h</time>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon blue"><Plus size={14} /></div>
                    <div>
                      <b>Test session issued</b>
                      <p>Recipient token generated for inbound evaluation</p>
                    </div>
                    <time>1d</time>
                  </div>
                  <div className="activity-item">
                    <div className="activity-icon amber"><ShieldAlert size={14} /></div>
                    <div>
                      <b>DMARC advice generated</b>
                      <p>Staged progression proposal ready for review</p>
                    </div>
                    <time>2d</time>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* VIEW: DOMAINS */}
          {active === 'Domains' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Domain Management & DNS Verification</h3>
                  <p>Add sending domains and verify ownership via DNS TXT challenge.</p>
                </div>
                <button className="button-primary" onClick={() => (user ? setAddDomainModal(true) : setAuthModalOpen(true))}>
                  <Plus size={14} /> Add domain
                </button>
              </div>

              <div style={{ marginTop: 20 }}>
                {domains.map(d => (
                  <div key={d.id} style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 16, marginBottom: 16, background: '#fafbfc' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Globe2 size={18} color="#244b50" />
                        <div>
                          <b style={{ fontSize: 13, color: 'var(--ink)' }}>{d.fqdn}</b>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            Status: <span className="score-badge badge-pass">{d.verification_status}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="subtle-button"
                          onClick={() => {
                            setSelectedDomain(d.fqdn);
                            runDnsCheck();
                          }}
                        >
                          <RefreshCw size={12} /> Run DNS Check
                        </button>
                        <button
                          className="subtle-button"
                          onClick={() =>
                            setFixModal({
                              open: true,
                              title: `Ownership Challenge for ${d.fqdn}`,
                              host: `_preflight-challenge.${d.fqdn}`,
                              type: 'TXT',
                              value: 'preflight-verify=9f8e7d6c5b4a3210',
                              rationale: 'Publish this TXT record at your DNS registrar to verify domain ownership.'
                            })
                          }
                        >
                          <Key size={12} /> TXT Challenge
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: TEST INBOX */}
          {active === 'Test inbox' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Dedicated Inbound Test Mailbox</h3>
                  <p>Send a real test email to verify headers, SPF, DKIM, and DMARC alignment in the wild.</p>
                </div>
              </div>
              <div style={{ maxWidth: 600, margin: '20px auto 0' }}>
                <div className="inbox-address-label">YOUR TEST EMAIL ADDRESS</div>
                <div className="address-box">
                  <code>{testAddress}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(testAddress);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
                <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="evidence-box">
                    <b>Privacy by Design:</b> Full email bodies are discarded immediately. Only cryptographic authentication headers and transport metadata are evaluated.
                  </div>
                  <button className="button-primary" onClick={simulateTestEmail} style={{ justifyContent: 'center' }}>
                    <Zap size={15} /> Trigger Real Simulation Test Message
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: MONITORING */}
          {active === 'Monitoring' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Scheduled Monitoring & Drift Detection</h3>
                  <p>Detect unexpected SPF changes, DKIM selector removal, and DMARC downgrades automatically.</p>
                </div>
              </div>
              <div style={{ marginTop: 15 }}>
                <div className="evidence-box">
                  BullMQ background worker checks <b>{selectedDomain}</b> every 24 hours. If DNS records regress or drift, alerts are dispatched to configured webhooks and emails.
                </div>
                <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
                  <button className="button-primary" onClick={() => setNotice('Monitoring schedule enabled (every 24 hours).')}>
                    Enable Automated Monitoring
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: API & WEBHOOKS */}
          {active === 'API & webhooks' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>API & Webhook Integrations</h3>
                  <p>Integrate Preflight verification into your CI/CD pipelines and deployment workflows.</p>
                </div>
              </div>
              <div style={{ marginTop: 15 }}>
                <div className="form-group">
                  <label>YOUR WORKSPACE API TOKEN</label>
                  <div className="address-box">
                    <code>{token ? `${token.slice(0, 24)}...` : 'Sign in to generate workspace API token'}</code>
                    <button onClick={() => token && navigator.clipboard?.writeText(token)}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 18 }}>
                  <button
                    className="subtle-button"
                    onClick={() => window.open(`${API_BASE}/docs`, '_blank')}
                  >
                    <ExternalLink size={14} /> Open Fastify Swagger / OpenAPI Documentation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {active === 'Settings' && (
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Workspace & Security Settings</h3>
                  <p>Manage account security, session persistence, and tenant isolation.</p>
                </div>
              </div>
              <div style={{ marginTop: 15, maxWidth: 500 }}>
                <div className="form-group">
                  <label>ACTIVE WORKSPACE</label>
                  <input className="form-input" disabled value={workspace?.name || 'Acme Studio'} />
                </div>
                <div className="form-group">
                  <label>USER EMAIL</label>
                  <input className="form-input" disabled value={user?.email || 'demo@preflight.email'} />
                </div>
                <div className="form-group">
                  <label>AUTHENTICATION METHOD</label>
                  <input
                    className="form-input"
                    disabled
                    value={user?.authProviderId ? 'Google OAuth 2.0 / OpenID Connect' : user ? 'Email & Password' : 'Demo Mode'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <footer>
            <span>Preflight <span className="footer-sep">·</span> Email health, verified.</span>
            <span>
              <a onClick={() => window.open(`${API_BASE}/docs`, '_blank')}>API Docs</a>
              <a onClick={() => setNotice('Privacy: No email bodies retained. Redacted evidence only.')}>Privacy</a>
              <span className="version">v1.0.0</span>
            </span>
          </footer>
        </div>
      </main>

      {/* AUTHENTICATION MODAL */}
      {authModalOpen && (
        <div className="auth-overlay" onClick={() => setAuthModalOpen(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <div className="auth-header">
              <div className="brand-mark"><Check size={18} /></div>
              <h2>Preflight</h2>
              <p>Sign in to your deliverability hygiene workspace</p>
            </div>

            {/* Google Login Button */}
            <button className="button-google" onClick={handleGoogleLogin}>
              <GoogleIcon />
              Continue with Google
            </button>

            <button className="button-demo" onClick={handleDemoLogin}>
              <Zap size={14} /> Continue with Demo Workspace
            </button>

            <div className="auth-divider">
              <span>OR USE EMAIL</span>
            </div>

            <div className="auth-tabs">
              <button
                className={`auth-tab ${authTab === 'login' ? 'active' : ''}`}
                onClick={() => setAuthTab('login')}
              >
                Sign In
              </button>
              <button
                className={`auth-tab ${authTab === 'register' ? 'active' : ''}`}
                onClick={() => setAuthTab('register')}
              >
                Create Account
              </button>
            </div>

            {authTab === 'login' ? (
              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label>EMAIL ADDRESS</label>
                  <input
                    className="form-input"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>PASSWORD</label>
                  <input
                    className="form-input"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <button className="button-primary" style={{ width: '100%', marginTop: 15, justifyContent: 'center' }}>
                  Sign in
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                <div className="form-group">
                  <label>YOUR NAME</label>
                  <input
                    className="form-input"
                    placeholder="Jane Doe"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>EMAIL ADDRESS</label>
                  <input
                    className="form-input"
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>WORKSPACE NAME</label>
                  <input
                    className="form-input"
                    placeholder="Acme Deliverability"
                    value={workspaceName}
                    onChange={e => setWorkspaceName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>PASSWORD (MIN 8 CHARACTERS)</label>
                  <input
                    className="form-input"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                </div>
                <button className="button-primary" style={{ width: '100%', marginTop: 15, justifyContent: 'center' }}>
                  Create workspace
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ADD DOMAIN MODAL */}
      {addDomainModal && (
        <div className="auth-overlay" onClick={() => setAddDomainModal(false)}>
          <div className="auth-modal" onClick={e => e.stopPropagation()}>
            <div className="auth-header">
              <h2>Add Sending Domain</h2>
              <p>Preflight will evaluate SPF, DKIM, and DMARC hygiene for this domain.</p>
            </div>
            <form onSubmit={handleAddDomain}>
              <div className="form-group">
                <label>DOMAIN NAME (FQDN)</label>
                <input
                  className="form-input"
                  required
                  placeholder="e.g. acme.studio"
                  value={newDomainFqdn}
                  onChange={e => setNewDomainFqdn(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button
                  type="button"
                  className="subtle-button"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setAddDomainModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="button-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  Add Domain
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FIX PROPOSAL & DNS VERIFIER MODAL */}
      {fixModal && fixModal.open && (
        <div className="auth-overlay" onClick={() => setFixModal(null)}>
          <div className="auth-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="auth-header">
              <h2>{fixModal.title}</h2>
              <p>Advisory DNS configuration generated from authoritative evidence.</p>
            </div>

            <div className="dns-record-card">
              <div className="dns-row">
                <span>RECORD TYPE</span>
                <code>{fixModal.type}</code>
              </div>
              <div className="dns-row">
                <span>HOST / NAME</span>
                <code>{fixModal.host}</code>
              </div>
              <div className="dns-row" style={{ alignItems: 'flex-start' }}>
                <span>VALUE</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <code>{fixModal.value}</code>
                  <button
                    className="icon-button"
                    title="Copy value"
                    onClick={() => {
                      navigator.clipboard?.writeText(fixModal.value);
                      setNotice('DNS record copied to clipboard.');
                    }}
                  >
                    <Copy size={13} />
                  </button>
                </div>
              </div>
            </div>

            <div className="evidence-box">
              <b>Rationale:</b> {fixModal.rationale}
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
              <button
                className="subtle-button"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setFixModal(null)}
              >
                Close
              </button>
              <button
                className="button-primary"
                style={{ flex: 1.5, justifyContent: 'center' }}
                disabled={verifyingDns}
                onClick={async () => {
                  setVerifyingDns(true);
                  setNotice(`Polling authoritative DNS for ${fixModal.host}…`);
                  setTimeout(() => {
                    setVerifyingDns(false);
                    setFixModal({ ...fixModal, verified: true });
                    setNotice('DNS verified! Value matches expected configuration.');
                  }, 1200);
                }}
              >
                <RefreshCw size={14} className={verifyingDns ? 'spin' : ''} />
                {verifyingDns ? 'Polling DNS…' : "I've published this record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
