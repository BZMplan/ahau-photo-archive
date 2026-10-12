import { CatalogPage } from "@/components/admin/catalog-page";
export const metadata = { title: "标签管理" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export default function TagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CatalogPage kind="tags" searchParams={searchParams} />;
}
