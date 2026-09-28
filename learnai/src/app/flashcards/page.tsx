import { Suspense } from "react";
import Client from "./Client";

export const metadata = { title: "Flashcards — LearnAI" };

export default function Page() {
  return (
    <Suspense>
      <Client />
    </Suspense>
  );
}
