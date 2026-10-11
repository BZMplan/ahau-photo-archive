import { loadEnvConfig } from "@next/env";
import { openDatabase } from "../db/connection";
import { readAuthEnvironment } from "./environment";
import { createArchiveAuth } from "./options";

// Official CLI entry point; never imported by a route or executed at server startup.
loadEnvConfig(process.cwd());
export const auth = createArchiveAuth(openDatabase().db, readAuthEnvironment());
