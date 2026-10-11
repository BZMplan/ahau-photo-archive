import { vi } from "vitest";
// Only tests replace the server-only sentinel; production retains the import boundary.
vi.mock("server-only", () => ({}));
