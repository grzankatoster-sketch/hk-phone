import { Bot } from "lucide-react";

// Wspólna ikona maskotki „Agent AI" — zastępuje emoji 🤖 (WYKONANIE 1.17).
// Jedno źródło ikony dla widgetu, dymka, FAB-a i uchwytu bota.
export default function AgentIcon({ size = 18, ...rest }) {
  return <Bot size={size} aria-hidden="true" {...rest} />;
}
