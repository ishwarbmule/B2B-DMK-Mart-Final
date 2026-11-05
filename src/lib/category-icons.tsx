/**
 * End-level category icons — every EndCategory renders with a meaningful icon
 * (icon on top, category name below) wherever end-level categories appear.
 *
 * Icons are matched from the category name by keyword rules (first match wins),
 * so new end categories get a sensible icon automatically; the fallback keeps
 * unknown names presentable. No DB migration needed.
 */
import type { LucideIcon } from "lucide-react";
import {
  Armchair, Baby, Bath, Boxes, Brush, Bug, Cable, CakeSlice, Candy, Carrot, Citrus,
  Cherry, ChefHat, Coffee, CookingPot, Cog, Container, CupSoda, Cylinder, Droplets,
  Filter, Flame, Flower2, GlassWater, IceCreamCone, Layers, LayoutGrid, Milk,
  Package, Pizza, Popcorn, Salad, Sandwich, ShoppingBasket, ShoppingCart, Shovel,
  Sparkles, Sprout, Tag, Trash2, TreePine, UtensilsCrossed, Wheat,
} from "lucide-react";

/** Ordered rules: [keywords (any match wins), icon]. Specific rules first. */
const RULES: [string[], LucideIcon][] = [
  // ── staff systems / flag-like names first (they hide product words) ──
  [["baby", "walker", "palna"], Baby],
  [["hanging"], Flower2],
  [["garden"], TreePine],
  [["trolley"], ShoppingCart],
  [["bucket mop", "clip mop", "dry mop", "mop", "wiper", "kharta", "broom"], Brush],
  // ── food machines (Goldex & friends) — specific dishes before generic "machine" ──
  [["juicer", "sugarcane", "mango pulp", "orange juicer"], Citrus],
  [["oil maker", "oil pourer", "oil"], Droplets],
  [["pop corn", "popcorn"], Popcorn],
  [["pizza", "oven"], Pizza],
  [["ice gola", "gola"], IceCreamCone],
  [["vegetable", "carrot", "peeler", "slicer"], Carrot],
  [["salad"], Salad],
  [["dry fruit"], Cherry],
  [["candy", "chocolate", "jamun", "ladu", "laddu", "mava", "shrikhand"], Candy],
  [["roti", "chapati", "dough", "aata", "atta", "besan", "flour", "kneader", "sheeter", "fafda", "gathiya", "sev", "samosa", "papad", "namkeen", "farsan", "dhokala", "idli", "halva", "wafer"], Wheat],
  [["grinder", "pulveriser", "pulverizer", "gravy", "mill", "mixer", "masala peti", "musti"], Cog],
  [["fryer", "kadai", "warmer", "bain", "gas range", "chula", "stove", "barbeque", "puffer"], CookingPot],
  [["machine"], Cog],
  // ── seating & furniture ──
  [["stool", "patla", "tipoy", "t-poy", "t poy", "bench"], Armchair],
  [["chair", "armless", " seating"], Armchair],
  [["dining", "dinning", "table", "study"], UtensilsCrossed],
  // ── dining & kitchenware ──
  [["crockery", "hotelware", "hotel", "catering", "serving", "resto", "chinese", "thaali"], UtensilsCrossed],
  [["mug", "cup", "tea", "coffee", "cafe"], Coffee],
  [["hotpot", "soup"], Container],
  [["spice", "masala box"], ChefHat],
  [["bread"], Sandwich],
  [["cake"], CakeSlice],
  [["strainer", "funnel", "filter"], Filter],
  [["dispencer", "dispenser", "soda"], CupSoda],
  [["salad", "fork"], Salad],
  // ── bottles, jars & storage ──
  [["milk"], Milk],
  [["water jar", "fridge bottle", "water bottle", "bottle", "jar", "jug"], GlassWater],
  [["crate"], Boxes],
  [["container", "storageware", "storage", "lock & lock", "lock & seal", "lock and seal", "seal", "drum"], Package],
  // ── cleaning & waste ──
  [["dustbin", "dust bin", "bin", "swing"], Trash2],
  [["dustpan", "dust pan", "supli", "shovel"], Shovel],
  [["scrubber", "sparkle"], Sparkles],
  [["brush", "scrub"], Brush],
  [["clean", "dust", "laundry"], Sparkles],
  [["insect", "mosquito", "bug"], Bug],
  [["bath", "toilet"], Bath],
  [["soap"], Droplets],
  // ── plastic household vessels ──
  [["bucket"], Cylinder],
  [["tub", "ghamala", "ghemela", "handa", "ghagar", "basin"], Container],
  [["funnel"], Filter],
  [["gas lighter"], Flame],
  [["pipe"], Cable],
  // ── garden & planters ──
  [["planter", "jali", "pots", "pot "], Sprout],
  // ── racks, stands & organisers ──
  [["rack", "stand", "drawer", "organizer", "organiser"], Layers],
  [["tray"], Layers],
  [["basket"], ShoppingBasket],
  // ── series / misc named lines ──
  [["series", "collection"], Tag],
  [["general", "others", "other products", "multipurpose", "products", "accessories", "black"], Package],
];

/** Pick a meaningful icon for an end-level category name (falls back to Package). */
export function endCategoryIcon(name: string): LucideIcon {
  const n = (name || "").toLowerCase();
  for (const [keys, icon] of RULES) {
    for (const k of keys) {
      if (n.includes(k)) return icon;
    }
  }
  return Package;
}

/** Icon tile: meaningful icon on top, category name below — used everywhere
 *  end-level categories are browsed (catalog sidebar picker + category strip). */
export function EndCategoryIconTile({
  name,
  active = false,
  onClick,
}: {
  name: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const Icon = endCategoryIcon(name);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={name}
      className={`group flex w-full flex-col items-center gap-1 rounded-xl border px-1 pt-2 pb-1.5 text-center transition ${
        active
          ? "border-yellow-400 bg-yellow-50 shadow-sm"
          : "border-gray-100 bg-white hover:border-yellow-300 hover:bg-yellow-50/50"
      }`}
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
          active ? "bg-yellow-400/30 text-yellow-700" : "bg-gray-50 text-gray-500 group-hover:bg-yellow-100 group-hover:text-yellow-600"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <span className={`line-clamp-2 w-full text-[10px] font-semibold leading-tight ${active ? "text-gray-900" : "text-gray-600"}`}>
        {name}
      </span>
    </button>
  );
}

/** Compact inline icon (no tile) for headers/breadcrumbs of end categories. */
export function EndCategoryIcon({ name, className = "h-3.5 w-3.5" }: { name: string; className?: string }) {
  const Icon = endCategoryIcon(name);
  return <Icon className={className} strokeWidth={1.8} aria-hidden />;
}

// LayoutGrid re-export guard: keeps tree-shaking honest if future rules add grid icons.
export const CATEGORY_ICON_FALLBACK = LayoutGrid;
