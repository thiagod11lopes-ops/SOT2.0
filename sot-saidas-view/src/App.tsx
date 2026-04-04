import { Navigate, Route, Routes } from "react-router-dom";
import { SaidasLayout } from "./components/saidas-layout";
import { SaidasPage } from "./components/saidas-page";

export function App() {
  return (
    <Routes>
      <Route element={<SaidasLayout />}>
        <Route index element={<Navigate to="/administrativas" replace />} />
        <Route path="administrativas" element={<SaidasPage tipo="Administrativa" />} />
        <Route path="ambulancia" element={<SaidasPage tipo="Ambulância" />} />
      </Route>
    </Routes>
  );
}
