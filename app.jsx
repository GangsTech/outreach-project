import { useState, useEffect, useRef, useCallback } from 'react'
import './app.css'

// ============================================================
// PWA INSTALL PROMPT HOOK
// ============================================================
function useInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showBanner, setShowBanner] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        // Check if already installed as PWA
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            setIsInstalled(true);
            return;
        }

        // Dismiss key: don't show if already dismissed today
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) return;

        // iOS detection
        const ua = window.navigator.userAgent;
        const ios = /iphone|ipad|ipod/i.test(ua);
        setIsIOS(ios);

        if (ios) {
            // iOS requires the Share > Add to Home Screen approach
            setShowBanner(true);
            return;
        }

        // Standard browsers: capture beforeinstallprompt
        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowBanner(true);
        };
        window.addEventListener('beforeinstallprompt', handler);

        // Also listen for successful install
        window.addEventListener('appinstalled', () => {
            setShowBanner(false);
            setDeferredPrompt(null);
        });

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const install = async () => {
        if (!deferredPrompt) {
            alert('To install the app: \nOn Android: Tap the 3-dots Menu ⋮ and select "Install app". \nOn iPhone: Tap Share ⬆ and select "Add to Home Screen".');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            setShowBanner(false);
        }
        setDeferredPrompt(null);
    };

    const dismiss = () => {
        setShowBanner(false);
        localStorage.setItem('pwa_install_dismissed', Date.now().toString());
    };

    return { showBanner, isIOS, isInstalled, install, dismiss };
}

// ============================================================
// INSTALL BANNER COMPONENT
// ============================================================
function InstallBanner({ isIOS, onInstall, onDismiss }) {
    const [showIOSHelp, setShowIOSHelp] = useState(false);

    return (
        <>
            {/* Main install banner */}
            <div className="install-banner glass-panel animate-slide-up">
                <div className="install-banner-icon">📱</div>
                <div className="install-banner-text">
                    <strong>Install LandVMS</strong>
                    <span>Add to home screen for the best experience</span>
                </div>
                <div className="install-banner-actions">
                    {isIOS ? (
                        <button className="btn-install" onClick={() => setShowIOSHelp(true)}>How to Install</button>
                    ) : (
                        <button className="btn-install" onClick={onInstall}>Install</button>
                    )}
                    <button className="btn-dismiss" onClick={onDismiss}>✕</button>
                </div>
            </div>

            {/* iOS instructions modal */}
            {showIOSHelp && (
                <div className="ios-modal-overlay" onClick={() => setShowIOSHelp(false)}>
                    <div className="ios-modal glass-panel" onClick={e => e.stopPropagation()}>
                        <h3>Install on iPhone / iPad</h3>
                        <ol className="ios-steps">
                            <li>Tap the <strong>Share</strong> button <span className="ios-icon">⬆</span> at the bottom of Safari</li>
                            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                            <li>Tap <strong>"Add"</strong> in the top right</li>
                        </ol>
                        <button className="btn-primary mt-md" style={{ width: '100%' }} onClick={() => { setShowIOSHelp(false); onDismiss(); }}>Got it!</button>
                    </div>
                </div>
            )}
        </>
    );
}

// --- Voice Speech Alarm via Web Speech API ---
function createVoiceAlarm(customerName, time, location) {
    if (!('speechSynthesis' in window)) return null;

    let stopped = false;
    let loopTimeout = null;

    // Format the time nicely ("14:30" -> "2:30 PM")
    function formatTime(t) {
        try {
            const [h, m] = t.split(':').map(Number);
            const ampm = h >= 12 ? 'PM' : 'AM';
            const hour = h % 12 || 12;
            return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
        } catch { return t; }
    }

    const message = `Your meeting with ${customerName} is scheduled at ${formatTime(time)} in ${location}`;

    function speak() {
        if (stopped) return;
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.lang = 'en-US';
        utterance.onend = () => {
            if (!stopped) {
                loopTimeout = setTimeout(speak, 5000); // repeat every 5 seconds
            }
        };
        window.speechSynthesis.cancel(); // clear any queued
        window.speechSynthesis.speak(utterance);
    }

    speak();

    return {
        stop() {
            stopped = true;
            clearTimeout(loopTimeout);
            window.speechSynthesis.cancel();
        }
    };
}

// ============================================================
// USER MANAGEMENT HELPERS (localStorage-based, no backend needed)
// ============================================================
const ADMIN_USER = { username: 'admin', password: 'admin123', role: 'admin' };

// ✅ HARDCODED USERS — these work on ALL devices without any setup
// Add new users here and redeploy to give them access everywhere
const HARDCODED_USERS = [
    { username: 'mariya', password: 'mariya@1970' },
];

