import { createContext } from "react";

// A bottom tab bar consumes the system inset itself. Auth screens, sidebars
// and screens without that bar must continue protecting their bottom edge.
export const ScreenBottomInsetContext = createContext(false);
