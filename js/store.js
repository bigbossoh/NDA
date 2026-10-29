// Couche de données : Firebase (production) ou localStorage (mode démo).
import { firebaseConfig } from "./firebase-config.js";

export const MODE =
  firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("VOTRE") ? "firebase" : "demo";
export const REF_PREFIX = "N° EC-DGB-PNDA-AP-2026_2027/";
export const ONLINE_WINDOW_MS = 75_000;
const HEARTBEAT_MS = 30_000;
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

export const formatNumero = (seq) => "FS" + String(seq).padStart(6, "0");

function sessionId() {
  let id = sessionStorage.getItem("nda_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("nda_sid", id);
  }
  return id;
}

/* ------------------------------------------------------------------ */
/* Firebase                                                            */
/* ------------------------------------------------------------------ */

let fbPromise = null;
function firebase() {
  if (!fbPromise) {
    fbPromise = Promise.all([
      import(SDK + "firebase-app.js"),
      import(SDK + "firebase-firestore.js"),
      import(SDK + "firebase-auth.js"),
    ]).then(([appMod, fs, auth]) => {
      const app = appMod.initializeApp(firebaseConfig);
      return { fs, auth, db: fs.getFirestore(app), au: auth.getAuth(app) };
    });
  }
  return fbPromise;
}

const firebaseStore = {
  async submit(data) {
    const { fs, db } = await firebase();
    return fs.runTransaction(db, async (tx) => {
      const counterRef = fs.doc(db, "meta", "compteur");
      const snap = await tx.get(counterRef);
      const seq = (snap.exists() ? snap.data().count : 0) + 1;
      const numero = formatNumero(seq);
      tx.set(counterRef, { count: seq });
      tx.set(fs.doc(db, "souscriptions", numero), {
        ...data,
        seq,
        numero,
        createdAt: fs.serverTimestamp(),
      });
      return numero;
    });
  },

  async trackPresence(page) {
    const { fs, db } = await firebase();
    if (!sessionStorage.getItem("nda_visited")) {
      sessionStorage.setItem("nda_visited", "1");
      fs.setDoc(fs.doc(db, "meta", "visites"), { total: fs.increment(1) }, { merge: true }).catch(() => {});
    }
    const ref = fs.doc(db, "presence", sessionId());
    const beat = () => fs.setDoc(ref, { lastSeen: fs.serverTimestamp(), page }).catch(() => {});
    beat();
    setInterval(() => document.visibilityState === "visible" && beat(), HEARTBEAT_MS);
  },

  async login(email, password) {
    const { auth, au } = await firebase();
    await auth.signInWithEmailAndPassword(au, email, password);
  },

  async logout() {
    const { auth, au } = await firebase();
    await auth.signOut(au);
  },

  async onAuth(cb) {
    const { auth, au, fs, db } = await firebase();
    return auth.onAuthStateChanged(au, async (user) => {
      if (!user) return cb(null, false);
      const adminDoc = await fs.getDoc(fs.doc(db, "admins", user.uid)).catch(() => null);
      cb(user, !!adminDoc?.exists());
    });
  },

  async watchSouscriptions(cb, onError) {
    const { fs, db } = await firebase();
    const q = fs.query(fs.collection(db, "souscriptions"), fs.orderBy("seq", "desc"));
    return fs.onSnapshot(
      q,
      (snap) =>
        cb(
          snap.docs.map((d) => {
            const x = d.data();
            return { ...x, id: d.id, createdAt: x.createdAt?.toDate?.() ?? new Date() };
          })
        ),
      onError
    );
  },

  async presenceStats() {
    const { fs, db } = await firebase();
    const since = fs.Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
    const [online, visites] = await Promise.all([
      fs.getCountFromServer(fs.query(fs.collection(db, "presence"), fs.where("lastSeen", ">", since))),
      fs.getDoc(fs.doc(db, "meta", "visites")),
    ]);
    return { online: online.data().count, visites: visites.exists() ? visites.data().total : 0 };
  },

  // Supprime les sessions inactives depuis plus de 24 h pour garder la collection légère.
  async cleanupPresence() {
    const { fs, db } = await firebase();
    const old = fs.Timestamp.fromMillis(Date.now() - 86_400_000);
    const snap = await fs.getDocs(
      fs.query(fs.collection(db, "presence"), fs.where("lastSeen", "<", old), fs.limit(200))
    );
    await Promise.all(snap.docs.map((d) => fs.deleteDoc(d.ref)));
  },

  async remove(id) {
    const { fs, db } = await firebase();
    await fs.deleteDoc(fs.doc(db, "souscriptions", id));
  },
};

/* ------------------------------------------------------------------ */
/* Mode démo (localStorage)                                            */
/* ------------------------------------------------------------------ */

const LS = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event("nda-demo-change"));
  },
};

const demoStore = {
  async submit(data) {
    const seq = LS.get("nda_compteur", 0) + 1;
    const numero = formatNumero(seq);
    const list = LS.get("nda_souscriptions", []);
    list.push({ ...data, seq, numero, id: numero, createdAt: new Date().toISOString() });
    localStorage.setItem("nda_compteur", JSON.stringify(seq));
    LS.set("nda_souscriptions", list);
    return numero;
  },

  async trackPresence(page) {
    if (!sessionStorage.getItem("nda_visited")) {
      sessionStorage.setItem("nda_visited", "1");
      localStorage.setItem("nda_visites", String(LS.get("nda_visites", 0) + 1));
    }
    const beat = () => {
      const p = LS.get("nda_presence", {});
      p[sessionId()] = { lastSeen: Date.now(), page };
      localStorage.setItem("nda_presence", JSON.stringify(p));
    };
    beat();
    setInterval(beat, HEARTBEAT_MS);
  },

  async login(email, password) {
    if (password !== "admin") throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
    sessionStorage.setItem("nda_admin", email || "admin");
    window.dispatchEvent(new Event("nda-auth"));
  },

  async logout() {
    sessionStorage.removeItem("nda_admin");
    window.dispatchEvent(new Event("nda-auth"));
  },

  async onAuth(cb) {
    const emit = () => {
      const email = sessionStorage.getItem("nda_admin");
      cb(email ? { email } : null, !!email);
    };
    window.addEventListener("nda-auth", emit);
    emit();
    return () => window.removeEventListener("nda-auth", emit);
  },

  async watchSouscriptions(cb) {
    const emit = () =>
      cb(
        LS.get("nda_souscriptions", [])
          .map((x) => ({ ...x, createdAt: new Date(x.createdAt) }))
          .sort((a, b) => b.seq - a.seq)
      );
    const onStorage = (e) => (!e.key || e.key === "nda_souscriptions") && emit();
    window.addEventListener("nda-demo-change", emit);
    window.addEventListener("storage", onStorage);
    emit();
    return () => {
      window.removeEventListener("nda-demo-change", emit);
      window.removeEventListener("storage", onStorage);
    };
  },

  async presenceStats() {
    const now = Date.now();
    const online = Object.values(LS.get("nda_presence", {})).filter(
      (p) => now - p.lastSeen < ONLINE_WINDOW_MS
    ).length;
    return { online, visites: LS.get("nda_visites", 0) };
  },

  async cleanupPresence() {},

  async remove(id) {
    LS.set("nda_souscriptions", LS.get("nda_souscriptions", []).filter((x) => x.id !== id));
  },
};

export const store = MODE === "firebase" ? firebaseStore : demoStore;
