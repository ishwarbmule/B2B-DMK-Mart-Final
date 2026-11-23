/**
 * Maharashtra locations — cities and towns for location-wise pricing.
 * Static reference data (NO database table): customers pick their city/town,
 * the admin picks target locations for bulk price changes.
 *
 * DMK Mart runs TWO main warehouses:
 *   • Kolhar (Ahmednagar district)  → nearby = Ahmednagar belt towns
 *   • Pune                          → nearby = Pune district + PCMC belt
 * `nearbyLocationsForWarehouse()` matches the warehouse name/code and returns
 * the belt's locations for the pricing dropdown; anything else gets all of
 * Maharashtra.
 */

/** Pune warehouse belt — Pune district + PCMC + industrial corridors */
export const PUNE_NEARBY: string[] = [
  "Pune", "Pimpri-Chinchwad", "Hadapsar", "Kharadi", "Wagholi", "Hinjawadi", "Baner", "Wakad",
  "Balewadi", "Pimple Saudagar", "Pimple Gurav", "Bhosari", "Moshi", "Chikhali", "Nigdi", "Akurdi",
  "Dehu", "Alandi", "Ravet", "Punawale", "Thergaon", "Tathawade", "Chinchwad", "Pirangut",
  "Chakan", "Talegaon Dabhade", "Talegaon Chakan", "Lonavala", "Kamshet", "Vadgaon Maval", "Urse",
  "Rajgurunagar (Khed)", "Khed", "Chimbali", "Manchar", "Narayangaon", "Ghodegaon", "Pabal",
  "Shirur", "Sanaswadi", "Ranjangaon", "Kurkumbh", "Patas", "Daund", "Kedgaon (Daund)",
  "Baramati", "Indapur", "Loni Kalbhor", "Uruli Kanchan", "Yavat", "Saswad", "Jejuri", "Purandar",
  "Haveli", "Wadgaon Sheri", "Viman Nagar", "Chandan Nagar", "Kondhwa", "Undri", "NIBM Road",
  "Dhanori", "Lohegaon", "Dhanakwadi", "Katraj", "Ambegaon", "Bavdhan", "Sus", "Mulshi",
];

/** Kolhar warehouse belt — Ahmednagar district + Ahmednagar–Pune highway towns */
export const KOLHAR_NEARBY: string[] = [
  "Kolhar", "Ahmednagar", "Ahmednagar MIDC", "Shrirampur", "Loni (Ahmednagar)", "Ghulewadi",
  "Rahuri", "Sangamner", "Sangamner MIDC", "Kopargaon", "Rahata", "Shirdi", "Kakadi",
  "Nevasa", "Shevgaon", "Pathardi", "Jamkhed", "Karjat (Ahmednagar)", "Shrigonda",
  "Shrigonde", "Parner", "Supa", "Takli Dhokeshwar", "Jeur", "Kedgaon (Ahmednagar)",
  "Bhandardarah", "Akola (Ahmednagar)", "Ralegan Siddhi", "Wadner Haveli", "Warur",
];

/** Rest of Maharashtra — every other city/town served from either warehouse */
export const REST_OF_MAHARASHTRA: string[] = [
  "Mumbai", "Navi Mumbai", "Thane", "Kalyan", "Dombivli", "Bhiwandi", "Ambernath", "Ulhasnagar",
  "Vasai", "Virar", "Palghar", "Boisar", "Panvel", "Taloja", "Kharghar", "Belapur", "Vashi",
  "Alibag", "Pen", "Roha", "Mahad", "Ratnagiri", "Chiplun", "Khed (Ratnagiri)", "Sangameshwar",
  "Kudal", "Sawantwadi", "Malvan", "Vengurla", "Kolhapur", "Ichalkaranji", "Karad", "Satara",
  "Wai", "Mahabaleshwar", "Panchgani", "Sangli", "Miraj", "Tasgaon", "Islampur", "Kavathe Mahankal",
  "Solapur", "Pandharpur", "Barshi", "Akalkot", "Mangalwedha", "Atpadi", "Karmala", "Madha",
  "Nashik", "Malegaon", "Sinners (Sinnar)", "Dindori", "Igatpuri", "Trimbakeshwar", "Peth",
  "Dhule", "Nandurbar", "Shahada", "Taloda", "Sakri", "Chopda", "Jalgaon", "Bhusawal",
  "Chopda", "Amalner", "Pachora", "Chalisgaon", "Yawal", "Raver", "Muktainagar",
  "Aurangabad (Chh. Sambhajinagar)", "Chh. Sambhajinagar", "Kannad", "Sillod", "Paithan", "Vaijapur",
  "Gangapur (Aurangabad)", "Waluj MIDC", "Shendra MIDC", "Jalna", "Badnapur", "Partur", "Ambad",
  "Beed", "Georai", "Ambajogai", "Kaij", "Dharur", "Parli", "Ghatanji",
  "Latur", "Udgir", "Ahmadpur", "Nilanga", "Ausa", "Omerga",
  "Nanded", "Biloli", "Deglur", "Mukhed", "Kandhar", "Kinwat",
  "Parbhani", "Manwat", "Pathri", "Purna", "Jintur", "Selu",
  "Hingoli", "Kalamnuri", "Basmath", "Washim", "Karanja", "Mangrulpir",
  "Akola", "Balapur", "Shegaon", "Chikhli (Buldhana)", "Buldhana", "Mehkar", "Jalgaon Jamod",
  "Amravati", "Nandgaon Khandeshwar", "Chandur Railway", "Daryapur", "Anjangaon", "Achalpur",
  "Morshi", "Warud", "Chikhaldara", "Wardha", "Arvi", "Hinganghat", "Seloo", "Deoli",
  "Nagpur", "Kamptee", "Kanhan", "Umred", "Katol", "Narkhed", "Ramtek", "Saoner", "Kalmeshwar",
  "Hingna MIDC", "Butibori MIDC", "Bhandara", "Gondia", "Tumsar", "Sakoli", "Chandrapur",
  "Gadchandur", "Ballarpur", "Wani", "Pandharkawada", "Pusad", "Digras", "Karanja (Washim)",
  "Yavatmal", "Umarkhed", "Nilkanthi",
];

