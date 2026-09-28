import { Suspense } from "react";
import Client from "./Client";

export const metadata = { title: "Tests — LearnAI" };

export default function Page() {
  return (
    <Suspense>
      <Client />
    </Suspense>
  );
}
