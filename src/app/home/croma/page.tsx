import { getVariantData } from "@/lib/variant-data";
import { CromaHome } from "@/components/dmk/variants/croma-home";

export const metadata = { title: "DMK Mart — Croma-style Homepage" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getVariantData();
  return <CromaHome data={data} />;
}
