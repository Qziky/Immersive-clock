import { useLayoutEffect } from "react";

import type { OledScreenReadout } from "../services/oledProtectionRuntime";
import {
  clearOledScreenReadout,
  publishOledScreenReadout,
} from "../services/oledProtectionRuntime";

export function useOledScreenReadout(readout: OledScreenReadout): void {
  const { mode, status, value } = readout;

  useLayoutEffect(() => {
    publishOledScreenReadout({ mode, status, value });
    return () => clearOledScreenReadout(mode);
  }, [mode, status, value]);
}
