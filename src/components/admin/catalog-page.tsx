import { CatalogManagement } from "@/components/admin/catalog-management";
import { requireAdminPage } from "@/server/auth/pages";
import { CatalogService } from "@/server/services/catalog";
import { catalogAdminQuerySchema } from "@/lib/validations/catalog";
import type { CatalogKind } from "@/types/catalog";

export async function CatalogPage({
  kind,
  searchParams,
}: {
  kind: CatalogKind;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();
  const input = await searchParams;
  const parsed = catalogAdminQuerySchema.safeParse({
    q: input.q,
    page: input.page,
  });
  const query = parsed.success ? parsed.data : { q: "", page: 1 };
  return (
    <CatalogManagement
      kind={kind}
      data={new CatalogService().list(kind, query)}
      query={query.q}
    />
  );
}
