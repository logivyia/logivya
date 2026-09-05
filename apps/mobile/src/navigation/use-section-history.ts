import { useCallback, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

/** Local module tabs consume one back step before the outer navigator does. */
export function useSectionHistory<T extends string>(initial: T, enabled = true) {
  const [value, setValue] = useState(initial);
  const history = useRef<T[]>([initial]);
  const select = useCallback((next: T) => {
    if (history.current.at(-1) === next) return;
    history.current.push(next);
    setValue(next);
  }, []);
  const back = useCallback(() => {
    if (!enabled || history.current.length < 2) return false;
    history.current.pop(); setValue(history.current.at(-1)!); return true;
  }, [enabled]);
  useFocusEffect(useCallback(() => { const listener = BackHandler.addEventListener("hardwareBackPress", back); return () => listener.remove(); }, [back]));
  return [value, select, back, history.current.length > 1] as const;
}
