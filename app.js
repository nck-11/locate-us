import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Paste your values from Supabase: Project Settings > API
const SUPABASE_URL = "https://envqwmfjsllyxwujxygv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XF_D8E4Gri9maHVHesEoVQ_u3Y_TjlR";

const SUPABASE_URL = "https://envqwmfjsllyxwujxygv.supabase.co";
const $ = id => document.getElementById(id);

const MIN_WRITE_MS = 2000;        // save at most one position every 2 seconds
const STALE_MS = 10 * 60 * 1000;  // hide a person after 10 minutes without an update

let me = null;
let sharing = false;
let watchId = null;
let lastWrite = 0;
let fitted = false;
let names = new Map();            // user id -> display name
const markers = new Map();        // user id -> Google Maps marker

// Google Maps is loaded by the script tag in index.html
const { Map } = await google.maps.importLibrary("maps");
const map = new Map($("map"), {
  center: { lat: 10.7202, lng: 122.5621 },
  zoom: 13,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false
});

// ---------- Auth ----------
$("signInBtn").onclick = async () => {
  const { error } = await sb.auth.signInWithPassword({ email: $("email").value, password: $("password").value });
  if (error) $("authMsg").textContent = error.message;
};

$("signUpBtn").onclick = async () => {
  const { error } = await sb.auth.signUp({ email: $("email").value, password: $("password").value });
  $("authMsg").textContent = error ? error.message : "Account created. If email confirmation is on, confirm first, then sign in.";
};

$("signOutBtn").onclick = async () => {
  await stopSharing();
  await sb.auth.signOut();
};

sb.auth.onAuthStateChange((event, session) => {
  me = session?.user ?? null;
  if (me) {
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") showApp();
  } else {
    showAuth();
  }
});

function showApp() {
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("signOutBtn").classList.remove("hidden");
  // A fresh page load is never sharing, so clear any old flag
  sb.from("locations").update({ is_sharing: false }).eq("user_id", me.id).then(() => loadAll());
}

function showAuth() {
  $("auth").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("signOutBtn").classList.add("hidden");
  markers.forEach(m => m.setMap(null));
  markers.clear();
  names = new Map();
  fitted = false;
}

// ---------- Sharing ----------
$("shareBtn").onclick = () => (sharing ? stopSharing() : startSharing());

function setStatus(text) { $("status").textContent = text; }

function startSharing() {
  if (!("geolocation" in navigator)) { setStatus("This browser can't get your location."); return; }
  sharing = true;
  $("shareBtn").textContent = "Stop sharing";
  $("shareBtn").classList.add("on");
  setStatus("Getting your location...");
  watchId = navigator.geolocation.watchPosition(onPosition, err => setStatus("Location error: " + err.message), {
    enableHighAccuracy: true,
    maximumAge: 1000
  });
}

async function stopSharing() {
  sharing = false;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  $("shareBtn").textContent = "Start sharing";
  $("shareBtn").classList.remove("on");
  if (me) await sb.from("locations").update({ is_sharing: false }).eq("user_id", me.id);
  setStatus("Sharing is off.");
}

async function onPosition(pos) {
  if (!sharing || !me) return;
  const now = Date.now();
  if (now - lastWrite < MIN_WRITE_MS) return;
  lastWrite = now;
  const { latitude: lat, longitude: lng, accuracy } = pos.coords;
  const { error } = await sb.from("locations").upsert({
    user_id: me.id,
    lat,
    lng,
    accuracy,
    is_sharing: true,
    updated_at: new Date().toISOString()
  });
  setStatus(error ? "Save failed: " + error.message : "Sharing live. Accuracy about " + Math.round(accuracy) + " m.");
}

// ---------- Connections ----------
$("connectBtn").onclick = async () => {
  const email = $("inviteEmail").value.trim().toLowerCase();
  if (!email) return;
  const { data, error } = await sb.rpc("connect_with", { target_email: email });
  const messages = {
    ok: "Connected. You can now see each other on the map.",
    not_found: "No account uses that email.",
    self: "That's your own email."
  };
  $("connectMsg").textContent = error ? error.message : messages[data] || "Something went wrong.";
  if (!error) { $("inviteEmail").value = ""; loadAll(); }
};

