import { createContext, useContext, type ReactNode } from "react";

const OledProtectionContext = createContext(false);

export function OledProtectionProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return <OledProtectionContext.Provider value={active}>{children}</OledProtectionContext.Provider>;
}

export function useOledProtectionActive(): boolean {
  return useContext(OledProtectionContext);
}
