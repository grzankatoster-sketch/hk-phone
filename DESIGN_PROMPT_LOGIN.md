# Design Prompt — Conrad Comfort Login Screen (Option A: Progressive Reveal)

Wklej ten prompt do Claude / Figma Make / GPT / innego narzędzia designowego.

---

## Zadanie

Zaprojektuj i wygeneruj **standalone HTML+CSS mockup** ekranu logowania dla aplikacji hotelowej **Conrad Comfort – Panel Recepcji**.

Plik ma być gotowy do otworzenia w przeglądarce bez żadnych zależności poza Google Fonts.

---

## Koncepcja: jeden ekran, jedna karta, bez nawigacji

**Kluczowa zasada:** Nie ma klikania między kartami/krokami. Wszystko dzieje się w jednym miejscu. Sekcje wjeżdżają płynnie na dół tej samej karty.

---

## Layout — podział ekranu

```
┌───────────────────────┬──────────────────────────────┐
│   LEWA STRONA (40%)   │    PRAWA STRONA (60%)        │
│   dark #1a1025        │    cream #f5f2ee              │
│                       │                              │
│   [dekoracyjne bąble] │    ┌──────────────────────┐  │
│                       │    │      KARTA           │  │
│   [Logo CC duże]      │    │   (biała, zaokrąglo- │  │
│                       │    │    na, shadow)       │  │
│   [Zegar 22:14]       │    │                      │  │
│   [data pełna]        │    │   Sekcja 1: imię     │  │
│                       │    │   Sekcja 2: hasło ↓  │  │
│   Conrad Comfort      │    │   Sekcja 3: zmiana ↓ │  │
│   Panel Recepcji      │    └──────────────────────┘  │
└───────────────────────┴──────────────────────────────┘
```

---

## Lewa strona — dark panel

- Tło: `#1a1025` (ciemny fioletowy, nie czarny)
- Dekoracje: 2 radial-gradient bąble — jeden duży w prawym górnym rogu (fiolet `rgba(139,75,200,.15)`), jeden mniejszy w lewym dolnym (złoty `rgba(200,160,80,.08)`)
- Logo: monogram **CC** w kwadracie z gradientem `#6b2fa0 → #9333ea`, 40×40px, rounded-lg + tekst "Panel Recepcji" bold 15px + "Conrad Comfort" muted 11px
- Zegar: duży, DM Serif Display, 36px, kolor złoty `#c99950`, font-variant tabular-nums
- Data: Inter 12px, kolor `rgba(255,255,255,.45)`, text-transform capitalize
- Stopka: "Conrad Comfort · Panel Recepcji" — drobna, uppercase, bardzo muted, na dole

---

## Prawa strona — karta

- Tło panelu: `#f5f2ee`
- Karta: biała `#ffffff`, `border-radius: 20px`, `padding: 40px`, shadow `0 8px 40px rgba(0,0,0,.10)`
- Max-width karty: `460px`, wycentrowana pionowo i poziomo

---

## Karta — Sekcja 1: "Kto zaczyna zmianę?" (zawsze widoczna)

**Stan A — wpisywanie imienia:**
- Nagłówek: `Kto zaczyna zmianę?` — DM Serif Display, 24px, kolor `#1a1025`
- Podtytuł: `Wpisz swoje imię lub wybierz z listy` — Inter 13px, kolor `#9b8c7a`
- Chip "ostatnio używany" (opcjonalny, pojawia się jeśli była ostatnia sesja):
  `⏱ Ostatnio: Pawel` — kremowy chip ze złotą obwódką `rgba(201,153,80,.35)`, tło `rgba(201,153,80,.08)`, klikalne
- Input: wysokość 52px, `border-radius: 12px`, border `1.5px solid #e2d5dc` na spokojnie, `2px solid #6b2fa0` on focus + shadow `0 0 0 3px rgba(107,47,160,.12)`, font-size 16px, kolor `#1a1025`, placeholder `#b0a08a`
- Przycisk "Dalej →": pełna szerokość, 52px wysokość, gradient `linear-gradient(135deg, #3b1068, #6b2fa0)`, biały tekst 15px bold, `border-radius: 12px`, shadow `0 4px 16px rgba(107,47,160,.30)`, disabled = opacity 0.4
- Hint: `Kierownicy zostaną poproszeni o hasło` — 11.5px, kolor muted, wycentrowany

**Stan B — imię potwierdzone (kiedy wpisane i zatwierdzone):**
- Karta pokazuje zamiast formularza: wiersz z imieniem + badge
- Layout: `[Zalogowany jako] [Pawel] [KIEROWNIK badge] ... [Zmień]`
- "Zalogowany jako" — 10px uppercase muted
- Imię — 20px DM Serif Display, `#1a1025`
- Badge "KIEROWNIK" — 9px uppercase, tło `rgba(200,160,80,.18)`, border złoty, kolor `rgba(200,160,80,.9)` — pojawia się tylko gdy manager
- Przycisk "Zmień" — mały, prawy róg, ghost style z plum border

