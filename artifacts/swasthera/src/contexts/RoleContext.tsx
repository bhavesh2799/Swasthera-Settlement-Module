import { createContext, useContext, useState, type ReactNode } from "react";

type Role = "maker" | "checker" | "backend";

interface RoleContextType {
  role: Role;
  setRole: (role: Role) => void;
  isMaker: boolean;
  isChecker: boolean;
  isBackend: boolean;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>(() => {
    return (localStorage.getItem("swasthera_role") as Role) || "maker";
  });

  const setRole = (newRole: Role) => {
    localStorage.setItem("swasthera_role", newRole);
    setRoleState(newRole);
  };

  return (
    <RoleContext.Provider value={{
      role,
      setRole,
      isMaker: role === "maker",
      isChecker: role === "checker",
      isBackend: role === "backend",
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
