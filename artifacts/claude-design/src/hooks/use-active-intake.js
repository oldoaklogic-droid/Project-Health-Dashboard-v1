import { useState, useEffect } from "react";

export function useActiveIntake() {
  const [activeIntakeId, setActiveIntakeId] = useState(() => {
    return localStorage.getItem("cdi_active_intake_id") || "";
  });

  useEffect(() => {
    const handleActiveIntakeChange = (event) => {
      setActiveIntakeId(event.detail || "");
    };
    window.addEventListener("cdi-active-intake-change", handleActiveIntakeChange);
    return () => window.removeEventListener("cdi-active-intake-change", handleActiveIntakeChange);
  }, []);

  const setIntakeId = (id) => {
    if (id) {
      localStorage.setItem("cdi_active_intake_id", id);
    } else {
      localStorage.removeItem("cdi_active_intake_id");
    }
    setActiveIntakeId(id);
    window.dispatchEvent(new CustomEvent("cdi-active-intake-change", { detail: id }));
  };

  return [activeIntakeId, setIntakeId];
}
