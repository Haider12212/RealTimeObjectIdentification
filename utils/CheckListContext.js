'use client';
import { exp } from 'ndarray-ops';
import {createContext, useState, useEffect } from 'react';

export const CheckListContext = createContext();

export const CheckListProvider = ({children}) => {
    const [checkList, setCheckList] = useState([]);
    const [checkListLength, setCheckListLength] = useState(0);

    useEffect(() => {
        setCheckListLength(checkList.length);
    }, [checkList]);

    return (
        <CheckListContext.Provider value={{checkList, setCheckList, checkListLength, setCheckListLength}}>
            {children}
        </CheckListContext.Provider>
    );
}