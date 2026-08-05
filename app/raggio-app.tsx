"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

type Role = "USER" | "ASSISTANT";
type Message = { id: string; role: Role; text: string; safety?: "SAFE" | "CAUTION" | "STOP" };
type ResponseData = { assistantMessage:string; safetyLevel:"SAFE"|"CAUTION"|"STOP"; outcome:"UNDETERMINED"|"GREEN"|"YELLOW"|"RED"; category:string; quickReplies:string[]; conversationCompleted:boolean };

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const configured = Object.values(firebaseConfig).every(Boolean);
const welcome: Message = { id:"welcome", role:"ASSISTANT", text:"Ciao! Sono Raggiò 🚲\nDimmi qual è il problema con la tua bici e ti aiuto subito!" };

function newId() { return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export function RaggioApp() {
  const [messages,setMessages] = useState<Message[]>([welcome]);
  const [quickReplies,setQuickReplies] = useState(["Sento un rumore","La bici frena male","Ho una gomma sgonfia"]);
  const [category,setCategory] = useState<string|null>(null);
  const [sessionId,setSessionId] = useState(newId);
  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);
  const [showWorkshopContact,setShowWorkshopContact] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const isEmbed = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1",[]);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  function resetChat() {
    setMessages([welcome]); setQuickReplies(["Sento un rumore","La bici frena male","Ho una gomma sgonfia"]);
    setCategory(null); setSessionId(newId()); setInput(""); setShowWorkshopContact(false);
  }

  async function send(text:string) {
    const clean = text.trim().slice(0,1000);
    if (!clean || loading) return;
    const previous = messages.filter((message) => message.id !== "welcome").slice(-20);
    setMessages((current) => [...current,{id:newId(),role:"USER",text:clean}]);
    setQuickReplies([]); setInput(""); setLoading(true);

    if (!configured) {
      setTimeout(() => {
        setMessages((current) => [...current,{id:newId(),role:"ASSISTANT",safety:"CAUTION",text:"La chat è pronta, ma il collegamento al servizio deve ancora essere configurato per questo dominio."}]);
        setLoading(false);
      },450);
      return;
    }
    try {
      const app = getApps()[0] ?? initializeApp(firebaseConfig);
      const auth = getAuth(app);
      if (!auth.currentUser) await signInAnonymously(auth);
      const call = httpsCallable(getFunctions(app,"europe-west1"),"bikeMechanicChat");
      const result = await call({ sessionId,message:clean,category,messageCount:previous.filter((m)=>m.role==="USER").length,imagePath:null,history:previous.map((m)=>({role:m.role,text:m.text})) });
      const data = result.data as ResponseData;
      setMessages((current) => [...current,{id:newId(),role:"ASSISTANT",text:data.assistantMessage,safety:data.safetyLevel}]);
      setQuickReplies(data.conversationCompleted ? [] : data.quickReplies ?? []);
      setCategory(data.category);
      setShowWorkshopContact(data.conversationCompleted && (data.outcome === "YELLOW" || data.outcome === "RED"));
    } catch {
      setMessages((current) => [...current,{id:newId(),role:"ASSISTANT",safety:"CAUTION",text:"Il servizio è temporaneamente non disponibile. Nessuna diagnosi è stata prodotta: attendi qualche secondo e riprova."}]);
    } finally { setLoading(false); }
  }

  function submit(event:FormEvent) { event.preventDefault(); void send(input); }
  function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }

  return <main className={`site-shell${isEmbed ? " embed" : ""}`}>
    <header className="topbar"><div className="brand"><span className="brand-mark">R</span><span>RAGGIÒ</span></div><div className="status-pill"><span className="status-dot"/> Assistente online</div></header>
    <section className="hero">
      <div className="hero-copy">
        <img className="raggio-logo" src="/raggio_logo.png" alt="Raggiò, il ciclomeccanico virtuale"/>
        <div className="eyebrow">L’assistente della ciclofficina</div>
        <h1>Come possiamo<br/>aiutarti?</h1>
        <p className="lead">Descrivi il problema: Raggiò ti farà domande semplici e ti proporrà un controllo alla volta, proprio come nell’app Android.</p>
        <div className="trust-row"><div className="trust-item"><span className="trust-icon">✓</span> Guida passo passo</div><div className="trust-item"><span className="trust-icon">!</span> Priorità alla sicurezza</div><div className="trust-item"><span className="trust-icon">◌</span> Nessun account richiesto</div></div>
        <p className="safety-note"><strong>Prima la sicurezza.</strong> Raggiò non sostituisce un meccanico. In presenza di problemi a freni, ruote, sterzo, telaio, forcella o batteria, non utilizzare la bicicletta.</p>
      </div>
      <section className="chat-card" aria-label="Chat con Raggiò">
        <div className="chat-head"><div className="chat-identity"><img className="chat-logo" src="/raggio_logo.png" alt=""/><div><div className="chat-title">Diagnosi guidata</div><div className="chat-subtitle">Raggiò · assistente online</div></div></div><button className="new-chat" type="button" onClick={resetChat} aria-label="Inizia una nuova conversazione">Nuova diagnosi</button></div>
        {!configured && <div className="setup-warning">Anteprima: il collegamento Firebase sarà attivato prima della pubblicazione.</div>}
        <div className="messages" aria-live="polite">
          {messages.map((message) => <div key={message.id} className={`message ${message.role === "USER" ? "user" : "assistant"}${message.safety === "STOP" ? " stop" : ""}`}><div className="message-label">{message.role === "USER" ? "Tu" : message.safety === "STOP" ? "Fermati" : "RAGGIÒ"}</div>{message.text}</div>)}
          {!loading && quickReplies.length > 0 && <div className="quick-replies">{quickReplies.map((reply) => <button type="button" className="quick-reply" key={reply} onClick={() => void send(reply)}>{reply}</button>)}</div>}
          {loading && <div className="typing" aria-label="Raggiò sta scrivendo"><span/><span/><span/></div>}<div ref={endRef}/>
          {showWorkshopContact && <aside className="workshop-contact" aria-label="Contatta la ciclofficina">
            <strong>Ti consigliamo di passare in ciclofficina.</strong>
            <span>Scrivici subito su WhatsApp per concordare un controllo della bici.</span>
            <a href="https://wa.me/393516849832?text=Ciao%2C%20ho%20appena%20completato%20una%20diagnosi%20con%20Raggi%C3%B2%20e%20vorrei%20far%20controllare%20la%20mia%20bici." target="_blank" rel="noreferrer">Contatta su WhatsApp</a>
          </aside>}
        </div>
        <form className="composer-wrap" onSubmit={submit}><div className="composer"><textarea value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={onKeyDown} maxLength={1000} rows={1} placeholder="Descrivi il problema della tua bici…" aria-label="Messaggio per RAGGIO" disabled={loading}/><button className="send" type="submit" disabled={!input.trim()||loading} aria-label="Invia messaggio">↑</button></div><div className="privacy-line">Non inserire dati personali. Le risposte possono contenere errori.</div></form>
      </section>
    </section>
    <section className="details"><div className="details-inner"><div><h2>La stessa Raggiò,<br/>anche sul web.</h2><div className="partner-logos"><img src="/logo_incontropedale.png" alt="Ciclofficina InControPedale"/><img src="/logo_bike4city.png" alt="Bike4City Roma"/></div></div><div className="steps"><article className="step"><div className="step-num">01</div><h3>Racconta</h3><p>Spiega con parole tue il rumore, il comportamento o il componente che ti preoccupa.</p></article><article className="step"><div className="step-num">02</div><h3>Controlla</h3><p>Segui soltanto verifiche semplici e sicure, guidate una alla volta.</p></article><article className="step"><div className="step-num">03</div><h3>Decidi</h3><p>Ricevi un riepilogo prudente e capisci se rivolgerti alla ciclofficina.</p></article></div></div></section>
  </main>;
}
