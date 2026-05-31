export const EMPLOYEE_FULL_NAMES = {
  "Pawel":    "Paweł Grzenkowicz",
  "Weronika": "Weronika Strach",
  "Agata":    "Agata Letka",
  "Oliwier":  "Oliwier Kowalik",
  "Natalia":  "Natalia Szymańska",
  "Rebecca":  "Rebecca Pinzi",
  "Paweł":    "Paweł Grzenkowicz",
};

export const getFullName = (name) => EMPLOYEE_FULL_NAMES[name] || name || "—";
