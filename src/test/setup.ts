import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { clearMemoryActiveSnapshots } from "../cache/active-snapshot";

afterEach(() => clearMemoryActiveSnapshots());
