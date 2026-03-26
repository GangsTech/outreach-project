import { useState, useEffect, useRef, useCallback } from 'react'
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import './app.css'
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';

// ============================================================
// PWA INSTALL PROMPT HOOK
// ============================================================
function useInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const [showBanner, setShowBanner] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);

    useEffect(() => {
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
            setIsInstalled(true);
            return;
        }
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        // if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) return;
        const ua = window.navigator.userAgent;
        const ios = /iphone|ipad|ipod/i.test(ua);
        setIsIOS(ios);
        if (ios) {
            setShowBanner(true);
            return;
        }
        const handler = (e) => {
            e.preventDefault();
            setDeferredPrompt(e);
            setShowBanner(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
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

// Base64 1-second silent WAV to trick mobile OS into never sleeping the background tab
const SILENT_AUDIO = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

window._enableImmortality = () => {
    if (window._isImmortal) return;
    try {
        const audio = new Audio(SILENT_AUDIO);
        audio.loop = true;
        // The play() promise might throw if blocked, but usually works on click.
        audio.play().then(() => {
            window._isImmortal = true;
            console.log("Audio immortality activated.");
        }).catch(err => console.log("Audio blocked:", err));

        if ('wakeLock' in navigator) {
            navigator.wakeLock.request('screen').catch(() => {});
        }
    } catch(e) {}
};

// --- Aggressive Voice + Siren Alarm via Web Speech & Audio API ---
function createVoiceAlarm(customerName, time, location) {
    let stopped = false;
    let loopTimeout = null;
    let sirenCtx = null;
    let sirenOsc = null;
    let sirenInterval = null;

    // Start loud siren
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            sirenCtx = new AudioContext();
            sirenOsc = sirenCtx.createOscillator();
            const gain = sirenCtx.createGain();
            sirenOsc.connect(gain);
            gain.connect(sirenCtx.destination);
            sirenOsc.type = 'square';
            gain.gain.value = 1.0; // Max volume

            let freq = 400;
            sirenOsc.frequency.setValueAtTime(freq, sirenCtx.currentTime);
            sirenInterval = setInterval(() => {
                 freq = freq === 400 ? 800 : 400;
                 if(sirenOsc) sirenOsc.frequency.setValueAtTime(freq, sirenCtx.currentTime);
            }, 400);
            sirenOsc.start();
        }
    } catch(e) { console.error("Siren failed", e); }

    const message = `Wake up! Emergency Alarm! You have a meeting scheduled. Please check your screen! Your meeting with ${customerName} as scheduled in ${time} in the plot ${location}`;

    function speak() {
        if (stopped) return;
        if (!('speechSynthesis' in window)) return;
        
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.rate = 0.9;
        utterance.pitch = 1.2;
        utterance.volume = 1;
        
        utterance.onend = () => {
            if (!stopped) loopTimeout = setTimeout(speak, 3000); 
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
    }
    speak();

    return {
        stop() {
            stopped = true;
            clearTimeout(loopTimeout);
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            
            // Stop siren
            if (sirenInterval) clearInterval(sirenInterval);
            if (sirenOsc) {
                try { sirenOsc.stop(); } catch(e){}
                sirenOsc = null;
            }
            if (sirenCtx && sirenCtx.state !== 'closed') {
                sirenCtx.close();
            }
        }
    };
}

function App() {
    const [currentUser, setCurrentUser] = useState(null);
    const [currentTab, setCurrentTab] = useState('home');
    const [visits, setVisits_raw] = useState([]);
    const [editVisitId, setEditVisitId] = useState(null);
    const notifiedVisits = useRef(new Set());
    const [activeAlarmVisit, setActiveAlarmVisit] = useState(null);
    const alarmRef = useRef(null);
    const { showBanner, isIOS, isInstalled, install, dismiss } = useInstallPrompt();

    useEffect(() => {
        // --- Init Android Notification Channels (Capacitor) ---
        if (Capacitor.isNativePlatform()) {
            LocalNotifications.createChannel({
                id: 'alarm_channel',
                name: 'App Alarms',
                description: 'Crucial meeting alarms that ring even when idle',
                importance: 5, // High importance for heads-up and persistent ring
                visibility: 1, // Visible on lock screen
                sound: 'alarm.wav', // If file is provided in res/raw or public
                vibration: true,
                lights: true,
                lightColor: '#ff0000'
            });
        }

        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                setCurrentUser(user);
            } else {
                setCurrentUser(null);
                setVisits_raw([]);
            }
        });

        // Listen for ALARM_CLICKED from sw.js
        const handleSWMessage = (event) => {
            if (event.data && event.data.type === 'ALARM_CLICKED') {
                const visitId = event.data.visitId;
                // Since visits might be loaded later, we can't reliably find it here if app is starting
                // So we use a ref or check later
                window._pendingAlarmVisitId = visitId;
            }
        };

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', handleSWMessage);
        }

        return () => {
            unsubscribe();
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.removeEventListener('message', handleSWMessage);
            }
        };
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        // Privacy filter: only show visits belonging to the current user
        const q = query(collection(db, "visits"), where("userId", "==", currentUser.uid)); 
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const visitsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setVisits_raw(visitsData);
            
            // If there's a pending alarm from a notification click, trigger it now
            if (window._pendingAlarmVisitId) {
                const v = visitsData.find(x => x.id === window._pendingAlarmVisitId);
                if (v) {
                    setActiveAlarmVisit(v);
                    window._pendingAlarmVisitId = null;
                }
            }

            // Sync with Background Service Worker for alarms outside the app
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SYNC_VISITS',
                    visits: visitsData
                });
            }
        }, (err) => {
            console.error("Firestore read error:", err);
            alert("Error reading appointments: " + err.message);
        });
        return () => unsubscribe();
    }, [currentUser]);

    // --- NATIVE ALARM SCHEDULING (Capacitor) ---
    const scheduleNativeAlarms = useCallback(async (vData) => {
        if (!Capacitor.isNativePlatform()) return;
        try {
            const status = await LocalNotifications.requestPermissions();
            if (status.display !== 'granted') return;

            const now = new Date();
            const upcoming = vData.filter(v => v.status === 'pending');
            const notifications = upcoming.map(v => {
                const [h, m] = v.time.split(':').map(Number);
                const [year, month, day] = v.date.split('-').map(Number);
                const scheduleDate = new Date(year, month - 1, day, h, m);
                const leadTime = v.reminderMinutes || 0; // Use lead time if specified 
                const alarmTime = new Date(scheduleDate.getTime() - (leadTime * 60 * 1000));
                
                if (alarmTime > now) {
                    return {
                        title: `🚨 NOTIFY ALARM: ${v.customerName}`,
                        body: `Meeting at ${v.location} (Starting in ${v.reminderMinutes || 0} mins)`,
                        id: Math.floor(Math.random() * 1000000),
                        schedule: { at: alarmTime, allowWhileIdle: true },
                        sound: 'alarm.wav',
                        channelId: 'alarm_channel',
                        extra: { visitId: v.id },
                        smallIcon: 'ic_launcher', // Use app icon or standard one
                        vibrationPattern: [0, 1000, 500, 1000, 500, 1000, 500, 1000],
                        priority: 2, // Max priority
                        requireInteraction: true // Make it sticky on the screen
                    };
                }
                return null;
            }).filter(n => n !== null);

            if (notifications.length > 0) {
                const pending = await LocalNotifications.getPending();
                if (pending.notifications.length > 0) {
                    await LocalNotifications.cancel({ notifications: pending.notifications });
                }
                await LocalNotifications.schedule({ notifications });
            }
        } catch (err) {
            console.error('Native Notification scheduling error:', err);
        }
    }, []);

    useEffect(() => {
        if (visits.length > 0) {
            scheduleNativeAlarms(visits);
        }
    }, [visits, scheduleNativeAlarms]);

    const handleLogout = async () => {
        await signOut(auth);
        setCurrentTab('home');
        notifiedVisits.current = new Set();
    };

    const handleEditVisit = (id) => {
        setEditVisitId(id);
        setCurrentTab('edit_visit');
    };

    const handleDeleteVisit = async (id) => {
        if (!window.confirm("Delete this appointment?")) return;
        try {
            await deleteDoc(doc(db, "visits", id));
        } catch (e) {
            console.error("Error deleting", e);
        }
    };

    const updateVisitStatus = async (id, status) => {
        try {
            await updateDoc(doc(db, "visits", id), { status });
        } catch (e) {
            console.error("Error updating", e);
        }
    };

    useEffect(() => {
        if (activeAlarmVisit) {
            if (!alarmRef.current) {
                alarmRef.current = createVoiceAlarm(
                    activeAlarmVisit.customerName,
                    activeAlarmVisit.time,
                    activeAlarmVisit.location
                );
            }
        } else {
            if (alarmRef.current) {
                alarmRef.current.stop();
                alarmRef.current = null;
            }
        }
    }, [activeAlarmVisit]);

    useEffect(() => {
        if (!currentUser) return;
        const intervalId = setInterval(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const today = `${year}-${month}-${day}`;

            visits.forEach(visit => {
                if (visit.date === today && visit.status === 'pending') {
                    const [hours, minutes] = visit.time.split(':').map(Number);
                    const visitTime = new Date();
                    visitTime.setHours(hours, minutes, 0, 0);

                    const diffMinutes = (visitTime - now) / (1000 * 60);
                    const leadTime = visit.reminderMinutes || 60;

                    if (diffMinutes > 0 && diffMinutes <= leadTime && !notifiedVisits.current.has(visit.id)) {
                        setActiveAlarmVisit(visit);
                        notifiedVisits.current.add(visit.id);

                        // Trigger Aggressive Background Notification
                        if (Notification.permission === 'granted' && navigator.serviceWorker) {
                            navigator.serviceWorker.ready.then(registration => {
                                const leadLabel = leadTime >= 60 
                                    ? `${leadTime / 60} hour${leadTime > 60 ? 's' : ''}` 
                                    : `${leadTime} minutes`;
                                
                                registration.showNotification(`🚨 NOTIFY: ${activeAlarmVisit.customerName}`, {
                                    body: `MEETING ALERT: Starting in ${leadLabel} at ${activeAlarmVisit.location}! TAP TO OPEN.`,
                                    icon: '/pwa-192x192.png',
                                    badge: '/pwa-192x192.png',
                                    tag: `alarm-${activeAlarmVisit.id}`,
                                    renotify: true, // Make it ring/vibrate even if already there
                                    requireInteraction: true, // Keep it on the lock screen
                                    vibrate: [1000, 500, 1000, 500, 1000, 500, 1000, 500, 1000, 500], // 10s pattern
                                    data: { visitId: activeAlarmVisit.id },
                                    actions: [
                                        { action: 'view', title: 'Open & Speak Alarm', icon: '📢' },
                                        { action: 'close', title: 'I Got It', icon: '✅' }
                                    ]
                                });
                            });
                        }
                    }
                }
            });
        }, 30000); 

        return () => clearInterval(intervalId);
    }, [visits, currentUser]);

    if (!currentUser) {
        return <Login onInstall={install} isInstalled={isInstalled} showBanner={showBanner} isIOS={isIOS} onDismissBanner={dismiss} />;
    }

    const renderContent = () => {
        switch (currentTab) {
            case 'home':
                return <Dashboard visits={visits} onUpdateStatus={updateVisitStatus} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} username={currentUser?.email.split('@')[0]} />;
            case 'visits':
                return <Visits visits={visits} onUpdateStatus={updateVisitStatus} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} />;
            case 'customers':
                return <Customers visits={visits} />;
            case 'add_visit':
                return <AddVisit key="add" onSave={() => setCurrentTab('home')} />;
            case 'edit_visit':
                return <AddVisit key={`edit-${editVisitId}`} onSave={() => { setCurrentTab('home'); setEditVisitId(null); }} visitToEdit={visits.find(v => v.id === editVisitId)} />;
            case 'reports':
                return <Reports visits={visits} />;
            default:
                return <Dashboard visits={visits} onUpdateStatus={updateVisitStatus} onEditVisit={handleEditVisit} onDeleteVisit={handleDeleteVisit} />;
        }
    };

    return (
        <div className="app-container">
            {showBanner && (
                <InstallBanner isIOS={isIOS} onInstall={install} onDismiss={dismiss} />
            )}
            <header className="app-header glass-panel">
                <div className="flex-row items-center gap-sm">
                    <div className="text-logo" style={{ 
                        fontFamily: "'Outfit', sans-serif", 
                        fontWeight: '900', 
                        fontSize: '1.8rem', 
                        letterSpacing: '-1.5px',
                        background: 'linear-gradient(135deg, #ffffff, #666666)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        textTransform: 'uppercase'
                    }}>Notify</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button 
                        onClick={handleLogout}
                        style={{ background: 'none', border: '1px solid var(--danger, #f87171)', borderRadius: '8px', color: 'var(--danger, #f87171)', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                    >
                        Logout
                    </button>
                    <div className="user-avatar" title={currentUser?.email}>
                        <span>{currentUser?.email?.charAt(0).toUpperCase()}</span>
                    </div>
                </div>
            </header>

            <main className="main-content animate-fade-in">
                {renderContent()}
            </main>

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

function Dashboard({ visits, onUpdateStatus, onEditVisit, onDeleteVisit, username }) {
    const [wakeLock, setWakeLock] = useState(null);
    const [isWakeActive, setIsWakeActive] = useState(false);

    const toggleWakeLock = async () => {
        if (!('wakeLock' in navigator)) {
            alert("Wake Lock is not supported on this device/browser.");
            return;
        }
        try {
            if (isWakeActive) {
                await wakeLock.release();
                setWakeLock(null);
                setIsWakeActive(false);
            } else {
                const lock = await navigator.wakeLock.request('screen');
                setWakeLock(lock);
                setIsWakeActive(true);
                lock.addEventListener('release', () => {
                    setIsWakeActive(false);
                });
            }
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    };
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const todayVisits = (visits || []).filter(v => v.date === today);
    const pendingVisits = todayVisits.filter(v => v.status === 'pending');
    const completedVisits = todayVisits.filter(v => v.status === 'completed');

    return (
        <div className="dashboard">
            <h2 className="section-title">Hello, {username ? username.charAt(0).toUpperCase() + username.slice(1) : 'there'} 👋</h2>
            <p className="section-subtitle">Here's your schedule for today</p>
            <div className="metrics-grid">
                <div className="metric-card glass-panel" onClick={() => {
                    const synth = window.speechSynthesis;
                    if (synth) {
                        const utterance = new SpeechSynthesisUtterance('');
                        utterance.volume = 0;
                        synth.speak(utterance);
                    }
                    if (window._enableImmortality) window._enableImmortality();
                    alert("✅ NOTIFY CONNECTED: Alarms will now ring automatically even if the phone is asleep on the table!");
                }} style={{ cursor: 'pointer', border: '1px solid #4ade80' }}>
                    <div className="metric-icon">🚀</div>
                    <div className="metric-value" style={{ fontSize: '1.2rem', color: '#4ade80' }}>CONNECT</div>
                    <div className="metric-label">Click Once to Enable Alarms</div>
                </div>
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

                <div className="metric-card glass-panel" onClick={async () => {
                    if (!Capacitor.isNativePlatform()) {
                        alert("🔴 Test this on an actual Android device!");
                        return;
                    }
                    try {
                        const status = await LocalNotifications.requestPermissions();
                        if (status.display !== 'granted') return;
                        
                        await LocalNotifications.schedule({
                            notifications: [{
                                title: "🔔 TEST ALARM (5s)",
                                body: "Congrats! Your Notify app alarms are working perfectly.",
                                id: 999,
                                schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
                                sound: 'alarm.wav',
                                channelId: 'alarm_channel',
                                priority: 2,
                                requireInteraction: true
                            }]
                        });
                        alert("✅ Scheduled! Lock your screen now and wait 5 seconds.");
                    } catch (e) { alert("Error: " + e.message); }
                }} style={{ cursor: 'pointer', border: '1px solid var(--accent, #4287f5)' }}>
                    <div className="metric-icon">🔔</div>
                    <div className="metric-value">TEST</div>
                    <div className="metric-label">Click for 5s Alarm Test</div>
                </div>
            </div>
            <div className="upcoming-section">
                <div className="flex-row justify-between items-center mb-sm">
                    <h3>Upcoming Visits</h3>
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
                                <button className="btn-icon" onClick={() => { if (visit.phone) window.location.href = `tel:${visit.phone.replace(/\D/g, '')}`; }} title="Call">📞</button>
                                <button className="btn-icon" onClick={() => {
                                    const msg = `Hello ${visit.customerName}! This is a reminder for our meeting today at ${visit.time} at ${visit.location}. See you there!`;
                                    window.open(`https://wa.me/${visit.phone ? visit.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(msg)}`, '_blank');
                                }} title="WhatsApp">💬</button>
                                <button className="btn-primary small" onClick={() => onUpdateStatus(visit.id, 'completed')}>Complete</button>
                                <button className="btn-icon btn-delete" onClick={() => onDeleteVisit(visit.id)} title="Delete">🗑️</button>
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

function Visits({ visits, onUpdateStatus, onEditVisit, onDeleteVisit }) {
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
                                onClick={() => onUpdateStatus(visit.id, visit.status === 'pending' ? 'completed' : 'pending')}
                                style={{ fontSize: '0.8rem', cursor: 'pointer', marginRight: 'var(--spacing-sm)' }}
                            >
                                Mark {visit.status === 'pending' ? 'Completed' : 'Pending'}
                            </button>
                            <div className="flex-row gap-xs" style={{ marginLeft: 'auto' }}>
                                <button className="btn-icon" onClick={() => {
                                    const msg = `Hello ${visit.customerName}! This is a reminder for our meeting on ${visit.date} at ${visit.time} at ${visit.location}.`;
                                    window.open(`https://wa.me/${visit.phone ? visit.phone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(msg)}`, '_blank');
                                }} title="WhatsApp">💬</button>
                                <button className="btn-icon" onClick={() => onEditVisit(visit.id)} title="Edit">✏️</button>
                                <button className="btn-icon btn-delete" onClick={() => onDeleteVisit(visit.id)} title="Delete">🗑️</button>
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
    const customers = Array.from(new Set(visits.map(v => v.customerName))).map(name => {
        return { name, visitsCount: visits.filter(v => v.customerName === name).length };
    });
    const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="customers-page">
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

function AddVisit({ onSave, visitToEdit }) {
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

    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        const data = {
            ...formData,
            reminderMinutes: Number(formData.reminderMinutes),
            userId: auth.currentUser.uid,
            timestamp: serverTimestamp()
        };

        try {
            if (visitToEdit) {
                await updateDoc(doc(db, "visits", visitToEdit.id), data);
            } else {
                await addDoc(collection(db, "visits"), { ...data, status: 'pending' });
            }
            onSave();
        } catch (err) {
            console.error("Error saving visit", err);
            alert("Error saving: " + err.message + "\n\nMake sure your Firestore Rules are set to 'allow read, write: if request.auth != null;'");
        } finally {
            setIsSaving(false);
        }
    };

    const handleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Speech recognition not supported.");
            return;
        }
        const recognition = new window.webkitSpeechRecognition();
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

    return (
        <div className="add-visit-page animate-fade-in">
            <div className="flex-row justify-between items-center mb-md">
                <h2>{visitToEdit ? 'Edit Visit' : 'Schedule Visit'}</h2>
                <button className="btn-text" onClick={onSave}>Cancel</button>
            </div>
            <form className="glass-panel form-container flex-col gap-md" onSubmit={handleSubmit}>
                <div className="input-group">
                    <label>Customer Name</label>
                    <input type="text" required placeholder="E.g. John Doe" value={formData.customerName} onChange={e => setFormData({ ...formData, customerName: e.target.value })} className="input-field" />
                </div>
                <div className="input-group">
                    <label>Phone Number</label>
                    <input type="tel" placeholder="+91 1234567890" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field" />
                </div>
                <div className="flex-row gap-md">
                    <div className="input-group flex-1">
                        <label>Date</label>
                        <input type="date" required value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} className="input-field" />
                    </div>
                    <div className="input-group flex-1">
                        <label>Time</label>
                        <input type="time" required value={formData.time} onChange={e => setFormData({ ...formData, time: e.target.value })} className="input-field" />
                    </div>
                </div>
                <div className="input-group">
                    <label>Location / Plot Details</label>
                    <input type="text" placeholder="Enter location" value={formData.location} onChange={e => setFormData({ ...formData, location: e.target.value })} className="input-field" />
                </div>
                <div className="input-group">
                    <label>Notes (Voice Input Supported)</label>
                    <div className="textarea-wrapper">
                        <textarea rows="3" placeholder="Add details..." value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} className="input-field"></textarea>
                        <button type="button" className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={handleVoiceInput}>🎤</button>
                    </div>
                </div>
                <div className="reminder-row">
                    <span className="reminder-icon">⏰</span>
                    <label>Remind me before</label>
                    <select value={formData.reminderMinutes} onChange={e => setFormData({ ...formData, reminderMinutes: e.target.value })}>
                        <option value={0}>At time of meeting</option>
                        <option value={1}>1 minute before</option>
                        <option value={5}>5 minutes before</option>
                        <option value={15}>15 minutes before</option>
                        <option value={30}>30 minutes before</option>
                        <option value={60}>1 hour before</option>
                        <option value={120}>2 hours before</option>
                        <option value={180}>3 hours before</option>
                        <option value={240}>4 hours before</option>
                        <option value={300}>5 hours before</option>
                        <option value={360}>6 hours before</option>
                        <option value={420}>7 hours before</option>
                        <option value={480}>8 hours before</option>
                        <option value={1440}>1 day before</option>
                        <option value={2880}>2 days before</option>
                    </select>
                </div>
                <button type="submit" className="btn-primary mt-sm" disabled={isSaving}>
                    {isSaving ? 'Saving...' : (visitToEdit ? 'Save Changes' : 'Save Appointment')}
                </button>
            </form>
        </div>
    );
}

function Reports({ visits }) {
    const localDate = new Date();
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const todayVisits = visits.filter(v => v.date === today);
    const totalCompleted = visits.filter(v => v.status === 'completed').length;

    return (
        <div className="reports-page">
            <h2>Business Insights</h2>
            <div className="glass-panel mb-md p-md">
                <h3>Today's Performance</h3>
                <div className="flex-row justify-between items-center mt-sm">
                    <div className="text-center flex-1">
                        <div className="metric-value">{todayVisits.length}</div>
                        <div className="text-muted">Total Scheduled</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Login({ onInstall, isInstalled, showBanner, isIOS, onDismissBanner }) {
    const [mode, setMode] = useState('login'); 
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            if (mode === 'login') {
                await signInWithEmailAndPassword(auth, email, password);
            } else if (mode === 'signup') {
                await createUserWithEmailAndPassword(auth, email, password);
                setSuccess('Account created! Logging in...');
            } else if (mode === 'forgot') {
                await sendPasswordResetEmail(auth, email);
                setSuccess(`Password reset instructions sent to ${email}`);
                setTimeout(() => setMode('login'), 3500);
            }
        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', padding: '10px' }}>
            {showBanner && !isInstalled && (
                <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '24px 16px', marginBottom: '20px', textAlign: 'center' }} onClick={onInstall}>
                    <h3 style={{ color: '#fef08a' }}>✨ INSTALL AS REAL APP</h3>
                    <button className="btn-primary" style={{ width: '100%', marginTop: '10px' }}>INSTALL NOW</button>
                </div>
            )}
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '3rem 2rem' }}>
                <div className="text-center mb-xl">
                    <div style={{ 
                        width: '80px', 
                        height: '80px', 
                        borderRadius: '24px', 
                        margin: '0 auto 24px', 
                        background: 'linear-gradient(135deg, #ffffff, #888888)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2.5rem',
                        color: '#000000',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                        fontWeight: '900'
                    }}>N</div>
                    <h1 style={{ 
                        fontSize: '2.2rem', 
                        letterSpacing: '-1px', 
                        marginBottom: '8px',
                        fontFamily: "'Outfit', sans-serif",
                        fontWeight: '800',
                        textTransform: 'uppercase'
                    }}>Notify</h1>
                    <p style={{ 
                        fontSize: '0.8rem', 
                        letterSpacing: '3px', 
                        textTransform: 'uppercase', 
                        color: 'var(--text-muted)',
                        fontWeight: '500'
                    }}>Management Console</p>
                </div>
                {error && <div className="badge warning" style={{ display: 'block', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>}
                {success && <div className="badge success" style={{ display: 'block', textAlign: 'center', marginBottom: '1rem' }}>{success}</div>}
                <form onSubmit={handleSubmit} className="flex-col gap-md">
                    <div className="input-group">
                        <label>Email Address</label>
                        <input type="email" className="input-field" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    {mode !== 'forgot' && (
                        <div className="input-group">
                            <label>Password</label>
                            <input type="password" className="input-field" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                        </div>
                    )}
                    <button type="submit" className="btn-primary mt-sm" style={{ width: '100%' }}>
                        {mode === 'login' ? 'ACCESS APP' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SEND RESET LINK'}
                    </button>
                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        {mode === 'login' ? (
                            <>
                                <a href="#" onClick={(e) => { e.preventDefault(); setMode('signup'); }} style={{ display: 'block', marginBottom: '0.5rem' }}>New user? Sign up</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); }}>Forgot password?</a>
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '2rem', paddingTop: '2rem' }}>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.2rem', letterSpacing: '1px' }}>FOR NO-INTERRUPTION ALARMS:</p>
                                    <a 
                                        href="/Notify_Android_App.zip" 
                                        className="btn-primary" 
                                        style={{ display: 'inline-block', width: '100%', textDecoration: 'none', background: 'linear-gradient(135deg, #111111, #333333)', border: '1px solid #444', color: '#fff' }}
                                    >
                                        📲 DOWNLOAD FOR ANDROID
                                    </a>
                                </div>
                            </>
                        ) : (
                            <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); }}>← Back to Login</a>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

function MapPreview({ location }) {
    if (!location) return null;
    return (
        <div className="map-preview" style={{ marginTop: 'var(--spacing-xs)', marginBottom: 'var(--spacing-sm)', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden', height: '140px', border: '1px solid var(--glass-border)' }}>
            <iframe width="100%" height="100%" frameBorder="0" style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) contrast(1.1) opacity(0.8)' }} src={`https://maps.google.com/maps?q=${encodeURIComponent(location)}&t=&z=14&ie=UTF8&iwloc=&output=embed`} allowFullScreen title={`Map for ${location}`}></iframe>
        </div>
    );
}

export default App
