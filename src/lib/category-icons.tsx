/**
 * End-level (leaf) category icons — small keyword-matched Lucide icons used in
 * the header mega panels and the catalog filters. The owner moved icons OFF the
 * top-level header links (those show photos now); the leaf categories get the
 * icons so long plain lists stay scannable.
 */
import {
  Armchair, Axe, Bath, BedDouble, Blinds, BottleWine, Boxes, Briefcase, Brush,
  Cable, Clock, Coffee, Container, CookingPot, DoorOpen, Drill,
  Fan, Fence, Flower2, Footprints, Gamepad2, Gift, Hammer, HardHat, Headphones, Heater,
  Hexagon, KeyRound, LampDesk, Lightbulb, Milk, Package, PaintBucket,
  Puzzle, Ruler, Scissors, Shovel, Sofa, Sparkles, SprayCan, SwatchBook,
  Thermometer, Trash2, Trophy, Tv, Umbrella, Utensils, WashingMachine, Wrench,
  type LucideIcon,
} from "lucide-react";

const RULES: [RegExp, LucideIcon][] = [
  [/basket|dustbin|waste|garbage|\bbin\b/i, Trash2],
  [/bucket|balti|tub|drum|\bcan\b/i, PaintBucket],
  [/bottle|jar|flask|tumbler|sipper/i, BottleWine],
  [/milk|dairy|jug/i, Milk],
  [/glass|cup|mug|tea|coffee/i, Coffee],
  [/cooler|fridge|refrigerat/i, Container],
  [/water|tap|faucet|sink|pipe/i, Cable],
  [/pot|pan|kadai|tawa|cook|kitchenware|kitchen ware/i, CookingPot],
  [/plate|thali|dish|tray|spoon|fork|cutlery|utensil/i, Utensils],
  [/chair|bench|stool/i, Armchair],
  [/sofa|couch|diwan/i, Sofa],
  [/bed|matteress|mattress|palang/i, BedDouble],
  [/table|desk|study/i, LampDesk],
  [/almirah|cupboard|cabinet|shelf|rack|stand/i, Boxes],
  [/furnitur|furniture|home furni/i, Armchair],
  [/clean|broom|brush|wiper|mop|squeegee/i, Brush],
  [/dust|spray|hygiene|sanit/i, SprayCan],
  [/bath|toilet|flush|commode|shower/i, Bath],
  [/garden|plant|nursery|planter|flower pot|gardening/i, Flower2],
  [/tool|hardware|pliers|wrench|spanner|screw/i, Wrench],
  [/hammer|mallet/i, Hammer],
  [/drill|machine|power tool|cutter|blade|\bsaw\b/i, Drill],
  [/scissor|knife|peeler|grater/i, Scissors],
  [/rope|wire|cable|cord|hook|chain/i, Cable],
  [/paint|colour|color|putty|distemper/i, PaintBucket],
  [/electric|switch|socket|plug|bulb|led|light|lamp|torch|battery/i, Lightbulb],
  [/fan|cooling|blower/i, Fan],
  [/heater|geyser|immersion/i, Heater],
  [/wash|laundry|washing|iron\b|press/i, WashingMachine],
  [/toy|game|play|doll|kids/i, Gamepad2],
  [/school|stationery|pen|pencil|note|book|geometry/i, SwatchBook],
  [/bag|luggage|trolley|suitcase/i, Briefcase],
  [/footwear|shoe|slipper|chappal/i, Footprints],
  [/garment|cloth|hanger|dress|apparel|shirt/i, Package],
  [/mattress|cover|sheet|pillow|cushion|curtain|blind/i, Blinds],
  [/clock|watch|timer/i, Clock],
  [/jewel|ornament|bangle|earring|gem/i, Sparkles],
  [/decor|showpiece|gift|trophy|award|candle|agarbatti|puja|festive|diwali/i, Gift],
  [/food|tiffin|lunch|casserole/i, Container],
  [/storage|organiz|organis|box|crate|container/i, Boxes],
  [/mat\b|carpet|dhurrie/i, Hexagon],
  [/umbrella|rain|tarpaulin|silpaulin/i, Umbrella],
  [/ladder|step stool/i, Ruler],
  [/measur|scale|weighing|balance|ruler/i, Ruler],
  [/lock|key|handle|hinge|latch/i, KeyRound],
  [/fitting|cpvc|upvc|pvc/i, Cable],
  [/safety|helmet|gloves|gumboot|industrial/i, HardHat],
  [/sports|fitness|exercise|dumbbell/i, Trophy],
  [/stroller|baby|infant/i, Sparkles],
  [/tv|monitor|speaker|audio|electronic/i, Tv],
  [/mobile|phone|charger|earphone|headset/i, Headphones],
  [/comb|mirror|personal care|cosmetic|cream/i, Brush],
  [/thermo|foam|insulat/i, Thermometer],
  [/stapler|pin|clip|office/i, Puzzle],
  [/shovel|spade|pickaxe|crowbar|hoe|digging/i, Shovel],
  [/axe|felling/i, Axe],
  [/fence|net|mesh|grill/i, Fence],
  [/door|window|vent/i, DoorOpen],
  [/party|balloon|banner|ribbon/i, Sparkles],
];

/** Best-match icon for an end-category name (keyword scan, generic fallback). */
export function endCategoryIcon(name: string): LucideIcon {
  for (const [re, icon] of RULES) if (re.test(name)) return icon;
  return Package;
}

/**
 * EndCategoryIconTile — the tappable leaf-category chip the catalog filters
 * render: keyword icon + short name, yellow when active. Used in the catalog
 * sidebar grid and the horizontal category strip.
 */
export function EndCategoryIconTile({ name, active, onClick }: { name: string; active?: boolean; onClick?: () => void }) {
  const Icon = endCategoryIcon(name);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      title={name}
      className={`flex w-full flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center transition ${
        active ? "border-yellow-400 bg-yellow-50 text-black" : "border-gray-200 bg-white text-gray-600 hover:border-yellow-300"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-yellow-600" : "text-gray-400"}`} aria-hidden />
      <span className="w-full truncate text-[10px] font-semibold leading-tight">{name}</span>
    </button>
  );
}
