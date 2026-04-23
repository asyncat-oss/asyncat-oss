import { createContext, useContext } from "react";

const ColumnContext = createContext(undefined);

export const useColumnContext = () => {
  const context = useContext(ColumnContext);
  if (!context) {
    throw new Error("useColumnContext must be used within a ColumnProvider");
  }
  return context;
};

export default ColumnContext;
