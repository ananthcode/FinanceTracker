import { Pressable, Text } from "react-native";

/** Simple accessible button used across Android screens. */
export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "outline";
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: primary ? "#1f6feb" : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: "#d0d7de",
        padding: 12,
        borderRadius: 8,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: primary ? "white" : undefined, textAlign: "center", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
