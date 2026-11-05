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
        backgroundColor: primary ? "#534AB7" : "#FFFFFF",
        borderWidth: primary ? 0 : 1,
        borderColor: "#E5E4DD",
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: 16,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ color: primary ? "white" : "#3C3489", textAlign: "center", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}