async function disconnect(otherId) {
  await sb.rpc("disconnect_from", { other: otherId });
  loadAll();
}

function renderPeople(ids) {
  const list = $("people");
  list.innerHTML = "";
  if (!ids.length) { list.innerHTML = '<div class="muted">No connections yet.</div>'; return; }
  ids.forEach(id => {
    const row = document.createElement("div");
    row.className = "person";
    const name = document.createElement("span");
    name.textContent = names.get(id) || "Unknown";
    const btn = document.createElement("button");
    btn.className = "alt";
    btn.textContent = "Remove";
    btn.onclick = () => disconnect(id);
    row.append(name, btn);
    list.appendChild(row);
  });
}

// ---------- Map ----------
function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  return s < 60 ? s + "s ago" : Math.round(s / 60) + " min ago";
}

function removeMarker(id) {
  const m = markers.get(id);
  if (m) { m.setMap(null); markers.delete(id); }
}

// Draw or move one person's marker. Returns true if they are visible now.
function applyLocation(l) {
  const fresh = l.is_sharing && Date.now() - new Date(l.updated_at).getTime() < STALE_MS;
  if (!fresh) { removeMarker(l.user_id); return false; }

  const isMe = me && l.user_id === me.id;
  const label = (isMe ? "You" : names.get(l.user_id) || "Unknown") + " · " + timeAgo(l.updated_at);
  const position = { lat: l.lat, lng: l.lng };

  let marker = markers.get(l.user_id);
  if (!marker) {
    marker = new google.maps.Marker({
      map,
      position,
      title: label,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: isMe ? "#FFC400" : "#1565C0",
        fillOpacity: 1,
        strokeColor: isMe ? "#1565C0" : "#FFC400",
        strokeWeight: 3
      }
    });
    markers.set(l.user_id, marker);
  }
  marker.setPosition(position);
  marker.setTitle(label);
  return true;
}

function renderMap(locs) {
  const visible = new Set();
  locs.forEach(l => { if (applyLocation(l)) visible.add(l.user_id); });
  [...markers.keys()].forEach(id => { if (!visible.has(id)) removeMarker(id); });

  if (!fitted && visible.size) {
    const bounds = new google.maps.LatLngBounds();
    locs.filter(l => visible.has(l.user_id)).forEach(l => bounds.extend({ lat: l.lat, lng: l.lng }));
    map.fitBounds(bounds);
    // Don't zoom in too far when only one person is visible
    google.maps.event.addListenerOnce(map, "idle", () => {
      if (map.getZoom() > 16) map.setZoom(16);
    });
    fitted = true;
  }
}

// ---------- Data loading ----------
async function loadAll() {
  if (!me) return;

  // Everyone I'm connected with (either direction)
  const { data: links } = await sb.from("shares").select("owner_id, viewer_id");
  const otherIds = new Set();
  (links || []).forEach(l => otherIds.add(l.owner_id === me.id ? l.viewer_id : l.owner_id));

  // Locations I'm allowed to see (RLS filters this)
  const { data: locs } = await sb.from("locations").select("*");
  (locs || []).forEach(l => { if (l.user_id !== me.id) otherIds.add(l.user_id); });

  const { data: profs } = await sb.from("profiles").select("id, email, display_name").in("id", [...otherIds, me.id]);
  names = new Map((profs || []).map(p => [p.id, p.display_name || p.email]));

  renderPeople([...otherIds]);
  renderMap(locs || []);
}

// Live updates: apply single changes instantly
sb.channel("locations-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, payload => {
    if (!me || !payload.new || !payload.new.user_id) return;
    if (!names.has(payload.new.user_id)) { loadAll(); return; }   // unknown person: refresh names
    applyLocation(payload.new);
  })
  .subscribe();

// Refresh periodically so stale markers disappear even without an event
setInterval(() => { if (me) loadAll(); }, 30000);
