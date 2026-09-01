import { useState, useEffect } from "react";

export function useActiveIntake() {
  const [activeIntakeId, setActiveIntakeId] = useState(() => {
    return localStorage.getItem("cdi_active_intake_id") || "";
  });

  const setIntakeId = (id) => {
    if (id) {
      localStorage.setItem("cdi_active_intake_id", id);
    } else {
      localStorage.removeItem("cdi_active_intake_id");
    }
    setActiveIntakeId(id);
  };

  return [activeIntakeId, setIntakeId];
}
