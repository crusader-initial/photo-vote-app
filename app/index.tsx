import { Redirect } from "expo-router";

export default function IndexScreen() {
  return <Redirect href={"/vote-flow" as import("expo-router").Href} />;
}