function getUsers() {
    // Merge hardcoded users with any admin-created users (from localStorage)
    try {
        const fromStorage = JSON.parse(localStorage.getItem('landvms_users') || '[]');
        // Merge: hardcoded takes precedence, then storage (avoid duplicates)
        const all = [...HARDCODED_USERS];
        fromStorage.forEach(u => {
            if (!all.find(h => h.username === u.username)) all.push(u);
        });
        return all;
    } catch { return HARDCODED_USERS; }
}
function saveUsers(users) {
    // Save only the non-hardcoded ones to localStorage (admin-created)
    const toSave = users.filter(u => !HARDCODED_USERS.find(h => h.username === u.username));
    localStorage.setItem('landvms_users', JSON.stringify(toSave));
}
function getUserVisits(username) {
    try { return JSON.parse(localStorage.getItem(`landvms_visits_${username}`) || '[]'); } catch { return []; }
}
function saveUserVisits(username, visits) {
    localStorage.setItem(`landvms_visits_${username}`, JSON.stringify(visits));
}

// ============================================================
// CLOUD SYNC LOGIC (Cross-Device)
// ============================================================
const CLOUD_SYNC_URL = "https://keyvalue.immanuel.co/api/KeyVal";
const CLOUD_DB_ID = "landvms_premium_db_2026";

// Unicode-safe Base64 encoding/decoding for Cloud Sync
const toB64 = (str) => btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1)));
const fromB64 = (str) => decodeURIComponent(atob(str).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));

const syncToCloud = async (username, visits) => {
    if (!visits || visits.length === 0) return;
    try {
        const payload = encodeURIComponent(toB64(JSON.stringify(visits)));
        await fetch(`${CLOUD_SYNC_URL}/UpdateValue/${CLOUD_DB_ID}/${username}_data/${payload}`, { method: 'POST' });
    } catch (e) { console.error("Cloud sync failed", e); }
};

