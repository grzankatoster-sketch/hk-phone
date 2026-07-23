// Hook poziomu aplikacji: obserwuje stan sprzątania (hk_plan/hk_rooms/hk_logs)
// oraz usterki (faults) i wykrywa sytuacje dla agenta AI:
//  • propozycje zamian pokoi (równoważenie obciążenia wśród OBECNYCH),
//  • prośby o pokój z telefonów HK,
//  • NOWE zdarzenia-powiadomienia: zgłoszona usterka w pokoju,
//    rozpoczęcie/zakończenie PILNEGO pokoju (wyjazd W/WP).
// Gdy pojawi się NOWY element, a okno recepcji jest schowane/nieaktywne, odpala
// natywne powiadomienie Windows (Electron). Zawsze ustawia "attention" — dymek
// bota wyskakuje wtedy w KAŻDYM oknie (bot stale widoczny tylko w HK).
//
// Liczby liczone są deterministycznie (hkAgent.js) — to NIE jest źródło LLM.
import React from "react";
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";
import { suggestReassignments, suggestForRequest, HK_WORKER_ACTIONS } from "./hkAgent";

const sugKey = (s) => `${s.from}->${s.to}:${s.rooms.join(",")}`;
const SYSTEM_WORKERS = new Set(["Recepcja", "HK", "System"]);
const MAX_NOTICES = 8;
// Powiadomienia informacyjne (usterki, pilne pokoje, odpowiedzi) są widoczne w
// dymku/popoverze przez 5 minut, a potem same znikają do Historii — recepcja NIE
// musi ich odklikiwać. „OK"/akcja zostaje tylko dla próśb o pokój i zamian przydziału.
const NOTICE_TTL_MS = 5 * 60 * 1000;

