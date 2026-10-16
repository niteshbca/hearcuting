import { Suspense } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
