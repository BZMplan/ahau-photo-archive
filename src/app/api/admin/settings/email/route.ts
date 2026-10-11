import { requireAdmin } from "@/server/auth/admin";
import {
  accountSettingsErrorResponse,
  readSettingsBody,
} from "@/server/api/account-response";
import { changeOwnEmail } from "@/server/services/admin-account";
import { assertTrustedOrigin } from "@/server/security/origin";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertTrustedOrigin(request);
    const admin = await requireAdmin(request.headers);
    return Response.json(
      {
        data: await changeOwnEmail(
          admin,
          request.headers,
          await readSettingsBody(request),
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return accountSettingsErrorResponse(error);
  }
}
