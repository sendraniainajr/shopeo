import { Suspense } from "react";
import Shopeo from "../../components/Shopeo";
export default function Page() {
  return (
    <Suspense
      fallback={<div className="loading-page">Chargement de Shopeo…</div>}
    >
      <Shopeo />
    </Suspense>
  );
}
