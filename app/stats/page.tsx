/* eslint-disable @next/next/no-html-link-for-pages */
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

type Counters = { periodType:string; period:string; events:Record<string,number>; sources:Record<string,number> };
type DashboardData = { day:Counters; month:Counters; total:Counters };

const raggioConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hubConfig = {
  projectId: "bike4city-social-hub",
  appId: "1:1040753382248:web:3b632b6ba413b61ec8fcdd",
  apiKey: "AIzaSyDGFlcFie1odRVolXaAKnV_sAwHjNvE2WI",
  authDomain: "bike4city-social-hub.firebaseapp.com",
};

const eventLabels:Record<string,string> = {
  app_open:"Aperture", diagnosis_started:"Diagnosi avviate", diagnosis_completed:"Diagnosi completate",
  photo_used:"Foto utilizzate", workshop_recommended:"Inviti in ciclofficina", whatsapp_clicked:"Clic WhatsApp",
};
const sourceLabels:Record<string,string> = {
  direct:"Accesso diretto", sito:"Sito", card:"Card", locandina:"Locandina", gazebo:"Gazebo",
  facebook:"Facebook", whatsapp:"WhatsApp", altro:"Altro",
};

function appByName(name:string, config:Parameters<typeof initializeApp>[0]):FirebaseApp {
  return getApps().find((app) => app.name === name) ?? initializeApp(config,name);
}

function MetricGrid({ counters }:{ counters:Record<string,number> }) {
  return <div className="stats-grid">{Object.entries(eventLabels).map(([key,label]) =>
    <article className="stat-card" key={key}><span>{label}</span><strong>{counters[key] ?? 0}</strong></article>
  )}</div>;
}

export default function StatsPage() {
  const hubApp = useMemo(() => appByName("bike4citySocialHubClient",hubConfig),[]);
  const raggioApp = useMemo(() => getApps().find((app) => app.name === "[DEFAULT]") ?? initializeApp(raggioConfig),[]);
  const auth = useMemo(() => getAuth(hubApp),[hubApp]);
  const [user,setUser] = useState<User|null>(null);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [data,setData] = useState<DashboardData|null>(null);
  const [period,setPeriod] = useState<keyof DashboardData>("day");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  useEffect(() => onAuthStateChanged(auth,(current) => { setUser(current); setLoading(Boolean(current)); setError(""); }),[auth]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    void user.getIdToken(true).then(async (hubIdToken) => {
      const call = httpsCallable<{hubIdToken:string},DashboardData>(getFunctions(raggioApp,"europe-west1"),"getRaggioAnalytics");
      const result = await call({hubIdToken});
      if (active) setData(result.data);
    }).catch(() => { if (active) setError("Accesso negato. Verifica che questo account abbia ruolo admin o superadmin nel Social Hub."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[user,raggioApp]);

  async function login(event:FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await signInWithEmailAndPassword(auth,email.trim(),password); setPassword(""); }
    catch { setError("Email o password non riconosciute."); setLoading(false); }
  }

  if (!user) return <main className="stats-page"><section className="stats-login">
    <a href="/">&larr; Torna a Raggiò</a><p className="stats-kicker">Area riservata Bike4City</p>
    <h1>Statistiche di Raggiò</h1><p>Accedi con le stesse credenziali amministrative del Social Hub.</p>
    <form onSubmit={login}><label>Email<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required autoComplete="username" /></label>
    <label>Password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required autoComplete="current-password" /></label>
    <button disabled={loading}>{loading ? "Accesso..." : "Accedi"}</button></form>{error && <p className="stats-error">{error}</p>}
  </section></main>;

  const selected = data?.[period];
  return <main className="stats-page"><section className="stats-dashboard">
    <header><div><p className="stats-kicker">Area riservata Bike4City</p><h1>Statistiche di Raggiò</h1><p>Solo contatori aggregati, senza profili individuali.</p></div>
    <button className="stats-logout" onClick={()=>void signOut(auth)}>Esci</button></header>
    <nav className="stats-tabs" aria-label="Periodo">
      <button className={period === "day" ? "active" : ""} onClick={()=>setPeriod("day")}>Oggi</button>
      <button className={period === "month" ? "active" : ""} onClick={()=>setPeriod("month")}>Questo mese</button>
      <button className={period === "total" ? "active" : ""} onClick={()=>setPeriod("total")}>Totale</button>
    </nav>
    {loading && <p>Caricamento statistiche...</p>}{error && <p className="stats-error">{error}</p>}
    {selected && <><MetricGrid counters={selected.events}/><section className="sources-panel"><h2>Provenienza delle aperture</h2>
      <div className="source-list">{Object.entries(sourceLabels).map(([key,label]) => <div key={key}><span>{label}</span><strong>{selected.sources[key] ?? 0}</strong></div>)}</div>
    </section></>}
  </section></main>;
}