const fetchFromCloud = async (username) => {
    try {
        const res = await fetch(`${CLOUD_SYNC_URL}/GetValue/${CLOUD_DB_ID}/${username}_data`);
        const text = await res.text();
        if (text && text !== "null" && text.length > 5) {
            try {
                const cleaned = text.replace(/"/g, "").trim();
                return JSON.parse(fromB64(cleaned));
            } catch (e) { console.error("Fetch Cloud Parse Error", e); return null; }
        }
    } catch (e) { }
    return null;
};

function App() {
    const [currentUser, setCurrentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('landvms_current_user');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    });
    const [currentTab, setCurrentTab] = useState('home');
    const [visits, setVisits_raw] = useState([]);
    const [editVisitId, setEditVisitId] = useState(null);
    const notifiedVisits = useRef(new Set());
    const [activeAlarmVisit, setActiveAlarmVisit] = useState(null);
    const alarmRef = useRef(null);
    const { showBanner, isIOS, isInstalled, install, dismiss } = useInstallPrompt();

    const isAdmin = currentUser?.role === 'admin';

    // When logging in, load that user's visits
    const handleLogin = async (user) => {
        setCurrentUser(user);
        localStorage.setItem('landvms_current_user', JSON.stringify(user));
        setCurrentTab('home');

        // Start by showing local visits
        setVisits_raw(getUserVisits(user.username));

        // Attempt cloud sync overriding
        const cloudData = await fetchFromCloud(user.username);
        if (cloudData && Array.isArray(cloudData)) {
            setVisits_raw(cloudData);
            saveUserVisits(user.username, cloudData);
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        localStorage.removeItem('landvms_current_user');
        setVisits_raw([]);
        notifiedVisits.current = new Set();
    };

    // Wrap setVisits to also persist immediately
    const setVisits = (updater) => {
        setVisits_raw(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            if (currentUser) saveUserVisits(currentUser.username, next);
            return next;
        });
    };

    // Save whenever visits change
    useEffect(() => {
        if (currentUser) {
            saveUserVisits(currentUser.username, visits);
            // Async cloud upload in background
            if (visits.length > 0) syncToCloud(currentUser.username, visits);
        }
    }, [visits, currentUser]);

    // Initial load sync if logged in from previous session
    useEffect(() => {
        if (currentUser) {
            // First load local data instantly
            setVisits_raw(getUserVisits(currentUser.username));

            // Then check cloud for new changes across devices
            fetchFromCloud(currentUser.username).then(cloudData => {
                if (cloudData && Array.isArray(cloudData)) {
                    setVisits_raw(cloudData);
                    saveUserVisits(currentUser.username, cloudData);
                }
            });
        }
    }, [currentUser?.username]);

    useEffect(() => {
        // Handle the voice speech alarm
        if (activeAlarmVisit) {
            if (!alarmRef.current) {
                alarmRef.current = createVoiceAlarm(
                    activeAlarmVisit.customerName,
                    activeAlarmVisit.time,
                    activeAlarmVisit.location
                );
            }
        } else {
            // Stop the synthesizer when alarm is dismissed
            if (alarmRef.current) {
                alarmRef.current.stop();
                alarmRef.current = null;
            }
        }
    }, [activeAlarmVisit]);

    useEffect(() => {
        if (!currentUser) return; // no alarm checks when logged out
        if ("Notification" in window && Notification.permission !== "denied" && Notification.permission !== "granted") {
            Notification.requestPermission();
        }

        // Set up a background checker that runs every 30 seconds
        const intervalId = setInterval(() => {
            if (!currentUser) return;

            const now = new Date();
            const today = now.toISOString().split('T')[0];

            visits.forEach(visit => {
                if (visit.date === today && visit.status === 'pending') {
                    // Parse visit time
                    const [hours, minutes] = visit.time.split(':').map(Number);
                    const visitTime = new Date();
                    visitTime.setHours(hours, minutes, 0, 0);

                    // Calculate time difference in minutes
                    const diffMinutes = (visitTime - now) / (1000 * 60);

                    // Use the per-visit reminderMinutes, default to 60 if not set
                    const leadTime = visit.reminderMinutes || 60;

                    // Format the lead time for display
                    const leadLabel = leadTime >= 60 ? `${leadTime / 60} hour${leadTime > 60 ? 's' : ''}` : `${leadTime} minutes`;

                    if (diffMinutes > 0 && diffMinutes <= leadTime && !notifiedVisits.current.has(visit.id)) {
                        if ("Notification" in window && Notification.permission === "granted") {

                            const title = "🚨 Upcoming Visit Alert 🚨";
                            const options = {
                                body: `Your meeting with ${visit.customerName} is scheduled at ${visit.time} in ${visit.location}. Starting in ${leadLabel}!`,
                                icon: '/pwa-192x192.png',
                                vibrate: [200, 100, 200, 100, 200, 100, 200],
                                requireInteraction: true,
                                tag: `visit-${visit.id}`,
                                data: { visitId: visit.id }
                            };

                            // Use Service Worker if available
                            if (navigator.serviceWorker) {
                                navigator.serviceWorker.ready.then(registration => {
                                    registration.showNotification(title, options);
                                }).catch(err => {
                                    console.error('Service worker notification failed, falling back to standard', err);
                                    new Notification(title, options);
                                });
                            } else {
                                new Notification(title, options);
                            }

                            // Show the persistent alarm modal
                            setActiveAlarmVisit(visit);
                        }
                    }
                }
            });
        }, 30000); // Check every 30 seconds

        return () => clearInterval(intervalId);
    }, [visits, currentUser]);

    const handleEditVisit = (id) => {
        setEditVisitId(id);
        setCurrentTab('edit_visit');
    };

    const handleDeleteVisit = (id) => {
        setVisits(prev => prev.filter(v => v.id !== id));
    };

    const renderContent = () => {
        if (isAdmin && currentTab === 'manage_users') {
            return <ManageUsers />;
        }
        switch (currentTab) {
            case 'home':
                return <Dashboard visits={visits} setVisits={setVisits} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} username={currentUser?.username} />;
            case 'visits':
                return <Visits visits={visits} setVisits={setVisits} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} />;
            case 'customers':
                return <Customers visits={visits} />;
            case 'add_visit':
                return <AddVisit key="add" visits={visits} setVisits={setVisits} onSave={() => setCurrentTab('home')} />;
            case 'edit_visit':
                return <AddVisit key={`edit-${editVisitId}`} visits={visits} setVisits={setVisits} onSave={() => { setCurrentTab('home'); setEditVisitId(null); }} visitToEdit={visits.find(v => v.id === editVisitId)} />;
            case 'reports':
                return <Reports visits={visits} />;
            default:
                return <Dashboard visits={visits} setVisits={setVisits} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} />;
        }
    };

    if (!currentUser) {
        return (
            <div className="app-container">
                <Login onLogin={handleLogin} onInstall={install} isInstalled={isInstalled} showBanner={showBanner} isIOS={isIOS} onDismissBanner={dismiss} />
            </div>
        );
    }

    return (
        <div className="app-container">
            {showBanner && (
                <InstallBanner isIOS={isIOS} onInstall={install} onDismiss={dismiss} />
            )}
            <header className="app-header glass-panel">
                <h1>LandVMS</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isAdmin && (
                        <button
                            onClick={() => setCurrentTab('manage_users')}
                            style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: '8px', color: 'var(--text-primary)', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                        >
                            👥 Users
                        </button>
                    )}
                    <div className="user-avatar" title={currentUser?.username} style={{ cursor: 'pointer' }} onClick={handleLogout}>
                        <span>{currentUser?.username?.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
            </header>

            <main className="main-content animate-fade-in">
                {renderContent()}
            </main>

            {/* Persistent Alarm Modal */}
            {activeAlarmVisit && (() => {
                const leadTime = activeAlarmVisit.reminderMinutes || 60;
                const leadLabel = leadTime >= 60
                    ? `${leadTime / 60} hour${leadTime > 60 ? 's' : ''}`
                    : `${leadTime} minutes`;
                return (
                    <div className="alarm-modal-overlay">
                        <div className="alarm-modal glass-panel animate-pulse-border">
                            <h2>🚨 Upcoming Visit Alert 🚨</h2>
                            <p className="alarm-time">Starting in {leadLabel}!</p>
                            <h3 className="customer-name">{activeAlarmVisit.customerName}</h3>
                            <p className="visit-location">📍 {activeAlarmVisit.location}</p>
                            <p className="visit-time">🕒 {activeAlarmVisit.time}</p>

                            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>🔊 Speaking alarm. Please dismiss to stop.</p>

                            <button className="btn-primary mt-md" style={{ width: '100%', cursor: 'pointer', padding: '12px', fontSize: '1.1rem' }} onClick={() => {
                                notifiedVisits.current.add(activeAlarmVisit.id);
                                if (navigator.serviceWorker) {
                                    navigator.serviceWorker.ready.then(registration => {
                                        registration.getNotifications({ tag: `visit-${activeAlarmVisit.id}` }).then(notifications => {
                                            notifications.forEach(notification => notification.close());
                                        });
                                    });
                                }
                                setActiveAlarmVisit(null);
                            }}>
                                Dismiss Alarm
                            </button>
                        </div>
                    </div>
                );
            })()}

            <nav className="bottom-nav glass-panel">
                <button
                    className={`nav-item ${currentTab === 'home' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('home')}
                >
                    <span className="icon">🏠</span>
                    <span className="label">Home</span>
                </button>
                <button
                    className={`nav-item ${currentTab === 'visits' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('visits')}
                >
                    <span className="icon">📅</span>
                    <span className="label">Visits</span>
                </button>
                <button className="nav-fab" onClick={() => setCurrentTab('add_visit')}>
                    <span className="icon">+</span>
                </button>
                <button
                    className={`nav-item ${currentTab === 'customers' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('customers')}
                >
                    <span className="icon">👥</span>
                    <span className="label">Clients</span>
                </button>
                <button
                    className={`nav-item ${currentTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('reports')}
                >
                    <span className="icon">📊</span>
                    <span className="label">Reports</span>
                </button>
            </nav>
        </div>
    )
}

function Dashboard({ visits, setVisits, onEditVisit, onDeleteVisit, username }) {
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = visits.filter(v => v.date === today);
    const pendingVisits = todayVisits.filter(v => v.status === 'pending');
    const completedVisits = todayVisits.filter(v => v.status === 'completed');

    return (
        <div className="dashboard">
            <h2 className="section-title">Hello, {username ? username.charAt(0).toUpperCase() + username.slice(1) : 'there'} 👋</h2>
            <p className="section-subtitle">Here's your schedule for today</p>

            <div className="metrics-grid">
                <div className="metric-card glass-panel">
                    <div className="metric-icon pending">⏳</div>
                    <div className="metric-value">{pendingVisits.length}</div>
                    <div className="metric-label">Pending Today</div>
                </div>
                <div className="metric-card glass-panel">
                    <div className="metric-icon completed">✅</div>
                    <div className="metric-value">{completedVisits.length}</div>
                    <div className="metric-label">Completed</div>
                </div>
            </div>

            <div className="upcoming-section">
                <div className="flex-row justify-between items-center mb-sm">
                    <h3>Upcoming Visits</h3>
                    <button className="btn-text">View All</button>
                </div>

                <div className="visit-list">
                    {pendingVisits.length > 0 ? pendingVisits.map(visit => (
                        <div key={visit.id} className="visit-card glass-panel">
                            <div className="visit-header">
                                <span className="badge warning">Upcoming</span>
                                <span className="visit-time">{visit.time}</span>
                            </div>
                            <h4 className="customer-name">{visit.customerName}</h4>
                            <p className="visit-location">📍 {visit.location}</p>
                            <MapPreview location={visit.location} />
                            <div className="visit-actions">
                                <button className="btn-icon" onClick={() => onEditVisit(visit.id)} title="Edit">✏️</button>
                                <button className="btn-icon" onClick={() => { if (visit.phone) window.location.href = `tel:${visit.phone.replace(/\s/g, '')}`; else alert('No phone number saved for this client.'); }} title="Call">📞</button>
                                <button className="btn-icon" onClick={() => window.open(`https://wa.me/${visit.phone ? visit.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(`Hello ${visit.customerName}, this is a reminder for your land visit at ${visit.location} on ${visit.date} at ${visit.time}.`)}`, '_blank')} title="Send WhatsApp Reminder">💬</button>
                                <button className="btn-icon" onClick={() => window.open(`https://maps.google.com/?q=${encodeURIComponent(visit.location)}`, '_blank')} title="Map">🗺️</button>
                                <button className="btn-primary small" onClick={() => {
                                    setVisits(visits.map(v => v.id === visit.id ? { ...v, status: 'completed' } : v));
                                }}>Complete</button>
                                <button className="btn-icon btn-delete" onClick={() => { if (window.confirm(`Delete visit with ${visit.customerName}?`)) onDeleteVisit(visit.id); }} title="Delete">🗑️</button>
                            </div>
                        </div>
                    )) : (
                        <div className="empty-state glass-panel">
                            <p>No more visits scheduled for today.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function Visits({ visits, setVisits, onEditVisit, onDeleteVisit }) {
    const toggleStatus = (id) => {
        setVisits(visits.map(v =>
            v.id === id
                ? { ...v, status: v.status === 'pending' ? 'completed' : 'pending' }
                : v
        ));
    };

    return (
        <div className="visits-page">
            <h2>All Visits</h2>
            <div className="visit-list">
                {visits.length === 0 && (
                    <div className="empty-state glass-panel"><p>No visits scheduled yet.</p></div>
                )}
                {visits.map(visit => (
                    <div key={visit.id} className="visit-card glass-panel">
                        <div className="flex-row justify-between items-center mb-sm">
                            <div className="visit-header" style={{ marginBottom: 0 }}>
                                <span className={`badge ${visit.status === 'completed' ? 'success' : 'warning'}`}>
                                    {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
                                </span>
                            </div>
                            <button
                                className={`btn-text ${visit.status === 'pending' ? 'success-text' : 'warning-text'}`}
                                onClick={() => toggleStatus(visit.id)}
                                style={{ fontSize: '0.8rem', cursor: 'pointer', marginRight: 'var(--spacing-sm)' }}
                            >
                                Mark {visit.status === 'pending' ? 'Completed' : 'Pending'}
                            </button>
                            <div className="flex-row gap-xs" style={{ marginLeft: 'auto' }}>
                                <button
                                    className="btn-icon"
                                    style={{ width: '32px', height: '32px', fontSize: '1rem' }}
                                    onClick={() => onEditVisit(visit.id)}
                                    title="Edit Visit"
                                >✏️</button>
                                <button
                                    className="btn-icon"
                                    style={{ width: '32px', height: '32px', fontSize: '1rem' }}
                                    onClick={() => { if (visit.phone) window.location.href = `tel:${visit.phone.replace(/\s/g, '')}`; else alert('No phone number saved.'); }}
                                    title="Call Client"
                                >📞</button>
                                <button
                                    className="btn-icon"
                                    style={{ width: '32px', height: '32px', fontSize: '1rem' }}
                                    onClick={() => window.open(`https://wa.me/${visit.phone ? visit.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(`Hello ${visit.customerName}, this is a reminder for your land visit at ${visit.location} on ${visit.date} at ${visit.time}.`)}`, '_blank')}
                                    title="Send Reminder"
                                >💬</button>
                                <button
                                    className="btn-icon btn-delete"
                                    style={{ width: '32px', height: '32px', fontSize: '1rem' }}
                                    onClick={() => { if (window.confirm(`Delete visit with ${visit.customerName}?`)) onDeleteVisit(visit.id); }}
                                    title="Delete Visit"
                                >🗑️</button>
                            </div>
                        </div>
                        <span className="visit-time d-block mb-sm">{visit.date} {visit.time}</span>
                        <h4 className="customer-name">{visit.customerName}</h4>
                        <p className="visit-location">📍 {visit.location}</p>
                        <MapPreview location={visit.location} />
                        {visit.notes && <p className="text-muted mt-sm" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>"{visit.notes}"</p>}
                    </div>
                ))}
            </div>
        </div>
    );
}

function Customers({ visits }) {
    const [searchTerm, setSearchTerm] = useState('');

    // Extract unique customers
    const customers = Array.from(new Set(visits.map(v => v.customerName))).map(name => {
        return { name, visitsCount: visits.filter(v => v.customerName === name).length };
    });

    const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="customers-page animate-fade-in">
            <h2>Customers</h2>

            <div className="search-bar mb-md mt-sm">
                <input
                    type="text"
                    className="input-field"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="customer-list">
                {filteredCustomers.length > 0 ? filteredCustomers.map((c, i) => (
                    <div key={i} className="customer-card glass-panel flex-row justify-between items-center">
                        <div className="flex-row items-center gap-md">
                            <div className="avatar">{c.name.charAt(0)}</div>
                            <div>
                                <h4>{c.name}</h4>
                                <p className="text-muted">{c.visitsCount} visits</p>
                            </div>
                        </div>
                        <button className="btn-icon">📞</button>
                    </div>
                )) : (
                    <div className="empty-state glass-panel">
                        <p>No customers found.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function AddVisit({ visits, setVisits, onSave, visitToEdit }) {
    const [formData, setFormData] = useState({
        customerName: visitToEdit ? visitToEdit.customerName : '',
        phone: visitToEdit ? visitToEdit.phone : '',
        date: visitToEdit ? visitToEdit.date : new Date().toISOString().split('T')[0],
        time: visitToEdit ? visitToEdit.time : '10:00',
        location: visitToEdit ? visitToEdit.location : '',
        notes: visitToEdit ? visitToEdit.notes : '',
        reminderMinutes: visitToEdit ? (visitToEdit.reminderMinutes || 60) : 60
    });
    const [isRecording, setIsRecording] = useState(false);

    useEffect(() => {
        if (visitToEdit) {
            setFormData({
                customerName: visitToEdit.customerName || '',
                phone: visitToEdit.phone || '',
                date: visitToEdit.date || new Date().toISOString().split('T')[0],
                time: visitToEdit.time || '10:00',
                location: visitToEdit.location || '',
                notes: visitToEdit.notes || '',
                reminderMinutes: visitToEdit.reminderMinutes || 60
            });
        }
    }, [visitToEdit]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const newVisitData = {
            customerName: formData.customerName,
            phone: formData.phone,
            date: formData.date,
            time: formData.time,
            location: formData.location || 'Unknown Location',
            notes: formData.notes,
            reminderMinutes: Number(formData.reminderMinutes) || 60
        };

        if (visitToEdit) {
            // Update existing visit
            setVisits(visits.map(v => v.id === visitToEdit.id ? { ...v, ...newVisitData } : v));
        } else {
            // Add new visit
            const newVisit = {
                ...newVisitData,
                id: Date.now(),
                status: 'pending'
            };
            setVisits([...visits, newVisit]);

            // Simulate notification scheduling
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Visit Scheduled", { body: `Scheduled visit with ${formData.customerName}` });
                const audio = new Audio('/smooth-alarm.mp3');
                audio.play().catch(e => console.log(e));
            }
        }

        onSave();
    };

    const handleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        const recognition = new window.webkitSpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsRecording(true);
        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            setFormData({ ...formData, notes: formData.notes ? formData.notes + ' ' + text : text });
            setIsRecording(false);
        };
        recognition.onerror = () => setIsRecording(false);
        recognition.onend = () => setIsRecording(false);

        recognition.start();
    };

    useEffect(() => {
        if ("Notification" in window && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }, []);

    return (
        <div className="add-visit-page animate-fade-in">
            <div className="flex-row justify-between items-center mb-md">
                <h2>{visitToEdit ? 'Edit Visit' : 'Schedule Visit'}</h2>
                <button className="btn-text" onClick={onSave}>Cancel</button>
            </div>

            <form className="glass-panel form-container flex-col gap-md" onSubmit={handleSubmit}>
                <div className="input-group">
                    <label>Customer Name</label>
                    <input
                        type="text"
                        required
                        placeholder="E.g. John Doe"
                        value={formData.customerName}
                        onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                        className="input-field"
                    />
                </div>

                <div className="input-group">
                    <label>Phone Number</label>
                    <input
                        type="tel"
                        placeholder="+1 234 567 8900"
                        value={formData.phone}
                        onChange={e => setFormData({ ...formData, phone: e.target.value })}
                        className="input-field"
                    />
                </div>

                <div className="flex-row gap-md">
                    <div className="input-group flex-1">
                        <label>Date</label>
                        <input
                            type="date"
                            required
                            value={formData.date}
                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                            className="input-field"
                        />
                    </div>
                    <div className="input-group flex-1">
                        <label>Time</label>
                        <input
                            type="time"
                            required
                            value={formData.time}
                            onChange={e => setFormData({ ...formData, time: e.target.value })}
                            className="input-field"
                        />
                    </div>
                </div>

                <div className="input-group">
                    <label>Location / Plot Details</label>
                    <div className="input-with-icon">
                        <input
                            type="text"
                            placeholder="Enter location or drop pin"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                            className="input-field"
                        />
                        <button type="button" className="icon-btn right" onClick={() => setFormData({ ...formData, location: 'Current GPS Location' })}>
                            📍
                        </button>
                    </div>
                </div>

                <div className="input-group">
                    <label>Notes (Voice Input Supported)</label>
                    <div className="textarea-wrapper">
                        <textarea
                            rows="3"
                            placeholder="Add details about customer requirements..."
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                            className="input-field"
                        ></textarea>
                        <button
                            type="button"
                            className={`mic-btn ${isRecording ? 'recording' : ''}`}
                            onClick={handleVoiceInput}
                        >
                            🎤
                        </button>
                    </div>
                </div>

                {/* Alarm Reminder Timing */}
                <div className="reminder-row">
                    <span className="reminder-icon">⏰</span>
                    <label>Remind me before</label>
                    <select
                        value={formData.reminderMinutes}
                        onChange={e => setFormData({ ...formData, reminderMinutes: e.target.value })}
                    >
                        <option value={10}>10 minutes before</option>
                        <option value={15}>15 minutes before</option>
                        <option value={30}>30 minutes before</option>
                        <option value={45}>45 minutes before</option>
                        <option value={60}>1 hour before</option>
                        <option value={90}>1.5 hours before</option>
                        <option value={120}>2 hours before</option>
                        <option value={180}>3 hours before</option>
                        <option value={240}>4 hours before</option>
                    </select>
                </div>

                <button type="submit" className="btn-primary mt-sm">{visitToEdit ? 'Save Changes' : 'Save Appointment'}</button>
            </form>
        </div>
    );
}

function Reports({ visits }) {
    const today = new Date().toISOString().split('T')[0];
    const todayVisits = visits.filter(v => v.date === today);
    const totalCompleted = visits.filter(v => v.status === 'completed').length;

    return (
        <div className="reports-page animate-fade-in">
            <h2>Business Insights</h2>
            <p className="section-subtitle">Daily Summary & Analytics</p>

            <div className="glass-panel mb-md p-md">
                <h3>Today's Performance</h3>
                <div className="flex-row justify-between items-center mt-sm">
                    <div className="text-center flex-1">
                        <div className="metric-value">{todayVisits.length}</div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>Total Scheduled</div>
                    </div>
                    <div className="text-center flex-1" style={{ borderLeft: '1px solid var(--glass-border)', borderRight: '1px solid var(--glass-border)' }}>
                        <div className="metric-value" style={{ color: 'var(--secondary-light)' }}>
                            {todayVisits.filter(v => v.status === 'completed').length}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>Completed</div>
                    </div>
                    <div className="text-center flex-1">
                        <div className="metric-value" style={{ color: 'var(--accent)' }}>
                            {todayVisits.filter(v => v.status === 'pending').length}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.8rem' }}>Pending</div>
                    </div>
                </div>
            </div>

            <div className="glass-panel">
                <h3 className="mb-sm">Lifetime Overview</h3>
                <div className="flex-row justify-between items-center mb-sm">
                    <span>Total Clients Registered</span>
                    <span style={{ fontWeight: 'bold' }}>{new Set(visits.map(v => v.customerName)).size}</span>
                </div>
                <div className="flex-row justify-between items-center mb-sm">
                    <span>Total Lifetime Visits</span>
                    <span style={{ fontWeight: 'bold' }}>{visits.length}</span>
                </div>
                <div className="flex-row justify-between items-center">
                    <span>Conversion/Completion Rate</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--secondary-light)' }}>
                        {visits.length > 0 ? Math.round((totalCompleted / visits.length) * 100) : 0}%
                    </span>
                </div>
            </div>
        </div>
    );
}

function Login({ onLogin, onInstall, isInstalled, showBanner, isIOS, onDismissBanner }) {
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot'
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const trimUser = username.trim();
        const trimPass = password.trim();

        if (mode === 'login') {
            if (trimUser === ADMIN_USER.username && trimPass === ADMIN_USER.password) {
                onLogin(ADMIN_USER);
                return;
            }
            const users = getUsers();
            const found = users.find(u => u.username === trimUser && u.password === trimPass);
            if (found) {
                onLogin({ ...found, role: 'user' });
            } else {
                setError('Invalid username or password');
            }
        } else if (mode === 'signup') {
            if (!trimUser || !trimPass || !email) { setError('All fields are required.'); return; }
            if (trimUser === 'admin') { setError('Cannot use reserved username.'); return; }
            const users = getUsers();
            if (users.find(u => u.username === trimUser)) { setError('Username already exists. Please login.'); return; }
            const updated = [...users, { username: trimUser, password: trimPass, email }];
            saveUsers(updated);
            setSuccess('Account created! Please login.');
            setMode('login');
        } else if (mode === 'forgot') {
            if (!email) { setError('Email is required.'); return; }
            setSuccess(`Password reset instructions sent to ${email}`);
            setTimeout(() => setMode('login'), 3500);
        }
    };

    return (
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
            {showBanner && !isInstalled && (
                <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '24px 16px', marginBottom: '20px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)' }} onClick={onInstall}>
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ color: '#fef08a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1.2rem', marginBottom: '8px', letterSpacing: '1px' }}>✨ INSTALL AS REAL APP</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>Install to get full-screen experience and background alarms.</p>
                        <button className="btn-primary" style={{ width: '100%', padding: '16px', background: '#ffffff', color: '#000000', borderRadius: '12px', fontWeight: 'bold', fontSize: '1rem', boxShadow: '0 4px 14px rgba(255,255,255,0.2)' }} onClick={(e) => { e.stopPropagation(); onInstall(); }}>INSTALL NOW</button>
                    </div>
                </div>
            )}

            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: 'var(--spacing-xl) var(--spacing-lg)' }}>
                <div className="text-center mb-xl">
                    <div style={{ width: '100px', height: '100px', borderRadius: '50%', background: 'url("/logo.webp") center/cover, linear-gradient(135deg, #a5b4fc, #312e81)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.1)' }}>
                        {!window.location.href.includes('github') && <span style={{ fontSize: '2.5rem', display: 'none' }}>🌊</span>}
                    </div>
                    <h1 style={{ fontSize: '2rem', letterSpacing: '2px', marginBottom: '4px' }}>LANDVMS</h1>
                    <p className="text-muted" style={{ fontSize: '0.8rem', letterSpacing: '2px', textTransform: 'uppercase' }}>Secure Terminal Access</p>
                </div>

                {error && <div className="badge warning" style={{ display: 'block', textAlign: 'center', marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)' }}>{error}</div>}
                {success && <div className="badge success" style={{ display: 'block', textAlign: 'center', marginBottom: 'var(--spacing-md)', padding: 'var(--spacing-sm)' }}>{success}</div>}

                <form onSubmit={handleSubmit} className="flex-col gap-md">
                    {mode !== 'forgot' && (
                        <div className="input-group">
                            <label>Username</label>
                            <input type="text" className="input-field" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
                        </div>
                    )}

                    {(mode === 'signup' || mode === 'forgot') && (
                        <div className="input-group">
                            <label>Email ID</label>
                            <input type="email" className="input-field" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                        </div>
                    )}

                    {mode !== 'forgot' && (
                        <div className="input-group">
                            <label>Password</label>
                            <input type="password" className="input-field" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                    )}

                    <button type="submit" className="btn-primary mt-sm" style={{ width: '100%', padding: '16px', marginTop: '12px', fontSize: '1rem', letterSpacing: '1px' }}>
                        {mode === 'login' ? 'TERMINAL ACCESS' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SEND RESET LINK'}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {mode === 'login' ? (
                            <>
                                <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); setSuccess(''); setError(''); }} style={{ fontSize: '0.9rem', color: 'var(--primary-dark)' }}>New user? Sign up here</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setSuccess(''); setError(''); }} style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Forgot password?</a>
                            </>
                        ) : (
                            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setSuccess(''); setError(''); }} style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>← Back to Login</a>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

