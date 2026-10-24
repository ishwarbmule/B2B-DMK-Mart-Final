/**
 * Generate category showcase images for DMK Mart top categories (1024x1024).
 * Consistent style: professional B2B wholesale product photography, bright studio, no text.
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT_DIR = "/home/z/my-project/download/category-images";

const CATS: { file: string; prompt: string }[] = [
  {
    file: "nv-products-feriwala.png",
    prompt:
      "Professional product photography of colorful Indian plastic household goods: storage containers, baskets, jars and tubs neatly arranged in a group, bright clean studio lighting, soft warm beige background, wholesale marketplace catalog style, vibrant colors, no text, high quality, detailed",
  },
  {
    file: "gardening-tools-planters.png",
    prompt:
      "Professional product photography of garden planters and pots with lush green plants, pruning shears and gardening hand tools arranged beside them, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "cleaning-households.png",
    prompt:
      "Professional product photography of household cleaning supplies: spin bucket mop with steel bowl, toilet brushes, floor wiper and dustpan neatly arranged, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "commercial-kitchen-equipments.png",
    prompt:
      "Professional product photography of stainless steel commercial kitchen equipment: flour mill machine, dough kneader and wet grinder, bright clean studio lighting, soft warm beige background, wholesale catalog style, gleaming steel, no text, high quality, detailed",
  },
  {
    file: "furniture.png",
    prompt:
      "Professional product photography of moulded plastic furniture: stackable chairs in red white and blue with a small coffee table, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "household-unbreakable.png",
    prompt:
      "Professional product photography of unbreakable plastic household items: buckets, bath tubs, mugs and basins in bright assorted colors stacked neatly, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "water-jar-bottles.png",
    prompt:
      "Professional product photography of large insulated plastic water jars and stainless steel water bottles with insulated cooler water jug, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "kitchen-ware.png",
    prompt:
      "Professional product photography of insulated hot pot casserole food warmers in white and steel with kitchen slicer tools, bright clean studio lighting, soft warm beige background, wholesale catalog style, no text, high quality, detailed",
  },
  {
    file: "general.png",
    prompt:
      "Professional product photography of assorted wholesale general merchandise: plastic containers, kitchen tools and household goods grouped together, bright clean studio lighting, soft warm beige background, b2b marketplace catalog style, no text, high quality, detailed",
  },
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const zai = await ZAI.create();
  for (const c of CATS) {
    const out = path.join(OUT_DIR, c.file);
    if (fs.existsSync(out) && fs.statSync(out).size > 50_000) {
      console.log(`skip (exists): ${c.file}`);
      continue;
    }
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const res = await zai.images.generations.create({ prompt: c.prompt, size: "1024x1024" });
        const b64 = res?.data?.[0]?.base64;
        if (!b64) throw new Error("empty response");
        fs.writeFileSync(out, Buffer.from(b64, "base64"));
        console.log(`✓ ${c.file} (${Math.round(fs.statSync(out).size / 1024)} KB)`);
        ok = true;
      } catch (e: any) {
        console.error(`✗ attempt ${attempt} ${c.file}: ${e.message}`);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
  }
  console.log("done");
}
main().catch((e) => { console.error(e); process.exit(1); });