---

## Karta — Sekcja 2: Hasło kierownika (wjeżdża płynnie gdy imię = manager)

- **Animacja wjazdu**: `slide-down` z `opacity: 0, translateY(-12px)` do `opacity: 1, translateY(0)`, czas 0.3s ease-out
- Separator: `1px solid #f0ebe3`, margin top/bottom 20px
- Banner kierownika: `background: rgba(201,153,80,.10)`, border `1px solid rgba(201,153,80,.3)`, `border-radius: 12px`, padding 14px 16px, flex z ikoną ShieldCheck (złota) + tekst "Konto kierownika — podaj hasło"
- Input hasło: identyczny styl jak input imię (`type="password"`)
- Dwa przyciski w jednym rzędzie:
  - `← Wstecz` — ghost (border plum, bg transparent, kolor plum)
  - `Zaloguj →` — gradient plum, flex: 1
- Link "Pomiń (kontynuuj jako pracownik)" — mały, underline, muted, pod przyciskami

---

## Karta — Sekcja 3: Wybór zmiany (wjeżdża po zalogowaniu)

- **Animacja wjazdu**: identyczna jak sekcja 2 — `slide-down`
- Separator: `1px solid #f0ebe3`
- Label: `TWOJA ZMIANA` — 9.5px uppercase, letterSpacing .14em, kolor `#b0a08a`
- Nazwa zmiany: DM Serif Display, 24px, `#1a1025` — np. "Zmiana poranna 7:00–15:00"
- Data: 12px, `#9b8c7a` — np. "wtorek, 29 kwietnia 2026"
- Wskaźnik źródła zmiany: mała zielona/złota/szara kropka + tekst "Z grafiku kierownika" / "Wykryta automatycznie"
- Zmień zmianę (gdy nie z grafiku): wiersz `Nie zgadza się zmiana? [Zmień ▾]` — dropdown z opcjami:
  - Poranna 7:00–15:00
  - Popołudniowa 15:00–23:00
  - Nocna 23:00–7:00
- Przycisk CTA: pełna szerokość, 54px, gradient `#3b1068 → #6b2fa0`, "Rozpocznij zmianę →", shadow plum, font 15px bold — GŁÓWNY PRZYCISK, ma przyciągać wzrok

---

## Notatka od poprzedniej zmiany (pod kartą, gdy sekcja 3 aktywna)

- Pojawia się pod kartą z animacją slide-down
- Styl: kremowy panel z lewą obwódką plum `3px solid #5a1d4a`, padding 14px 18px, gap 10px flex
- Ikona MessageSquare plum + tekst notatki + meta (imię · zmiana)

---

## Animacje

```css
@keyframes cc-slide-down {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.cc-slide-down { animation: cc-slide-down .3s cubic-bezier(.4,0,.2,1) both; }

@keyframes cc-logo-breath {
  0%, 100% { opacity: .85; }
  50%      { opacity: 1; }
}
```

---

## Paleta — nie odchodź od tych kolorów

| Rola | Wartość |
|---|---|
| Dark sidebar bg | `#1a1025` |
| Cream bg | `#f5f2ee` |
| Biała karta | `#ffffff` |
| Plum primary | `#5a1d4a` |
| Gradient dark | `#3b1068 → #6b2fa0` |
| Gold | `#c99950` |
| Text primary | `#1a1025` |
| Text muted | `#9b8c7a` |
| Border light | `#e2d5dc` |

---

## Czcionki

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
```

- Nagłówki / imię / zmiana: **DM Serif Display**
- Wszystko inne: **Inter**

---

## Mock data do użycia w mockupie

- Imię zalogowanego: **Pawel**
- Rola: **Kierownik**
- Zmiana: **Poranna 7:00–15:00**
- Data: **wtorek, 29 kwietnia 2026**
- Zegar: **07:12**
- Źródło zmiany: Z grafiku kierownika
- Notatka od poprzedniej zmiany: "Proszę sprawdzić rezerwację w pokoju 214 — gość poprosił o dodatkowy ręcznik przy następnej wizycie."

---

## Stan do pokazania w mockupie

Pokaż **dwa widoki** w jednym pliku HTML (lub jako dwa `<section>` obok siebie):

1. **Stan "name" (pusty)** — tylko Sekcja 1 z pustym inputem
2. **Stan "ready"** — Sekcja 1 (imię potwierdzone jako chip) + Sekcja 3 (zmiana + CTA) — to jest najważniejszy widok

---

## Responsive (opcjonalnie)

Na ekranach < 900px: lewa strona staje się poziomym nagłówkiem (fullwidth, 80px height), prawa strona zajmuje resztę.

---

## Output

Jeden plik: `Conrad-Comfort-Login.html` — standalone, otwiera się w przeglądarce, wygląda gotowo do wdrożenia.
