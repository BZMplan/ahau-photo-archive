import { CatalogPage } from "@/components/admin/catalog-page";
export const metadata = { title: "地点管理" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CatalogPage kind="locations" searchParams={searchParams} />;
}
