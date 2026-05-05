import { createContext, useContext } from "react";

export const ColumnContext = createContext(undefined);
export const CardContext = createContext(undefined);

export const useColumnContext = () => {
	const context = useContext(ColumnContext);
	if (!context) {
		throw new Error("useColumnContext must be used within a ColumnProvider");
	}
	return context;
};

export const useCardContext = () => {
	const context = useContext(CardContext);
	if (!context) {
		throw new Error("useCardContext must be used within a CardProvider");
	}
	return context;
};