/** All locations, deduped, sorted A→Z */
export const MAHARASHTRA_LOCATIONS: string[] =
  [...new Set([...PUNE_NEARBY, ...KOLHAR_NEARBY, ...REST_OF_MAHARASHTRA])].sort((a, b) => a.localeCompare(b));

export const MAHARASHTRA_GROUPS: { label: string; hint: string; locations: string[] }[] = [
  { label: "Pune warehouse belt", hint: "served by the Pune godown", locations: [...PUNE_NEARBY].sort((a, b) => a.localeCompare(b)) },
  { label: "Kolhar warehouse belt", hint: "served by the Kolhar godown (Ahmednagar district)", locations: [...KOLHAR_NEARBY].sort((a, b) => a.localeCompare(b)) },
  { label: "Rest of Maharashtra", hint: "all other cities and towns", locations: [...REST_OF_MAHARASHTRA].sort((a, b) => a.localeCompare(b)) },
];

/** Cities/towns a given warehouse naturally serves (multi-select list for pricing).
 *  Matched by name/code keywords: "kolhar" → Ahmednagar belt, "pune" → Pune belt.
 *  Unmatched warehouses get all of Maharashtra. */
export function nearbyLocationsForWarehouse(name: string, code = ""): { group: string; locations: string[] } {
  const hay = `${name} ${code}`.toLowerCase();
  if (hay.includes("kolhar") || hay.includes("ahmednagar") || hay.includes("nagar"))
    return { group: "Ahmednagar belt (Kolhar warehouse)", locations: [...KOLHAR_NEARBY].sort((a, b) => a.localeCompare(b)) };
  if (hay.includes("pune"))
    return { group: "Pune belt (Pune warehouse)", locations: [...PUNE_NEARBY].sort((a, b) => a.localeCompare(b)) };
  return { group: "All Maharashtra", locations: MAHARASHTRA_LOCATIONS };
}

/** Which warehouse belt serves a customer's city/town — used for location-based
 *  product visibility: a buyer from a Pune-belt town sees the Pune godown's
 *  products, a buyer from the Ahmednagar belt sees Kolhar's. Matched against the
 *  belt location lists (case-insensitive, parenthetical suffixes tolerated —
 *  "Loni" matches "Loni (Ahmednagar)"). Returns null when the location is
 *  outside both belts (rest of Maharashtra — those buyers keep the
 *  default/nearest-warehouse behaviour). */
export function beltOfLocation(city?: string | null): "PUNE" | "KOLHAR" | null {
  const c = (city || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!c) return null;
  const strip = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/\s*\(.*\)\s*/g, "").trim();
  const tryLists = (target: string): "PUNE" | "KOLHAR" | null => {
    if (!target) return null;
    if (PUNE_NEARBY.some((l) => l.toLowerCase() === target) || "pune" === target) return "PUNE";
    if (KOLHAR_NEARBY.some((l) => l.toLowerCase() === target)) return "KOLHAR";
    return null;
  };
  // exact entry first ("shrirampur", "loni (ahmednagar)")
  const direct = tryLists(c);
  if (direct) return direct;
  // parens-stripped second ("loni" → "Loni (Ahmednagar)", "kedgaon (daund)" → "Kedgaon")
  return tryLists(strip(c));
}
