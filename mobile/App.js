import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TruePositive</Text>
      <Text style={styles.subtitle}>Mobile app — not scheduled yet, see docs/SPRINT_PLAN.md</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F1219",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#E8EAED",
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 8,
  },
  subtitle: {
    color: "#9CA3AF",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
