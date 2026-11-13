/* Plataforma Parentes · conexión con Firebase: inicio de sesión, perfil de la persona e invitaciones.
   Se carga como módulo. La plataforma (index.html) espera a que esta pantalla de entrada termine antes de arrancar. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink,
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionGroup, onSnapshot, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CFG = window.FIREBASE_CONFIG;

if (CFG && window.PPAuth) {
  const app = initializeApp(CFG);
  const auth = getAuth(app);
  auth.languageCode = "es";
  let db;
  try {
    // La copia local reduce las lecturas (y por tanto el consumo del plan gratuito)
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) {
    db = getFirestore(app);
  }
  const fs = { doc, collection, collectionGroup, setDoc, updateDoc, deleteDoc, onSnapshot, writeBatch, getDocs, getDoc };
  const EMAIL_KEY = "pp_email_for_signin";
  let started = false;

  /* ---------- pantalla de entrada ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #pp-login{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:var(--bg,#f4f5f2);font-family:var(--f-body,system-ui,sans-serif);color:var(--fg,#1c2126)}
  #pp-login[hidden]{display:none}
  #pp-login .pp-card{width:min(420px,100%);background:var(--panel,#fff);border:1px solid var(--line,#d9dcd4);border-radius:12px;padding:28px;box-shadow:var(--shadow,0 8px 24px rgba(0,0,0,.08));display:grid;gap:14px}
  #pp-login h1{margin:0;font-size:24px;font-family:var(--f-display,inherit)}
  #pp-login .pp-sub{margin:0;color:var(--fg-3,#6b737b);font-size:14px}
  #pp-login .pp-btn{border:1px solid var(--accent,#20587c);background:var(--accent,#20587c);color:var(--accent-fg,#fff);border-radius:8px;padding:11px 14px;font:inherit;font-weight:600;cursor:pointer}
  #pp-login .pp-btn.pp-sec{background:transparent;color:var(--accent,#20587c)}
  #pp-login .pp-btn:disabled{opacity:.55;cursor:default}
  #pp-login .pp-or{text-align:center;color:var(--fg-3,#6b737b);font-size:13px}
  #pp-login label{display:grid;gap:4px;font-size:13px;color:var(--fg-2,#4a525b)}
  #pp-login input{font:inherit;padding:10px 12px;border:1px solid var(--line-2,#c6cabf);border-radius:8px;background:var(--panel,#fff);color:inherit}
  #pp-login .pp-msg{min-height:20px;margin:0;font-size:14px}
  #pp-login .pp-msg.err{color:var(--bad,#b23a3a)} #pp-login .pp-msg.ok{color:var(--ok,#2f7a4b)}
  #pp-login .pp-foot{margin:0;font-size:12px;color:var(--fg-3,#6b737b)}
  #pp-userchip{display:flex;align-items:center;gap:8px;font-size:13px}
  #pp-userchip button{font:inherit;font-size:12px;padding:3px 8px;border:1px solid var(--line-2,#c6cabf);border-radius:6px;background:transparent;color:inherit;cursor:pointer}
  `;
  document.head.appendChild(css);

  const box = document.createElement("div");
  box.id = "pp-login";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Entrar en la Plataforma Parentes");
  document.body.appendChild(box);

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = (txt, kind) => { const m = box.querySelector(".pp-msg"); if (m) { m.textContent = txt || ""; m.className = "pp-msg" + (kind ? " " + kind : ""); } };
  const errText = e => {
    const c = e && e.code || "";
    if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return "";
    if (c === "auth/unauthorized-domain") return "Esta dirección web no está autorizada en Firebase. Avisa a quien administra la plataforma.";
    if (c === "auth/invalid-email") return "Ese correo no parece válido.";
    if (c === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
    if (c === "auth/network-request-failed") return "No hay conexión. Comprueba internet y vuelve a probar.";
    if (c === "auth/invalid-action-code" || c === "auth/expired-action-code") return "El enlace ya no es válido (caduca o solo sirve una vez). Pide uno nuevo.";
    return "No se pudo entrar" + (c ? " (" + c + ")" : "") + ". Vuelve a probar.";
  };

  function showLogin(note, noteKind) {
    box.hidden = false;
    box.innerHTML = `<div class="pp-card">
      <h1>Plataforma Parentes</h1>
      <p class="pp-sub">Planes de acción y de contenido de los colegios de la red.</p>
      <button class="pp-btn" id="pp-google" type="button">Entrar con Google</button>
      <div class="pp-or">o con tu correo</div>
      <label>Tu correo<input id="pp-email" type="email" autocomplete="email" placeholder="nombre@colegio.org"></label>
      <button class="pp-btn pp-sec" id="pp-link" type="button">Enviarme un enlace para entrar</button>
      <p class="pp-msg" role="status"></p>
      <p class="pp-foot">Solo pueden entrar las personas invitadas por Fundación Parentes o por el responsable de su colegio.</p></div>`;
    if (note) say(note, noteKind);
    const em = box.querySelector("#pp-email");
    const saved = localStorage.getItem(EMAIL_KEY); if (saved) em.value = saved;
    box.querySelector("#pp-google").onclick = async () => {
      say("");
      try { await signInWithPopup(auth, new GoogleAuthProvider()); }
      catch (e) {
        if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) {
          try { await signInWithRedirect(auth, new GoogleAuthProvider()); return; } catch (e2) { e = e2; }
        }
        const t = errText(e); if (t) say(t, "err");
      }
    };
    box.querySelector("#pp-link").onclick = async () => {
      const email = em.value.trim().toLowerCase();
      if (!email || !email.includes("@")) { say("Escribe tu correo.", "err"); em.focus(); return; }
      const btn = box.querySelector("#pp-link"); btn.disabled = true; say("Enviando…");
      try {
        await sendSignInLinkToEmail(auth, email, { url: location.origin + location.pathname, handleCodeInApp: true });
        localStorage.setItem(EMAIL_KEY, email);
        say("Te hemos enviado un enlace a " + email + ". Ábrelo en este mismo dispositivo. Si no llega, mira en el correo no deseado.", "ok");
      } catch (e) { const t = errText(e); if (t) say(t, "err"); }
      btn.disabled = false;
    };
    em.addEventListener("keydown", e => { if (e.key === "Enter") box.querySelector("#pp-link").click(); });
  }

  function showBlocked(title, text) {
    box.hidden = false;
    box.innerHTML = `<div class="pp-card"><h1>${esc(title)}</h1><p class="pp-sub">${text}</p>
      <button class="pp-btn pp-sec" id="pp-out" type="button">Cerrar sesión</button></div>`;
    box.querySelector("#pp-out").onclick = () => signOut(auth);
  }

  /* ---------- perfil de la persona ---------- */
  async function resolveProfile(user) {
    const email = (user.email || "").toLowerCase();
    let snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      const inv = await getDoc(doc(db, "invites", email));
      if (!inv.exists()) return { pending: true, email };
      const i = inv.data();
      await setDoc(doc(db, "users", user.uid), {
        email, nombre: user.displayName || "", rol: i.rol, schools: Array.isArray(i.schools) ? i.schools : [],
        activo: true, creado: new Date().toISOString()
      });
      snap = await getDoc(doc(db, "users", user.uid));
    }
    const p = snap.data();
    if (p.activo !== true) return { disabled: true };
    return { profile: { uid: user.uid, ...p } };
  }

  function startSession(profile) {
    if (started) return;
    started = true;
    box.hidden = true;
    const api = {
      profile, db, fs, auth,
      signOut: () => signOut(auth),
      async listUsers() { const s = await getDocs(collection(db, "users")); return s.docs.map(d => ({ uid: d.id, ...d.data() })); },
      async listInvites() { const s = await getDocs(collection(db, "invites")); return s.docs.map(d => ({ email: d.id, ...d.data() })); },
      async invite({ email, rol, schools }) {
        const e = String(email || "").trim().toLowerCase();
        if (!e.includes("@")) throw new Error("Correo no válido");
        await setDoc(doc(db, "invites", e), { rol, schools: schools || [], invitadoPor: profile.email, creado: new Date().toISOString() });
        return e;
      },
      deleteInvite: email => deleteDoc(doc(db, "invites", email)),
      setUserActive: (uid, activo) => updateDoc(doc(db, "users", uid), { activo }),
      deleteUser: uid => deleteDoc(doc(db, "users", uid))
    };
    window.PPFB = api;
    window.PPAuth._res({ db, fs, auth, profile, api });
  }

  async function onUser(user) {
    if (!user) { if (started) { location.reload(); return; } showLogin(); return; }
    if (!user.emailVerified) { showBlocked("Correo sin verificar", "Tu correo no está verificado, así que no podemos dejarte entrar."); return; }
    box.hidden = false;
    box.innerHTML = `<div class="pp-card"><h1>Plataforma Parentes</h1><p class="pp-sub">Entrando…</p></div>`;
    try {
      const r = await resolveProfile(user);
      if (r.pending) showBlocked("Tu acceso está pendiente", `Has entrado como <b>${esc(r.email)}</b>, pero todavía no tienes permiso. Pide a tu responsable de colegio o a Fundación Parentes que te invite con este correo.`);
      else if (r.disabled) showBlocked("Cuenta desactivada", "Tu acceso a la plataforma está desactivado. Habla con tu responsable de colegio o con Fundación Parentes.");
      else startSession(r.profile);
    } catch (e) {
      showBlocked("No hemos podido abrir tu acceso", "Ha habido un problema de conexión o de permisos" + (e && e.code ? " (" + esc(e.code) + ")" : "") + ". Recarga la página; si sigue igual, avisa a quien administra la plataforma.");
    }
  }

  /* ---------- arranque ---------- */
  (async () => {
    if (isSignInWithEmailLink(auth, location.href)) {
      let email = localStorage.getItem(EMAIL_KEY);
      if (!email) email = (window.prompt("Para terminar de entrar, escribe el correo al que llegó el enlace:") || "").trim().toLowerCase();
      if (email) {
        try { await signInWithEmailLink(auth, email, location.href); localStorage.removeItem(EMAIL_KEY); history.replaceState({}, "", location.pathname + location.hash); }
        catch (e) { showLogin(errText(e), "err"); }
      }
    }
    onAuthStateChanged(auth, onUser);
  })();
}
