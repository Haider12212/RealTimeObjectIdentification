import Head from "next/head";
import Yolo from "../components/models/Yolo";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CheckListProvider } from "../utils/CheckListContext";

export default function Home() {
  return (
    <>
    <CheckListProvider>
    <main className="font-mono flex flex-col justify-center items-center  w-screen">
        <h1 className="m-5 text-xl font-bold">Real-Time Object Detection</h1>
        <Yolo />
        
      </main>
    </CheckListProvider>
      
    </>
  );
}
