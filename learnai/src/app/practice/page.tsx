import { Suspense } from "react";
import Client from "./Client";

export const metadata = { title: "Practice — LearnAI" };

export default function Page() {
  return (
    <Suspense>
      <Client />
    </Suspense>
  );
}
