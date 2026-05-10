import React from "react";

// Conrad Comfort logo SVG
// Wzor: 4 kropki nad napisem CONRAD + COMFORT
// Kolory: plum (tlo) + biel (tekst), albo plum (tekst) + przezroczysty
//
// Warianty:
//   variant="full"     pelne logo z napisami CONRAD COMFORT
//   variant="icon"     same kropki + monogram CC
//   variant="dotsOnly" tylko 4 kropki (do drobnych miejsc)
//
// kolor tla:
//   tone="dark"   plum tlo + biale teksty (jak na oryginale)
//   tone="light"  przezroczyste tlo + plum teksty
//   tone="white"  bialy tekst (np. na ciemnym headerze)
//
// Opcje:
//   width / height   nadpisanie rozmiaru
//   className        dodatkowe klasy
//   ariaLabel        label dla a11y

export default function Logo({
  variant = "full",
  tone = "dark",
  width,
  height,
  className = "",
  ariaLabel = "Conrad Comfort",
  style = {},
}) {
  if (variant === "dotsOnly") {
    return <DotsOnly tone={tone} width={width||40} height={height||10} className={className} ariaLabel={ariaLabel} style={style}/>;
  }
  if (variant === "icon") {
    return <IconLogo tone={tone} width={width||40} height={height||40} className={className} ariaLabel={ariaLabel} style={style}/>;
  }
  return <FullLogo tone={tone} width={width||220} height={height||110} className={className} ariaLabel={ariaLabel} style={style}/>;
}

function colors(tone) {
  if (tone === "light") return { bg: "transparent", fg: "#5a1d4a" };
  if (tone === "white") return { bg: "transparent", fg: "#ffffff" };
  return { bg: "#5a1d4a", fg: "#ffffff" };
}

function DotsOnly({ tone, width, height, className, ariaLabel, style }) {
  const { fg } = colors(tone);
  return (
    <svg viewBox="0 0 80 12" width={width} height={height} className={className} style={style}
         role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg">
      <g fill={fg}>
        <circle cx="20" cy="6" r="2.4"/>
        <circle cx="32" cy="6" r="2.4"/>
        <circle cx="48" cy="6" r="2.4"/>
        <circle cx="60" cy="6" r="2.4"/>
      </g>
    </svg>
  );
}

function IconLogo({ tone, width, height, className, ariaLabel, style }) {
  const { bg, fg } = colors(tone);
  const showBg = bg !== "transparent";
  return (
    <svg viewBox="0 0 80 80" width={width} height={height} className={className} style={style}
         role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg">
      {showBg && <rect width="80" height="80" rx="12" fill={bg}/>}
      <g fill={fg}>
        <circle cx="28" cy="22" r="2.6"/>
        <circle cx="36" cy="22" r="2.6"/>
        <circle cx="44" cy="22" r="2.6"/>
        <circle cx="52" cy="22" r="2.6"/>
      </g>
      <text x="40" y="56" fontFamily="'DM Serif Display', serif" fontSize="26"
            fontWeight="400" textAnchor="middle" fill={fg} letterSpacing="0.06em">CC</text>
    </svg>
  );
}

function FullLogo({ tone, width, height, className, ariaLabel, style }) {
  const { bg, fg } = colors(tone);
  const showBg = bg !== "transparent";
  return (
    <svg viewBox="0 0 220 110" width={width} height={height} className={className} style={style}
         role="img" aria-label={ariaLabel} xmlns="http://www.w3.org/2000/svg">
      {showBg && <rect width="220" height="110" rx="6" fill={bg}/>}
      {/* 4 kropki nad napisem */}
      <g fill={fg}>
        <circle cx="92" cy="30" r="2.6"/>
        <circle cx="100" cy="30" r="2.6"/>
        <circle cx="120" cy="30" r="2.6"/>
        <circle cx="128" cy="30" r="2.6"/>
      </g>
      {/* CONRAD */}
      <text x="110" y="62" fontFamily="'DM Serif Display', serif"
            fontSize="22" fontWeight="400" letterSpacing="0.18em"
            textAnchor="middle" fill={fg}>CONRAD</text>
      {/* COMFORT */}
      <text x="110" y="86" fontFamily="'Inter', sans-serif"
            fontSize="11" fontWeight="500" letterSpacing="0.55em"
            textAnchor="middle" fill={fg}>COMFORT</text>
    </svg>
  );
}
