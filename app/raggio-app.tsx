"use client";

import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { deleteObject, getStorage, ref, uploadBytes } from "firebase/storage";

type Role = "USER" | "ASSISTANT";
type Instruction = { title:string; body:string; warnings:string[] };
type Message = { id: string; role: Role; text: string; safety?: "SAFE" | "CAUTION" | "STOP"; instruction?: Instruction | null };
type ResponseData = { assistantMessage:string; messageType:"QUESTION"|"INSTRUCTION"|"WARNING"|"SUMMARY"; safetyLevel:"SAFE"|"CAUTION"|"STOP"; outcome:"UNDETERMINED"|"GREEN"|"YELLOW"|"RED"; category:string; quickReplies:string[]; instruction:Instruction|null; conversationCompleted:boolean };
type PreparedPhoto = { blob:Blob; previewUrl:string; width:number; height:number };

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
  const [pendingPhoto,setPendingPhoto] = useState<PreparedPhoto|null>(null);
  const [selectedPhoto,setSelectedPhoto] = useState<PreparedPhoto|null>(null);
  const [photoError,setPhotoError] = useState<string|null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEmbed = useMemo(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "1",[]);

  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth"}); },[messages,loading]);

  function resetChat() {
    setMessages([welcome]); setQuickReplies(["Sento un rumore","La bici frena male","Ho una gomma sgonfia"]);
    setCategory(null); setSessionId(newId()); setInput(""); setShowWorkshopContact(false); clearPhotos();
  }

  function clearPhotos() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    if (selectedPhoto) URL.revokeObjectURL(selectedPhoto.previewUrl);
    setPendingPhoto(null); setSelectedPhoto(null); setPhotoError(null);
  }

  function removeSelectedPhoto() {
    if (selectedPhoto) URL.revokeObjectURL(selectedPhoto.previewUrl);
    setSelectedPhoto(null); setPhotoError(null);
  }

  function cancelPendingPhoto() {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  }

  function confirmPendingPhoto() {
    if (!pendingPhoto) return;
    if (selectedPhoto) URL.revokeObjectURL(selectedPhoto.previewUrl);
    setSelectedPhoto(pendingPhoto);
    setPendingPhoto(null);
  }

  async function choosePhoto(event:ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoError(null);
    try {
      if (!file.type.startsWith("image/") || file.size > 20_000_000) throw new Error("Scegli un'immagine valida non superiore a 20 MB.");
      const prepared = await sanitizePhoto(file);
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
      setPendingPhoto(prepared);
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : "Non è stato possibile preparare la foto.");
    }
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
      let imageRef:ReturnType<typeof ref>|null = null;
      if (selectedPhoto) {
        const path = `ciclofficinaBotUsers/${auth.currentUser!.uid}/sessions/${sessionId}/photos/${newId()}.jpg`;
        imageRef = ref(getStorage(app),path);
        await uploadBytes(imageRef,selectedPhoto.blob,{
          contentType:"image/jpeg",
          customMetadata:{ expiresAtEpochMs:String(Date.now()+7*24*60*60*1000),width:String(selectedPhoto.width),height:String(selectedPhoto.height) },
        });
      }
      const call = httpsCallable(getFunctions(app,"europe-west1"),"bikeMechanicChat");
      let result;
      try {
        result = await call({ sessionId,message:clean,category,messageCount:previous.filter((m)=>m.role==="USER").length,imagePath:imageRef?.fullPath??null,history:previous.map((m)=>({role:m.role,text:m.text})) });
      } catch (error) {
        if (imageRef) await deleteObject(imageRef).catch(()=>undefined);
        throw error;
      }
      const data = result.data as ResponseData;
      setMessages((current) => [...current,{id:newId(),role:"ASSISTANT",text:data.assistantMessage,safety:data.safetyLevel,instruction:data.instruction}]);
      setQuickReplies(data.conversationCompleted ? [] : data.quickReplies ?? []);
      setCategory(data.category);
      setShowWorkshopContact(data.conversationCompleted && (data.outcome === "YELLOW" || data.outcome === "RED"));
      removeSelectedPhoto();
    } catch {
      setMessages((current) => [...current,{id:newId(),role:"ASSISTANT",safety:"CAUTION",text:"Il servizio è temporaneamente non disponibile. Nessuna diagnosi è stata prodotta: attendi qualche secondo e riprova."}]);
    } finally { setLoading(false); }
  }

  function submit(event:FormEvent) { event.preventDefault(); void send(input); }
  function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(input); } }

  return <main className={`site-shell${isEmbed ? " embed" : ""}`}>
    {pendingPhoto && <div className="photo-consent-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)cancelPendingPhoto();}}>
      <section className="photo-consent" role="dialog" aria-modal="true" aria-labelledby="photo-consent-title">
        <h2 id="photo-consent-title">Usare questa foto?</h2>
        <img src={pendingPhoto.previewUrl} alt="Anteprima della foto selezionata"/>
        <p>RAGGIÒ ha già rimosso i metadati e ridimensionato l’immagine. Confermandola, la foto verrà inviata a Firebase e OpenAI soltanto per questa diagnosi.</p>
        <p>La copia remota sarà eliminata automaticamente entro 7 giorni. Non usare foto con persone, targhe, documenti o altri dati personali.</p>
        <div className="consent-actions"><button type="button" onClick={cancelPendingPhoto}>Annulla</button><button type="button" className="confirm-photo" onClick={confirmPendingPhoto}>Accetto e allego</button></div>
      </section>
    </div>}
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
          {messages.map((message) => <div key={message.id} className={`message-group ${message.role === "USER" ? "user" : "assistant"}`}><div className={`message ${message.role === "USER" ? "user" : "assistant"}${message.safety === "STOP" ? " stop" : ""}`}><div className="message-label">{message.role === "USER" ? "Tu" : message.safety === "STOP" ? "Fermati" : "RAGGIÒ"}</div>{message.text}</div>{message.instruction && <section className="instruction-card" aria-label={message.instruction.title}><h3>{message.instruction.title}</h3><div className="instruction-body">{message.instruction.body.split(/\n+/).filter(Boolean).map((line,index)=><p key={`${message.id}-step-${index}`}><span>{index+1}</span>{line.replace(/^\s*(?:\d+[.)]|[-•])\s*/,"")}</p>)}</div>{message.instruction.warnings.length > 0 && <div className="instruction-warnings"><strong>Attenzione</strong>{message.instruction.warnings.map((warning,index)=><p key={`${message.id}-warning-${index}`}>{warning}</p>)}</div>}</section>}</div>)}
          {!loading && quickReplies.length > 0 && <div className="quick-replies">{quickReplies.map((reply) => <button type="button" className="quick-reply" key={reply} onClick={() => void send(reply)}>{reply}</button>)}</div>}
          {loading && <div className="typing" aria-label="Raggiò sta scrivendo"><span/><span/><span/></div>}<div ref={endRef}/>
          {showWorkshopContact && <aside className="workshop-contact" aria-label="Contatta la ciclofficina">
            <strong>Ti consigliamo di passare in ciclofficina.</strong>
            <span>Scrivici subito su WhatsApp per concordare un controllo della bici.</span>
            <a href="https://wa.me/393516849832?text=Ciao%2C%20ho%20appena%20completato%20una%20diagnosi%20con%20Raggi%C3%B2%20e%20vorrei%20far%20controllare%20la%20mia%20bici." target="_blank" rel="noreferrer">Contatta su WhatsApp</a>
          </aside>}
        </div>
        <form className="composer-wrap" onSubmit={submit}>
          {selectedPhoto && <div className="selected-photo"><img src={selectedPhoto.previewUrl} alt="Foto pronta per la diagnosi"/><div><strong>Foto pronta</strong><span>Metadati rimossi · eliminazione entro 7 giorni</span></div><button type="button" onClick={removeSelectedPhoto} aria-label="Rimuovi la foto">Rimuovi</button></div>}
          {photoError && <div className="photo-error" role="alert">{photoError}</div>}
          <div className="composer"><textarea value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={onKeyDown} maxLength={1000} rows={1} placeholder="Descrivi il problema della tua bici…" aria-label="Messaggio per RAGGIO" disabled={loading}/><button className="send" type="submit" disabled={!input.trim()||loading} aria-label="Invia messaggio">↑</button></div>
          <div className="composer-actions"><input ref={fileInputRef} type="file" accept="image/*" onChange={choosePhoto} hidden/><button type="button" className="attach-photo" onClick={()=>fileInputRef.current?.click()} disabled={loading}>＋ Aggiungi una foto</button><span>Non inserire dati personali.</span></div>
          <div className="privacy-line">Le risposte possono contenere errori.</div>
        </form>
      </section>
    </section>
    <section className="details"><div className="details-inner"><div className="partner-logos"><img src="/logo_incontropedale.png" alt="Ciclofficina InControPedale"/><img src="/logo_bike4city.png" alt="Bike4City Roma"/></div><div className="steps"><article className="step"><div className="step-num">01</div><h3>Racconta</h3><p>Spiega con parole tue il rumore, il comportamento o il componente che ti preoccupa.</p></article><article className="step"><div className="step-num">02</div><h3>Controlla</h3><p>Segui soltanto verifiche semplici e sicure, guidate una alla volta.</p></article><article className="step"><div className="step-num">03</div><h3>Decidi</h3><p>Ricevi un riepilogo prudente e capisci se rivolgerti alla ciclofficina.</p></article></div></div></section>
  </main>;
}

async function sanitizePhoto(file:File):Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file,{imageOrientation:"from-image"});
  const scale = Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
  const width = Math.max(1,Math.round(bitmap.width*scale));
  const height = Math.max(1,Math.round(bitmap.height*scale));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d",{alpha:false});
  if (!context) { bitmap.close(); throw new Error("Il browser non può elaborare questa foto."); }
  context.drawImage(bitmap,0,0,width,height); bitmap.close();
  let quality = .86;
  let blob:Blob;
  do {
    blob = await canvasToJpeg(canvas,quality);
    quality -= .08;
  } while (blob.size>1_250_000 && quality>=.46);
  if (blob.size>1_250_000) throw new Error("La foto resta troppo grande anche dopo la compressione.");
  return {blob,previewUrl:URL.createObjectURL(blob),width,height};
}

function canvasToJpeg(canvas:HTMLCanvasElement,quality:number):Promise<Blob> {
  return new Promise((resolve,reject)=>canvas.toBlob((blob)=>blob?resolve(blob):reject(new Error("Conversione della foto non riuscita.")),"image/jpeg",quality));
}