// Admin-only panel to create and delete user accounts
function ManageUsers() {
    const [users, setUsers] = useState(getUsers);
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleCreate = (e) => {
        e.preventDefault();
        const trimUser = newUsername.trim();
        const trimPass = newPassword.trim();
        if (!trimUser || !trimPass) { setError('Both fields are required.'); return; }
        if (trimUser === 'admin') { setError('Cannot use reserved username "admin".'); return; }
        if (users.find(u => u.username === trimUser)) { setError('Username already exists.'); return; }
        const updated = [...users, { username: trimUser, password: trimPass }];
        saveUsers(updated);
        setUsers(updated);
        setNewUsername('');
        setNewPassword('');
        setError('');
        setSuccess(`✅ User "${trimUser}" created!`);
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleDelete = (uname) => {
        if (!window.confirm(`Delete user "${uname}"? Their visits data will also be removed.`)) return;
        localStorage.removeItem(`landvms_visits_${uname}`);
        const updated = users.filter(u => u.username !== uname);
        saveUsers(updated);
        setUsers(updated);
    };

    return (
        <div className="add-visit-page animate-fade-in">
            <h2>👥 Manage Users</h2>
            <p className="text-muted" style={{ marginBottom: '16px' }}>Only you (admin) can create and delete user accounts.</p>

            <form className="glass-panel form-container flex-col gap-md" onSubmit={handleCreate}>
                <h4 style={{ marginBottom: '4px' }}>Create New User</h4>
                {error && <div className="badge warning" style={{ padding: '8px', textAlign: 'center' }}>{error}</div>}
                {success && <div className="badge success" style={{ padding: '8px', textAlign: 'center' }}>{success}</div>}
                <div className="input-group">
                    <label>Username</label>
                    <input type="text" className="input-field" placeholder="e.g. agent_john" value={newUsername} onChange={e => setNewUsername(e.target.value)} required />
                </div>
                <div className="input-group">
                    <label>Password</label>
                    <input type="text" className="input-field" placeholder="Set a password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                </div>
                <button type="submit" className="btn-primary">Create Account</button>
            </form>

            <div style={{ marginTop: '24px' }}>
                <h4>Existing Users</h4>
                {users.length === 0 ? (
                    <div className="empty-state glass-panel"><p>No users created yet. Add one above!</p></div>
                ) : (
                    users.map(u => (
                        <div key={u.username} className="glass-panel flex-row justify-between items-center" style={{ padding: '12px 16px', marginTop: '10px', borderRadius: '12px' }}>
                            <div>
                                <strong style={{ display: 'block' }}>👤 {u.username}</strong>
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>Password: {u.password}</span>
                            </div>
                            <button onClick={() => handleDelete(u.username)} className="btn-icon" style={{ color: 'var(--danger, #f87171)', fontSize: '1.2rem' }}>🗑️</button>
                        </div>
                    ))
                )}
                <div className="glass-panel" style={{ padding: '12px 16px', marginTop: '10px', borderRadius: '12px', opacity: 0.6 }}>
                    <strong style={{ display: 'block' }}>👑 admin</strong>
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>Super Admin (cannot be deleted)</span>
                </div>
            </div>
        </div>
    );
}

function MapPreview({ location }) {
    if (!location || location === 'Unknown Location' || location === 'Current GPS Location') return null;
    return (
        <div className="map-preview" style={{
            marginTop: 'var(--spacing-xs)',
            marginBottom: 'var(--spacing-sm)',
            borderRadius: 'var(--border-radius-sm)',
            overflow: 'hidden',
            height: '140px',
            border: '1px solid var(--glass-border)'
        }}>
            <iframe
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(1.1) opacity(0.8)' }} // Dark mode filter for embedded map
                src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&t=&z=14&ie=UTF8&iwloc=&output=embed`}
                allowFullScreen
                title={`Map for ${location}`}
            ></iframe>
        </div>
    );
}

export default App
