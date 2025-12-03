// app/index.js
import { Redirect } from "expo-router";

export default function Index() {
  // Como tu login está en app/(auth)/login.js la ruta es esta:
  return <Redirect href="/(auth)/login" />;
}
