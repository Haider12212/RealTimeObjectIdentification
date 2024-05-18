import React, { useRef, useState, useEffect, useContext } from "react";
import Webcam from "react-webcam";
import { runModelUtils } from "../utils";
import { Tensor } from "onnxruntime-web";
import { yoloClasses } from "../data/yolo_classes";
import { CheckListContext } from "../utils/CheckListContext";

interface WebcamComponentProps {
  width: number;
  height: number;
  preprocess: (ctx: CanvasRenderingContext2D) => any;
  session: any; // Update with the correct type for session
  postprocess: (
    outputTensor: Tensor,
    inferenceTime: number,
    ctx: CanvasRenderingContext2D
  ) => string | null;
  inferenceTime: number;
  changeModelResolution: () => void;
  modelName: string;
  checklistItems: string[];
}

const WebcamComponent: React.FC<WebcamComponentProps> = (props) => {
  const [inferenceTime, setInferenceTime] = useState<number>(0);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [detectedItems, setDetectedItems] = useState<string[]>([]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<string>("");
  const webcamRef = useRef<Webcam>(null);
  const videoCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const liveDetection = useRef<boolean>(false);
  const [facingMode, setFacingMode] = useState<string>("environment");
  const originalSize = useRef<[number, number]>([0, 0]);
  const { checkList, setCheckList, checkListLength, setCheckListLength } =
    useContext(CheckListContext);

  const updateChecklist = (newItem: string) => {
    if (!checkList.includes(newItem)) {
      setCheckList([...checkList, newItem]);
      setCheckListLength(checkListLength + 1);
    }
  };

  useEffect(() => {
    console.log("Current Checklist Items:", checkList);
  }, [checkList]);

  const runModel = async (ctx: CanvasRenderingContext2D) => {
    const data = props.preprocess(ctx);
    let outputTensor: Tensor;
    let inferenceTime: number;
    [outputTensor, inferenceTime] = await runModelUtils.runModel(
      props.session,
      data
    );
    const detectedItemsI = props.postprocess(outputTensor, inferenceTime, ctx);
    const detectedItems: string[] = [];
    for (let i = 0; i < outputTensor.dims[0]; i++) {
      const [_, __, ___, ____, _____, cls_id, score] = outputTensor.data.slice(
        i * 7,
        i * 7 + 7
      );
      const className = yoloClasses[Number(cls_id)];
      const confidence = Number(score) * 100;
      detectedItems.push(`${className}`);
    }

    console.log("Detected Items:", detectedItems);
    setDetectedItems(detectedItems);

    // Alert the user if a checklist item is detected
    detectedItems.forEach((item) => {
      if (checkList.includes(item)) {
        window.alert(`Detected a checklist item: ${item}`);
      }
    });

    setInferenceTime(inferenceTime);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewItem(e.target.value);
  };

  const handleAddItem = () => {
    var item = newItem.toLowerCase();
    if (item && yoloClasses.includes(item)) {
      if (!checkList.includes(item)) {
        updateChecklist(item);
        setNewItem("");
      } else {
        alert("This object is already in the checklist.");
      }
    } else {
      alert("This object is not allowed.");
    }
  };

  const capture = () => {
    const canvas = videoCanvasRef.current!;
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    })!;

    if (facingMode === "user") {
      context.setTransform(-1, 0, 0, 1, canvas.width, 0);
    }

    context.drawImage(
      webcamRef.current!.video!,
      0,
      0,
      canvas.width,
      canvas.height
    );

    if (facingMode === "user") {
      context.setTransform(1, 0, 0, 1, 0, 0);
    }
    return context;
  };

  const runLiveDetection = async () => {
    if (liveDetection.current) {
      liveDetection.current = false;
      return;
    }
    liveDetection.current = true;

    while (liveDetection.current) {
      const startTime = Date.now();
      const ctx = capture();

      if (!ctx) {
        console.error("Failed to capture context");
        liveDetection.current = false;
        return;
      }

      try {
        await runModel(ctx);
      } catch (error) {
        console.error("Error in runModel:", error);
        liveDetection.current = false;
        return;
      }

      setTotalTime(Date.now() - startTime);

      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve())
      );
    }
  };

  const processImage = async () => {
    reset();
    const ctx = capture();
    if (!ctx) return;

    const boxCtx = document
      .createElement("canvas")
      .getContext("2d") as CanvasRenderingContext2D;
    boxCtx.canvas.width = ctx.canvas.width;
    boxCtx.canvas.height = ctx.canvas.height;
    boxCtx.drawImage(ctx.canvas, 0, 0);

    await runModel(boxCtx);
    ctx.drawImage(boxCtx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  };

  const reset = async () => {
    var context = videoCanvasRef.current!.getContext("2d")!;
    context.clearRect(0, 0, originalSize.current[0], originalSize.current[1]);
    liveDetection.current = false;
    setDetectedItems([]);
    setInferenceTime(0);
    setTotalTime(0);
    setCheckList([]);
    setUploadedImage(null);
    startWebcam();
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target?.result as string);
        stopWebcam();
      };
      reader.readAsDataURL(file);
    }
  };

  const processUploadedImage = async () => {
    if (!uploadedImage) return;
    const img = new Image();
    img.src = uploadedImage;
    img.onload = async () => {
      const canvas = imageCanvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      canvas.width = videoCanvasRef.current!.width;
      canvas.height = videoCanvasRef.current!.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      await runModel(ctx);
    };
  };

  const stopWebcam = () => {
    const stream = webcamRef.current?.video?.srcObject as MediaStream;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  };

  const startWebcam = () => {
    webcamRef.current?.video?.play();
  };

  const [SSR, setSSR] = useState<boolean>(true);

  const setWebcamCanvasOverlaySize = () => {
    const element = webcamRef.current!.video!;
    if (!element) return;
    var w = element.offsetWidth;
    var h = element.offsetHeight;
    var cv = videoCanvasRef.current;
    if (!cv) return;
    cv.width = w;
    cv.height = h;
    var imgCv = imageCanvasRef.current;
    if (!imgCv) return;
    imgCv.width = w;
    imgCv.height = h;
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        liveDetection.current = false;
      }
      setSSR(document.hidden);
    };
    setSSR(document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  if (SSR) {
    return <div>Loading...</div>;
  }

  return (
    <div className="flex flex-row flex-wrap justify-evenly align-center w-full">
      <div
        id="webcam-container"
        className="flex items-center justify-center webcam-container"
        style={{ position: "relative" }}
      >
        <Webcam
          mirrored={facingMode === "user"}
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          imageSmoothing={true}
          videoConstraints={{ facingMode: facingMode }}
          onLoadedMetadata={() => {
            setWebcamCanvasOverlaySize();
            originalSize.current = [
              webcamRef.current!.video!.offsetWidth,
              webcamRef.current!.video!.offsetHeight,
            ] as [number, number];
          }}
          forceScreenshotSourceSize={true}
          style={{ position: "relative", zIndex: 1 }}
        />
        <canvas
          id="cv1"
          ref={videoCanvasRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: uploadedImage ? 1 : 2,
          }}
        ></canvas>
        {uploadedImage && (
          <canvas
            id="cv2"
            ref={imageCanvasRef}
            style={{ position: "absolute", top: 0, left: 0, zIndex: 3 }}
          ></canvas>
        )}
      </div>
      <div className="flex flex-col justify-center items-center">
        <div className="flex gap-1 flex-row flex-wrap justify-center items-center m-5">
          <div className="flex gap-1 justify-center items-center items-stretch">
            <button
              onClick={async () => {
                const startTime = Date.now();
                await processImage();
                setTotalTime(Date.now() - startTime);
              }}
              className="p-2 border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Capture Photo
            </button>
            <button
              onClick={async () => {
                if (liveDetection.current) {
                  liveDetection.current = false;
                } else {
                  runLiveDetection();
                }
              }}
              className={`p-2 border-dashed border-2 rounded-xl hover:translate-y-1 ${
                liveDetection.current ? "bg-white text-black" : ""
              }`}
            >
              Live Detection
            </button>
          </div>
          <div className="flex gap-1 justify-center items-center items-stretch">
            <button
              onClick={() => {
                reset();
                setFacingMode(facingMode === "user" ? "environment" : "user");
              }}
              className="p-2 border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Switch Camera
            </button>
            <button
              onClick={() => {
                reset();
                props.changeModelResolution();
              }}
              className="p-2 border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Change Model
            </button>
            <button
              onClick={reset}
              className="p-2 border-dashed border-2 rounded-xl hover:translate-y-1 "
            >
              Reset
            </button>
          </div>
        </div>
        <div>Using {props.modelName}</div>
        <div className="flex gap-3 flex-row flex-wrap justify-between items-center px-5 w-full">
          <div>
            {"Model Inference Time: " + inferenceTime.toFixed() + "ms"}
            <br />
            {"Total Time: " + totalTime.toFixed() + "ms"}
            <br />
            {"Overhead Time: +" + (totalTime - inferenceTime).toFixed(2) + "ms"}
          </div>
          <div>
            <div>
              {"Model FPS: " + (1000 / inferenceTime).toFixed(2) + "fps"}
            </div>
            <div>{"Total FPS: " + (1000 / totalTime).toFixed(2) + "fps"}</div>
            <div>
              {"Overhead FPS: " +
                (1000 * (1 / totalTime - 1 / inferenceTime)).toFixed(2) +
                "fps"}
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center items-center">
          <h2>Checklist</h2>
          <ul>
            {Array.isArray(props.checklistItems) &&
              props.checklistItems.map((item, index) => (
                <li
                  key={index}
                  style={{
                    textDecoration: detectedItems.includes(item)
                      ? "line-through"
                      : "none",
                    color: detectedItems.includes(item) ? "red" : "inherit",
                  }}
                >
                  {item}
                </li>
              ))}
          </ul>
        </div>
        <div className="flex items-center">
          <input
            type="text"
            value={newItem}
            onChange={handleChange}
            placeholder="Add checklist item"
            className="mr-2 px-3 py-2 border rounded-lg text-neutral-200 border-gray-300 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddItem}
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Add Item
          </button>
        </div>
        <div className="flex flex-col items-center mt-4">
          <input type="file" accept="image/*" onChange={handleImageUpload} />
          {uploadedImage && (
            <button
              onClick={processUploadedImage}
              className="mt-2 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded z-50"
            >
              Process Uploaded Image
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WebcamComponent;