const truncate = (s, n = 80) => {
  const t = String(s || "").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

// Osoby obecne dziś = unia: przydziały (rano+PM) ∪ grafik (roster) ∪ autorzy logów
// HK. Dzięki temu idle pracownik bez pokoi, ale obecny, trafia do puli agenta.
// Z logów liczą się TYLKO akcje sprzątających (HK_WORKER_ACTIONS) — akcje recepcji
// (reassign/priority/info_request) zapisane pod imieniem recepcjonisty są pomijane,
// by recepcja nie stała się kandydatem do sprzątania.
function buildPresentWorkers(assignments, roster, logs) {
  const set = new Set(Object.keys(assignments || {}));
  (Array.isArray(roster) ? roster : []).forEach(r => { if (r?.name) set.add(r.name); });
  (logs || []).forEach(l => {
    if (l?.worker && HK_WORKER_ACTIONS.has(l.action) && !SYSTEM_WORKERS.has(l.worker)) set.add(l.worker);
  });
  return [...set];
}
const handledKey = (date) => `hk-agent-handled-${date}`;

function getHandled(date) {
  try { return new Set(JSON.parse(localStorage.getItem(handledKey(date)) || "[]")); }
  catch { return new Set(); }
}

// Oznacz prośbę (id logu) jako rozpatrzoną — wywoływane przez panel po
// Zastosuj/Odrzuć. Powiadamia obserwatora przez event, by zgasić banner.
export function markRequestHandled(date, id) {
  const s = getHandled(date);
  s.add(String(id));
  try { localStorage.setItem(handledKey(date), JSON.stringify([...s])); } catch {}
  window.dispatchEvent(new CustomEvent("cc-agent-handled"));
}

// ─── Trwałe odrzucenia propozycji zamian (wspólne: watcher + panel) ──────────
// Odrzucona 1:1 propozycja (ten sam from→to:rooms) NIE wraca — nawet po remount
// i niezależnie, czy odrzucono ją w panelu czy w dymku. Klucz per data.
const dismissedKey = (date) => `hk-agent-dismissed-${date}`;
export function getDismissedSwaps(date) {
  try { return JSON.parse(localStorage.getItem(dismissedKey(date)) || "[]"); }
  catch { return []; }
}
export function markSwapDismissed(date, key) {
  const s = new Set(getDismissedSwaps(date));
  s.add(key);
  try { localStorage.setItem(dismissedKey(date), JSON.stringify([...s])); } catch {}
  window.dispatchEvent(new CustomEvent("cc-agent-dismissed"));
}

// Epoch (ms) ze znacznika czasu zdarzenia. NaN gdy brak/niewłaściwy — wtedy
// porównanie `> watermark` zwraca false, więc nie alarmujemy (zachowawczo).
const toMs = (ts) => Date.parse(ts);

const windowActive = () =>
  typeof document !== "undefined" &&
  document.visibilityState === "visible" &&
  document.hasFocus();

// roomMetaRef: opcjonalny ref { current: hkData } — by klasyfikować pilne pokoje
// (wyjazdy) bez ponownego subskrybowania efektu przy każdej zmianie hkData.
export function useHKAgent(date, enabled = true, roomMetaRef = null) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [requests, setRequests] = React.useState([]); // [{ log, suggestion }]
  const [notices, setNotices] = React.useState([]);    // [{ id, kind, text, ts }]
  const [attention, setAttention] = React.useState(null); // { kind, text } | null

  const seenRef = React.useRef(null);       // Set kluczy już widzianych (anty-spam)
  const seenTsRef = React.useRef(0);        // watermark: max ts zdarzeń przy seedzie
  const dismissedRef = React.useRef(false); // czy dymek zdjęty ręcznie
  const dismissedNoticesRef = React.useRef(new Set()); // odrzucone powiadomienia (sesja)

  const [dismissedSug, setDismissedSug] = React.useState([]); // odrzucone zamiany
  const dismissedSugRef = React.useRef([]);
  React.useEffect(() => { dismissedSugRef.current = dismissedSug; }, [dismissedSug]);

  const dismissAttention = React.useCallback(() => {
    dismissedRef.current = true;
    setAttention(null);
  }, []);
  const dismissSwap = React.useCallback((s) => {
    const k = typeof s === "string" ? s : sugKey(s);
    markSwapDismissed(date, k); // trwałe + event (wspólne z panelem)
    setDismissedSug(prev => prev.includes(k) ? prev : [...prev, k]);
  }, [date]);
  const dismissNotice = React.useCallback((id) => {
    dismissedNoticesRef.current.add(String(id));
    setNotices(prev => prev.filter(n => n.id !== id));
  }, []);

  React.useEffect(() => {
    if (!enabled || !supabase || !date) {
      setSuggestions([]); setRequests([]); setNotices([]); setAttention(null);
      return;
    }
    let active = true;
    seenRef.current = null;                  // reseed po zmianie daty
    seenTsRef.current = 0;                    // reset watermarka
    dismissedNoticesRef.current = new Set();
    setDismissedSug(getDismissedSwaps(date)); // wczytaj trwałe odrzucenia z localStorage

    const poll = async () => {
      try {
        const dayStart = `${date}T00:00:00`;
        const dayEnd = `${date}T23:59:59`;
        const res = await Promise.all([
          supabase.from("hk_plan").select("assignments,pm_assignments").eq("date", date).maybeSingle(),
          supabase.from("hk_rooms").select("room,status,worker,vacated").eq("date", date),
          supabase.from("hk_logs").select("*").eq("date", date).order("created_at"),
          supabase.from("hk_roster").select("roster").eq("tenant_id", TENANT_ID).eq("date", date).maybeSingle(),
          supabase.from("faults").select("id,room,space_id,description,reported_by,reported_at,source")
            .eq("tenant_id", TENANT_ID).gte("reported_at", dayStart).lte("reported_at", dayEnd).order("reported_at"),
        ]);
        if (!active) return;
        // Supabase NIE rzuca wyjątku przy błędzie zapytania — zwraca { data:null, error }.
        // Gdy którykolwiek odczyt padł (np. niestabilne łącze nocą), dane są częściowe:
        // nierozpatrzona prośba o pokój chwilowo „znika", a w kolejnym ticku wraca jako
        // „nowa" → fałszywy dymek/powiadomienie „ktoś prosi o pokój". Pomiń taki tick,
        // nie ruszaj stanu (catch poniżej łapie tylko rzucone błędy sieci).
        if (res.some(r => r?.error)) return;
        const [{ data: plan }, { data: rData }, { data: lData }, { data: rosterRow }, { data: fData }] = res;

        // Scalenie planu porannego i popołudniowego BEZ nadpisywania: ta sama osoba
        // może mieć wpis w obu (np. dyżurna robiąca rano wyjazdy, po południu pobyty)
        // — spread obiektów nadpisywałby jej listę zamiast sumować, gubiąc zaległość
        // z jednej ze zmian w statystykach obciążenia.
        const amPlan = plan?.assignments || {};
        const pmPlan = plan?.pm_assignments || {};
        const assignments = {};
        Object.entries(amPlan).forEach(([w, rms]) => { assignments[w] = [...(Array.isArray(rms) ? rms : [])]; });
        Object.entries(pmPlan).forEach(([w, rms]) => { assignments[w] = [...(assignments[w] || []), ...(Array.isArray(rms) ? rms : [])]; });
        const roomStates = {};
        (rData || []).forEach(r => { roomStates[r.room] = r; });
        const presentWorkers = buildPresentWorkers(assignments, rosterRow?.roster, lData);
        // Zmiana popołudniowa obsługuje tylko pobyty (PG/PGZ) + BR/ZS, nie wyjazdy — nie
        // może być ani odbiorcą, ani DAWCĄ w rannym balansowaniu (inaczej idle popołudniówka
        // wygląda na „wolną" i dostaje wyjazdy, albo jej zaległość PG/PGZ wygląda na
        // „przeciążoną" i zostaje zrzucona na ranną — mylenie zmian w sugestiach agenta).
        // Cała pula kluczy z pm_assignments, nie tylko jedna osoba oznaczona rolą w
        // rosterze — kilka osób może mieć przydzielone pokoje popołudniowe naraz.
        const roster = Array.isArray(rosterRow?.roster) ? rosterRow.roster : [];
        const pmWorkers = [...new Set([
          ...Object.keys(pmPlan),
          ...roster.filter(r => r?.role === "popoludnie" && r?.name).map(r => r.name),
        ])];

        // 1) Propozycje zamian (równoważenie obciążenia wśród OBECNYCH, też idle bez pokoi)
        const sugg = suggestReassignments({ assignments, roomStates, presentWorkers, excludeTo: pmWorkers, excludeFrom: pmWorkers })
          .filter(s => !dismissedSugRef.current.includes(sugKey(s)));

        // 2) Prośby o pokój z telefonów — nierozpatrzone
        const handled = getHandled(date);
        const reqLogs = (lData || []).filter(l => l.action === "room_request" && !handled.has(String(l.id)));
        const reqs = reqLogs.map(log => ({
          log,
          suggestion: suggestForRequest({ requester: log.worker, assignments, roomStates }),
        }));

        // 3) Powiadomienia: usterki + start/koniec PILNEGO pokoju (wyjazd)
        const noticeItems = [];
        (fData || []).forEach(f => {
          const id = `fault:${f.id}`;
          if (dismissedNoticesRef.current.has(id)) return;
          const where = f.room ? `pok. ${f.room}` : (f.space_id || "");
          noticeItems.push({
            id, kind: "fault", ts: f.reported_at,
            text: `🔧 Usterka${where ? ` (${where})` : ""}: ${truncate(f.description)}${f.reported_by ? ` — ${f.reported_by}` : ""}`,
          });
        });
        // Pokoje, które recepcja JAWNIE oznaczyła jako pilne (przycisk „Pilne /
        // pierwsza kolejność" → log action:"priority", odwołanie: "priority_off").
        // Tylko dla nich agent ogłasza „pilny pokój". Sam wyjazd (W/WP) bez tego
        // przycisku NIE jest pilny — recepcja go nie zgłosiła. (lData rosnąco po czasie.)
        const priorityRooms = new Set();
        (lData || []).forEach(l => {
          if (!l.room) return;
          if (l.action === "priority") priorityRooms.add(l.room);
          else if (l.action === "priority_off") priorityRooms.delete(l.room);
        });
        (lData || []).forEach(l => {
          if ((l.action !== "start" && l.action !== "done") || !l.room) return;
          if (!priorityRooms.has(l.room)) return;
          const id = `urg:${l.action}:${l.id}`;
          if (dismissedNoticesRef.current.has(id)) return;
          noticeItems.push({
            id, kind: l.action === "start" ? "urgent_start" : "urgent_done",
            ts: l.created_at || `${date}T${l.log_time || ""}`,
            text: l.action === "start"
              ? `🔴 ${l.worker || "HK"} zaczyna pilny pokój ${l.room} (priorytet recepcji)`
              : `✅ ${l.worker || "HK"} skończył(a) pilny pokój ${l.room} (priorytet recepcji)`,
          });
        });
        // Odpowiedzi pracownic na pytanie recepcji o status pokoju ("Zapytaj o status").
        // Agent ogłasza je dymkiem + powiadomieniem (np. „Pokój 112 · Zuza: myję podłogę").
        (lData || []).forEach(l => {
          if (l.action !== "info_reply" || !l.room) return;
          const id = `reply:${l.id}`;
          if (dismissedNoticesRef.current.has(id)) return;
          noticeItems.push({
            id, kind: "info_reply",
            ts: l.created_at || `${date}T${l.log_time || ""}`,
            text: `💬 Pokój ${l.room} · ${l.worker || "HK"}: ${truncate(l.extra)}`,
          });
        });
        noticeItems.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));

        setSuggestions(sugg);
        setRequests(reqs);
        // W „Teraz" pokazujemy tylko świeże (≤5 min) — starsze już przeszły do Historii
        // (AgentBot trzyma trwały dziennik). Element bez poprawnego ts zostaje (zachowawczo).
        const nowMs = Date.now();
        const liveNotices = noticeItems.filter(n => {
          const t = toMs(n.ts);
          return !Number.isFinite(t) || nowMs - t < NOTICE_TTL_MS;
        });
        setNotices(liveNotices.slice(0, MAX_NOTICES));

        // 4) Wykryj NOWE elementy → dymek + powiadomienie Windows (bez spamu na starcie)
        const keys = new Set([
          ...sugg.map(s => "swap:" + sugKey(s)),
          ...reqs.map(r => "req:" + r.log.id),
          ...noticeItems.map(n => n.id),
        ]);
        // Watermark = najwyższy ts zdarzenia (log/usterka) zaobserwowany przy seedzie,
        // liczony ze WSZYSTKICH logów i usterek niezależnie od bieżącej klasyfikacji.
        // Chroni przed fałszywym dymkiem, gdy STARY element staje się „nowym" kluczem
        // nie dlatego, że coś się właśnie wydarzyło, lecz bo dane sklasyfikowano z
        // opóźnieniem (np. hkData/meta doczytało się dopiero w kolejnym ticku i log
        // wyjazdu nagle kwalifikuje się jako „pilny pokój"). Tylko zdarzenia z ts
        // PÓŹNIEJSZYM niż watermark mogą wywołać dymek/powiadomienie Windows.
        const eventTs = [
          ...(lData || []).map(l => toMs(l.created_at)),
          ...(fData || []).map(f => toMs(f.reported_at)),
        ].filter(Number.isFinite);
        const maxTs = eventTs.length ? Math.max(...eventTs) : 0;

        if (seenRef.current === null) {
          seenRef.current = keys;             // pierwszy przebieg — tylko zapamiętaj
          seenTsRef.current = maxTs;          // ustal watermark (stały do końca dnia)
        } else {
          const fresh = [...keys].filter(k => !seenRef.current.has(k));
          // Kumulatywnie: raz zauważony klucz zostaje zapamiętany. Dzięki temu
          // element, który chwilowo zniknął (np. częściowy odczyt) i wrócił, NIE
          // jest ponownie traktowany jako „nowy" → brak fałszywych powiadomień.
          seenRef.current = new Set([...seenRef.current, ...keys]);
          // Świeży klucz alarmuje TYLKO gdy zdarzenie jest realnie nowsze niż
          // watermark. Propozycje zamian (swap) nie mają ts — to wyliczony stan
          // bieżący, więc świeża zamiana zawsze może zaalarmować.
          const wm = seenTsRef.current;
          // Priorytet komunikatu: prośba > usterka/pilny pokój > propozycja zamiany.
          // Tylko zdarzenia nowsze niż watermark (lub świeża zamiana) alarmują —
          // bez kwalifikującego się elementu NIE pokazujemy dymka ani powiadomienia.
          const firstReq = reqs.find(r => fresh.includes("req:" + r.log.id) && toMs(r.log.created_at) > wm);
          const firstNotice = noticeItems.find(n => fresh.includes(n.id) && toMs(n.ts) > wm);
          const firstSwap = sugg.find(s => fresh.includes("swap:" + sugKey(s)));
          if (firstReq || firstNotice || firstSwap) {
            // Emoji w tytułach to treść powiadomienia systemowego (OS notify) — nie da się
            // tam wstawić SVG. Maskotka w UI aplikacji jest już ikoną (AgentIcon, WYKONANIE 1.17).
            let kind = "swap", text = "Nowa propozycja agenta", title = "🤖 Agent: propozycja zamiany";
            // action: payload do zatwierdzenia wprost z dymka (bez wchodzenia do HK).
            // Tylko dla zdarzeń wykonywalnych — usterki/pilne pokoje są informacyjne.
            let action = null;
            if (firstReq) {
              kind = "request";
              text = firstReq.suggestion?.reason || `${firstReq.log.worker} prosi o pokój`;
              title = "🙋 Prośba o pokój";
              if (firstReq.suggestion) action = { type: "request", request: firstReq };
            } else if (firstNotice) {
              kind = firstNotice.kind;
              text = firstNotice.text;
              title = firstNotice.kind === "fault" ? "🔧 Nowa usterka" : "🤖 Agent: pilny pokój";
            } else if (firstSwap) {
              text = `Propozycja zamiany: ${firstSwap.from} → ${firstSwap.to} (${firstSwap.rooms.length} pok.)`;
              action = { type: "swap", swap: firstSwap };
            }
            dismissedRef.current = false;
            setAttention({ kind, text, action });
            // Powiadomienie Windows tylko gdy okno nieaktywne/schowane
            if (!windowActive() && window.electronAPI?.notify) {
              window.electronAPI.notify({ title, body: text, nav: "hk-monitor" });
            }
          }
        }

        // Gdy nic nie zostało (wszystko rozpatrzone) — zgaś dymek
        if (keys.size === 0) setAttention(null);
      } catch { /* sieć padła — kolejny tick */ }
    };

    poll();
    const id = setInterval(poll, 12000);
    const onHandled = () => poll();
    const onVisible = () => { if (windowActive()) poll(); };
    // Odrzucenie z panelu (lub innego okna) → wczytaj wspólny zbiór i przelicz.
    const onDismissed = () => { setDismissedSug(getDismissedSwaps(date)); poll(); };
    window.addEventListener("cc-agent-handled", onHandled);
    window.addEventListener("cc-agent-dismissed", onDismissed);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(id);
      window.removeEventListener("cc-agent-handled", onHandled);
      window.removeEventListener("cc-agent-dismissed", onDismissed);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [date, enabled]);

  return {
    suggestions, requests, notices, attention,
    dismissAttention, dismissSwap, dismissNotice,
    pending: suggestions.length + requests.filter(r => r.suggestion).length,
  };
}
