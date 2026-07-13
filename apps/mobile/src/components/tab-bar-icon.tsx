import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type TabBarIconProps = {
  color: string;
  focused: boolean;
  name: IoniconName;
  size?: number;
};

export function TabBarIcon({ color, focused, name, size = 24 }: TabBarIconProps) {
  return <Ionicons name={name} size={focused ? size + 1 : size} color={color} />;
}
