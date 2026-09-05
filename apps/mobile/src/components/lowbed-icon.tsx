import { Image } from "react-native";

const projectHaulArtwork = require("../../assets/icons/project-haul-icon-transparent.png");

/** Retains the supplied silhouette and follows the surrounding navigation color. */
export function LowbedIcon({
  color,
  size = 24,
}: {
  color: string;
  size?: number;
}) {
  const width = size * 1.75;

  return (
    <Image
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      resizeMethod="resize"
      source={projectHaulArtwork}
      style={{ height: width / 3, width, tintColor: color }}
    />
  );
}
