"use client";

import { createAuthClient } from "better-auth/react";

// Same-origin cookies only. Tokens and credentials are never saved in browser storage.
export const authClient = createAuthClient({ basePath: "/api/auth" });
