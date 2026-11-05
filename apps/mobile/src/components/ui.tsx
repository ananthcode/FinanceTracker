import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";

/** Small shared building blocks for Android forms and lists (R2/R3 screens). */

export const inputStyle = { borderWidth: 1, borderColor: "#E5E4DD", borderRadius: 8, padding: 10, fontSize: 16 } as const;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontWeight: "600" }}>{label}</Text>
      {children}
    </View>
  );
}

export function LabeledInput({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <Field label={label}>
      <TextInput accessibilityLabel={label} {...props} style={[inputStyle, props.style]} />
    </Field>
  );
}

export function TextLink({ label, onPress, a11y }: { label: string; onPress: () => void; a11y?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} hitSlop={8}>
      <Text style={{ color: "#534AB7", fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

/** Mutually exclusive choices as accessible radio chips. */
export function Choice<T extends string | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(o.value)}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? "#534AB7" : "#E5E4DD" }}
          >
            <Text style={{ fontWeight: on ? "700" : "400" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" style={{ color: "#cf222e" }}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={{ color: "#5F5E5A" }}>{children}</Text>;
}
