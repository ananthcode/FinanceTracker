import { Text } from "react-native";
import { Screen } from "@/components/Screen";

/** FR-019a / FR-036a: the build's configuration is invalid or points at another environment. */
export default function ConfigErrorScreen() {
  return (
    <Screen title="Configuration error">
      <Text>
        This app is set up for a different environment or its configuration is invalid, so it has stopped to
        protect your data. Please contact the owner.
      </Text>
    </Screen>
  );
}
