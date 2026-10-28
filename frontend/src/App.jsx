import React, { useState, useEffect } from 'react';
import {
    Activity, Server, Database, ShieldCheck, Smartphone, Users,
    Clock, CheckCircle2, Volume2, VolumeX, Pill, Cloud, Play, Pause, Download, PhoneCall, ArrowRight, Globe, Megaphone
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

const TRANSLATIONS = {
    en: {
        ussdHome: "SizaCloud Public Health\nZero-Rated DoH Queue Service\n1. Book Queue Ticket\n2. Check Wait Time\n3. Check Chronic Med Stock\n4. Change Language (English)",
        selectDept: "Select Hospital Unit:\n1. Main Pharmacy\n2. Paediatric Pharmacy\n3. X-Ray Dept\n4. CT Scan Unit\n0. Back",
        bookingConfirmed: "CONFIRMED!\nTicket: {ticket}\nUnit: {dept}\nSMS sent via Amazon SNS ({lang}).\n0. Main Menu",
        portalTitle: "Zero-Rated Citizen Queue Booking",
        portalSub: "Book your hospital slot before paying for a taxi trip. Instant SMS confirmation via Amazon SNS."
    },
    ts: {
        ussdHome: "Rihanyo ra Vaaki ra SizaCloud\nVukorhokeri bya nxaxamelo bya DoH bya mahala\n1. Bhuka thekete ra nxaxamelo\n2. Kambela nkarhi wo rindza\n3. Kambela swisirheleli swa vuvabyi bya nkarhi wo leha\n4. Cinca ririmi (Xitsonga)",
        selectDept: "Hlawula xiyenge xa vuxamelo:\n1. Khemisi ya le xikarhi\n2. Khemisi ya vana\n3. Xiyenge xa X-Ray\n4. Xiyenge xa CT Scan\n0. Thlelela endzhaku",
        bookingConfirmed: "SWI TIYISIWILE!\nThekete: {ticket}\nXiyenge: {dept}\nSMS yi rhimeriwile hi Amazon SNS ({lang}).\n0. Menu ya le xikarhi",
        portalTitle: "Kubhuka loku nga riki na nchuku ku endla nxaxamelo wa Vaaki",
        portalSub: "Bhuka nkarhi wa wena wa xibedlhele u nga si hakelela thekisi. Ntiyisiso wa nkarhi lowu kumiwaka hi SMS hi ku tirhisa Amazon SNS."
    },
    zu: {
        ussdHome: "SizaCloud Ezempilo\nIsevisi Yamahhala ye-DoH\n1. Bhuka Ithikithi\n2. Hlola Isikhathi Sokulinda\n3. Hlola Isitokwe Semithi\n4. Shintsha Ulimi (isiZulu)",
        selectDept: "Khetha UMnyango Wasesibhedlela:\n1. Kwamakhemisi Omkhulu\n2. Kwamakhemisi Ezingane\n3. Uphiko lwe-X-Ray\n4. Uphiko lwe-CT Scan\n0. Emuva",
        bookingConfirmed: "KUQINISEKISIWE!\nIthikithi: {ticket}\nUMnyango: {dept}\nSMS ithunyelwe nge-Amazon SNS ({lang}).\n0. Imenyu Ekhulu",
        portalTitle: "Ukubhukha Ithikithi Lemahhala",
        portalSub: "Bhukha isikhathi sakho sesibhedlela ngaphambi kokugibela itekisi. SMS yesiqinisekiso nge-Amazon SNS."
    }
};

const INITIAL_DEPARTMENTS = [
    { dept_id: 1, dept_code: 'MPHM', dept_name: 'Main Pharmacy', avg_service_time_mins: 8, active_counters: 3 },
    { dept_id: 2, dept_code: 'PPHM', dept_name: 'Paediatric Pharmacy', avg_service_time_mins: 10, active_counters: 2 },
    { dept_id: 3, dept_code: 'XRAY', dept_name: 'X-Ray Department', avg_service_time_mins: 15, active_counters: 2 },
    { dept_id: 4, dept_code: 'CTSC', dept_name: 'CT Scan Unit', avg_service_time_mins: 25, active_counters: 1 }
];

export default function SizaCloudApp() {
    const [activeTab, setActiveTab] = useState('portal');
    const [lang, setLang] = useState('en');
    const [backendConnected, setBackendConnected] = useState(false);
    const [departments, setDepartments] = useState(INITIAL_DEPARTMENTS);
    const [tickets, setTickets] = useState([]);
    const [medications, setMedications] = useState([]);
    const [snsLogs, setSnsLogs] = useState([]);
    const [soundEnabled, setSoundEnabled] = useState(true);

    // Booking Form State
    const [patientName, setPatientName] = useState('');
    const [patientPhone, setPatientPhone] = useState('+27');
    const [selectedDept, setSelectedDept] = useState(1);
    const [priority, setPriority] = useState('STANDARD');
    const [bookingFeedback, setBookingFeedback] = useState(null);

    // USSD State
    const [ussdStep, setUssdStep] = useState('HOME');
    const [ussdInput, setUssdInput] = useState('');
    const [ussdScreenText, setUssdScreenText] = useState(TRANSLATIONS['en'].ussdHome);

    useEffect(() => {
        if (ussdStep === 'HOME') {
            setUssdScreenText(TRANSLATIONS[lang].ussdHome);
        }
    }, [lang]);

    const fetchBackendState = async () => {
        try {
            const res = await fetch(`${API_BASE}/state`);
            if (!res.ok) throw new Error('Offline');
            const data = await res.json();
            setDepartments(data.departments);
            setTickets(data.tickets);
            setMedications(data.medications);
            setSnsLogs(data.sns_logs);
            setBackendConnected(true);
        } catch {
            setBackendConnected(false);
        }
    };

    useEffect(() => {
        fetchBackendState();
        const timer = setInterval(fetchBackendState, 4000);
        return () => clearInterval(timer);
    }, []);

    // Robust Text-to-Speech & Chime Announcement for Patient Names
    const announcePatientCall = (ticketNumber, patientName, deptName) => {
        if (!soundEnabled) return;
        try {
            // 1. Play PA Chime
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);

            // 2. Synthesize Voice Callout with Speech Synthesis
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel(); // Clear any stuck utterances
                const speechText = `Attention patient. Ticket number ${ticketNumber}. ${patientName}. Please proceed to ${deptName}.`;
                const utterance = new SpeechSynthesisUtterance(speechText);
                utterance.rate = 0.92;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;

                // Pick an English voice if available
                const voices = window.speechSynthesis.getVoices();
                const enVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
                if (enVoice) {
                    utterance.voice = enVoice;
                }

                window.speechSynthesis.speak(utterance);
            }
        } catch (e) {
            console.log('Audio announcement error:', e);
        }
    };

    const handleIssueTicket = async (e) => {
        e.preventDefault();
        if (!patientName.trim()) return;

        if (backendConnected) {
            const res = await fetch(`${API_BASE}/tickets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_name: patientName,
                    patient_phone: patientPhone,
                    dept_id: selectedDept,
                    priority,
                    language_preference: lang
                })
            });
            if (res.ok) {
                const result = await res.json();
                setBookingFeedback(result.ticket);
                setPatientName('');
                await fetchBackendState();
                return;
            }
        }

        // Standalone fallback
        const dept = departments.find(d => d.dept_id === Number(selectedDept));
        const newCode = `${dept.dept_code}-${Math.floor(100 + Math.random() * 899)}`;
        const newTicket = {
            ticket_id: Date.now(),
            ticket_number: newCode,
            patient_name: patientName,
            patient_phone: patientPhone,
            dept_id: dept.dept_id,
            dept_name: dept.dept_name,
            priority,
            status: 'WAITING',
            language_preference: lang
        };
        setTickets(prev => [...prev, newTicket]);
        setBookingFeedback(newTicket);
        setSnsLogs(prev => [
            { log_id: Date.now(), phone_number: patientPhone, message: `[Amazon SNS] Ticket ${newCode} (${patientName}) confirmed for ${dept.dept_name}.`, sent_at: new Date().toLocaleTimeString('en-ZA') },
            ...prev
        ]);
        setPatientName('');
    };

    const handleCallNext = async (deptId) => {
        const dept = departments.find(d => d.dept_id === deptId);
        const waitingInDept = tickets.filter(t => t.dept_id === deptId && t.status === 'WAITING');
        const nextWaiting = waitingInDept[0];

        if (nextWaiting) {
            announcePatientCall(nextWaiting.ticket_number, nextWaiting.patient_name, dept.dept_name);
        }

        if (backendConnected) {
            await fetch(`${API_BASE}/marshal/call-next`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dept_id: deptId })
            });
            await fetchBackendState();
            return;
        }

        // Fallback
        setTickets(prev => prev.map(t => {
            if (t.dept_id === deptId && t.status === 'SERVING') return { ...t, status: 'SERVED' };
            if (nextWaiting && t.ticket_id === nextWaiting.ticket_id) return { ...t, status: 'SERVING' };
            return t;
        }));
    };

    const handleTransferTicket = async (ticketId, targetDeptId) => {
        if (backendConnected) {
            const res = await fetch(`${API_BASE}/marshal/transfer-ticket`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: ticketId, target_dept_id: targetDeptId, priority: 'URGENT' })
            });
            if (res.ok) {
                await fetchBackendState();
                return;
            }
        }

        const targetDept = departments.find(d => d.dept_id === targetDeptId);
        const newCode = `${targetDept.dept_code}-99`;
        setTickets(prev => prev.map(t => t.ticket_id === ticketId ? { ...t, dept_id: targetDeptId, dept_name: targetDept.dept_name, ticket_number: newCode, status: 'WAITING', priority: 'URGENT' } : t));
    };

    const handleUssdSend = async () => {
        const val = ussdInput.trim();
        setUssdInput('');

        if (ussdStep === 'HOME') {
            if (val === '1') {
                setUssdStep('BOOK_DEPT');
                setUssdScreenText(TRANSLATIONS[lang].selectDept);
            } else if (val === '4') {
                const nextLang = lang === 'en' ? 'ts' : lang === 'ts' ? 'zu' : 'en';
                setLang(nextLang);
                setUssdScreenText(TRANSLATIONS[nextLang].ussdHome);
            }
        } else if (ussdStep === 'BOOK_DEPT') {
            const idx = parseInt(val, 10);
            if (idx >= 1 && idx <= 4) {
                const dept = departments[idx - 1];
                const ticketCode = `${dept.dept_code}-USSD`;
                setUssdStep('DONE');
                const template = TRANSLATIONS[lang].bookingConfirmed;
                setUssdScreenText(template.replace('{ticket}', ticketCode).replace('{dept}', dept.dept_name).replace('{lang}', lang.toUpperCase()));
            } else {
                setUssdStep('HOME');
                setUssdScreenText(TRANSLATIONS[lang].ussdHome);
            }
        } else {
            setUssdStep('HOME');
            setUssdScreenText(TRANSLATIONS[lang].ussdHome);
        }
    };

    const servingTickets = tickets.filter(t => t.status === 'SERVING');

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
            {/* Top Header */}
            <header className="border-b border-slate-800 bg-slate-900/90 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <Cloud className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg text-white">SizaCloud Health</h1>
                        <p className="text-xs text-slate-400">Public Clinic Dispatch & Queue Engine</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center gap-1.5 text-xs"
                        title="Toggle PA Audio Announcement"
                    >
                        {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
                        {soundEnabled ? 'PA Voice ON' : 'PA Voice OFF'}
                    </button>

                    <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl text-xs">
                        <Globe className="w-4 h-4 text-emerald-400" />
                        <select value={lang} onChange={(e) => setLang(e.target.value)} className="bg-transparent text-white font-medium focus:outline-none cursor-pointer">
                            <option value="en" className="bg-slate-900">English (EN)</option>
                            <option value="ts" className="bg-slate-900">Xitsonga (TS)</option>
                            <option value="zu" className="bg-slate-900">isiZulu (ZU)</option>
                        </select>
                    </div>
                </div>
            </header>

            {/* Waiting Room Live TV PA Ticker Banner */}
            <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-4 py-2.5 flex items-center gap-4 overflow-x-auto text-xs">
                <span className="uppercase tracking-wider font-bold text-emerald-300 shrink-0 flex items-center gap-1.5">
                    <Megaphone className="w-4 h-4 animate-bounce" /> Currently Calling Patient:
                </span>
                {servingTickets.length === 0 ? (
                    <span className="text-slate-300">Waiting room ready for next marshal call...</span>
                ) : (
                    servingTickets.map(t => (
                        <div key={t.ticket_id} className="px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-100 shrink-0 font-mono flex items-center gap-2">
                            <strong className="text-white text-sm">{t.ticket_number}</strong>
                            <span className="text-emerald-200 font-semibold">• {t.patient_name}</span>
                            <span className="text-xs bg-slate-950/70 px-1.5 py-0.5 rounded text-emerald-300">({t.dept_name})</span>
                        </div>
                    ))
                )}
            </div>

            <div className="max-w-7xl w-full mx-auto px-4 pt-5">
                <div className="flex gap-2 border-b border-slate-800 pb-3">
                    {[
                        { id: 'portal', label: '1. Citizen Portal & USSD (*134*7492#)' },
                        { id: 'marshal', label: '2. Queue Marshal & Name Callouts' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === tab.id ? 'bg-emerald-500 text-slate-950 font-semibold' : 'bg-slate-900 text-slate-300 border border-slate-800'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">
                {activeTab === 'portal' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                            <h2 className="text-lg font-bold text-white mb-1">{TRANSLATIONS[lang].portalTitle}</h2>
                            <p className="text-xs text-slate-400 mb-4">{TRANSLATIONS[lang].portalSub}</p>

                            <form onSubmit={handleIssueTicket} className="space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Patient Full Name</label>
                                    <input type="text" required placeholder="e.g., Thandiwe Khosa" value={patientName} onChange={(e) => setPatientName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Mobile Number (SMS)</label>
                                    <input type="text" required value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white font-mono" />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">Department</label>
                                    <select value={selectedDept} onChange={(e) => setSelectedDept(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white">
                                        {departments.map(d => <option key={d.dept_id} value={d.dept_id}>{d.dept_name}</option>)}
                                    </select>
                                </div>
                                <button type="submit" className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition">
                                    Issue Ticket & Dispatch SMS
                                </button>
                            </form>

                            {bookingFeedback && (
                                <div className="mt-4 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between">
                                    <div>
                                        <span className="text-xs uppercase text-emerald-400 font-bold">Ticket Issued</span>
                                        <p className="text-lg font-mono font-bold text-white">{bookingFeedback.ticket_number}</p>
                                        <p className="text-xs text-slate-300">Patient: {bookingFeedback.patient_name} • Dept: {bookingFeedback.dept_name || 'Assigned'}</p>
                                    </div>
                                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                </div>
                            )}
                        </div>

                        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm mx-auto shadow-2xl flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
                                    <span>USSD Simulator ({lang.toUpperCase()})</span>
                                    <span className="font-mono text-emerald-400">*134*7492#</span>
                                </div>
                                <div className="bg-emerald-950/90 border-2 border-emerald-700/60 rounded-2xl p-4 font-mono text-xs text-emerald-100 whitespace-pre-line min-h-[190px] flex flex-col justify-between">
                                    <div>{ussdScreenText}</div>
                                    <div className="pt-3 border-t border-emerald-800/60 mt-3 flex gap-2">
                                        <input type="text" value={ussdInput} onChange={(e) => setUssdInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleUssdSend()} placeholder="Reply..." className="flex-1 bg-slate-950/80 border border-emerald-600/50 rounded px-2 py-1 text-white focus:outline-none" />
                                        <button onClick={handleUssdSend} className="px-3 py-1 rounded bg-emerald-500 text-slate-950 font-bold">Send</button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                                    <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> Amazon SNS Log
                                </h4>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {snsLogs.map((log) => (
                                        <div key={log.log_id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                                            <div className="flex justify-between text-emerald-400 font-mono mb-0.5">
                                                <span>{log.phone_number}</span>
                                                <span>{log.sent_at}</span>
                                            </div>
                                            <p className="text-slate-300">{log.message}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'marshal' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {departments.map((dept) => {
                            const deptTickets = tickets.filter(t => t.dept_id === dept.dept_id);
                            const serving = deptTickets.find(t => t.status === 'SERVING');
                            const waiting = deptTickets.filter(t => t.status === 'WAITING');

                            return (
                                <div key={dept.dept_id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
                                    <div>
                                        <h3 className="font-bold text-white text-base mb-1">{dept.dept_name}</h3>
                                        <p className="text-xs text-slate-400 mb-3">Active Counters: {dept.active_counters}</p>

                                        <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 mb-3">
                                            <span className="text-[11px] uppercase text-slate-400 block mb-1">Currently Called Patient</span>
                                            {serving ? (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono font-bold text-emerald-400 text-base">
                                                            {serving.ticket_number} — {serving.patient_name}
                                                        </span>
                                                        <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                                                            {serving.priority}
                                                        </span>
                                                    </div>
                                                    {dept.dept_id !== 1 && (
                                                        <button onClick={() => handleTransferTicket(serving.ticket_id, 1)} className="self-start px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-1">
                                                            Transfer to Pharmacy <ArrowRight className="w-3 h-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-500 italic">Counter idle - click below to call next</span>
                                            )}
                                        </div>

                                        <div className="space-y-1.5 mb-4 max-h-48 overflow-y-auto">
                                            <span className="text-[11px] uppercase text-slate-400 block">Waiting Queue ({waiting.length})</span>
                                            {waiting.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic py-1">No patients waiting in queue</p>
                                            ) : (
                                                waiting.map(t => (
                                                    <div key={t.ticket_id} className="flex justify-between items-center text-xs px-3 py-2 rounded bg-slate-950/60 border border-slate-800/80">
                                                        <span className="font-mono text-white">
                                                            <strong className="text-emerald-400">{t.ticket_number}</strong> • <span className="font-semibold">{t.patient_name}</span>
                                                        </span>
                                                        <span className="text-slate-400 bg-slate-900 px-2 py-0.5 rounded">{t.priority}</span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleCallNext(dept.dept_id)}
                                        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
                                    >
                                        <Megaphone className="w-4 h-4" /> Call Next Patient in {dept.dept_name} <ArrowRight className="w-4 h-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}