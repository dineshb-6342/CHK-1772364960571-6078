import React, { useEffect, useRef, useState } from "react";
import "./style.css";

const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const recognitionRef = useRef<any>(null);

  const [drawing, setDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("black");
  const [erasing, setErasing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [actions, setActions] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const [text, setText] = useState("");

  const [images, setImages] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);

  /* NEW STATE FOR TEXT INPUT */
  const [manualInput, setManualInput] = useState("");

  /* ---------- canvas setup ---------- */
  useEffect(() => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = currentColor;

    ctxRef.current = ctx;
  }, [currentColor]);

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };

    const rect = canvasRef.current.getBoundingClientRect();

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const saveState = () => {
    if (!canvasRef.current) return;

    setActions(prev => [...prev, canvasRef.current!.toDataURL()]);
    setRedoStack([]);
  };

  const undo = () => {
    if (!actions.length) return;

    const last = actions[actions.length - 1];

    setRedoStack(prev => [...prev, last]);
    setActions(prev => prev.slice(0, -1));

    redrawCanvas(actions.slice(0, -1));
  };

  const redo = () => {
    if (!redoStack.length) return;

    const last = redoStack[redoStack.length - 1];

    setActions(prev => [...prev, last]);
    setRedoStack(prev => prev.slice(0, -1));

    redrawCanvas([...actions, last]);
  };

  const redrawCanvas = (history: string[]) => {
    if (!canvasRef.current || !ctxRef.current) return;

    const ctx = ctxRef.current;

    const img = new Image();
    img.src = history.length ? history[history.length - 1] : "";

    img.onload = () => {
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctx.drawImage(img, 0, 0);
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);

    const pos = getMousePos(e);

    ctxRef.current?.beginPath();
    ctxRef.current?.moveTo(pos.x, pos.y);

    saveState();
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !ctxRef.current) return;

    const ctx = ctxRef.current;
    const pos = getMousePos(e);

    if (erasing) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 20;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 2;
    }

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setDrawing(false);
    ctxRef.current?.beginPath();
  };

  const clearCanvas = () => {
    ctxRef.current?.clearRect(
      0,
      0,
      canvasRef.current?.width || 0,
      canvasRef.current?.height || 0
    );
  };

  /* ---------- media helpers ---------- */

  const fetchImagesFromSentence = (sentence: string) => {

    const cleaned = sentence
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

    const imagePath = `/images/${encodeURI(cleaned)}.jpg`;

    if (!images.includes(imagePath)) {

      const img = new Image();
      img.src = imagePath;

      img.onload = () => setImages(p => [...p, imagePath]);

      img.onerror = () =>
        console.log(`Image not found: ${imagePath}`);
    }
  };

  const fetchVideosFromSentence = (sentence: string) => {

    const cleaned = sentence
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

    const videoPath = `/videos/${encodeURI(cleaned)}.mp4`;

    if (!videos.includes(videoPath)) {

      const video = document.createElement("video");

      video.src = videoPath;

      video.onloadeddata = () =>
        setVideos(p => [...p, videoPath]);

      video.onerror = () =>
        console.log(`Video not found: ${videoPath}`);
    }
  };

  /* ---------- TEXT INPUT FUNCTION (NEW) ---------- */

  const handleManualSubmit = () => {

    if (!manualInput.trim()) return;

    const sentence = manualInput.toLowerCase().trim();

    setText(prev => prev + "\n" + sentence);

    fetchImagesFromSentence(sentence);
    fetchVideosFromSentence(sentence);

    setManualInput("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {

    if (e.key === "Enter") {
      handleManualSubmit();
    }
  };

  /* ---------- speech recognition ---------- */

  const toggleSpeech = () => {

    if (!isSpeaking) {

      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        alert("Speech recognition not supported");
        return;
      }

      const recognition = new SpeechRecognition();

      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsSpeaking(true);

      recognition.onresult = (event: any) => {

        let transcript = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {

          transcript +=
            event.results[i][0].transcript
              .toLowerCase()
              .trim() + " ";
        }

        setText(prev =>
          prev + "\n" + transcript.trim()
        );

        fetchImagesFromSentence(transcript);
        fetchVideosFromSentence(transcript);
      };

      recognition.onend = () => {

        if (isSpeaking) recognition.start();
      };

      recognition.start();

    } else {

      recognitionRef.current?.stop();
      setIsSpeaking(false);
    }
  };

  /* ---------- UI ---------- */

  return (
    <div className="container">

      <div className="canvas-container">

        <canvas
          ref={canvasRef}
          width={800}
          height={500}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
        ></canvas>

        {images.map((img, i) => (
          <img
            key={i}
            src={img}
            alt="Recognized"
            className="overlay-image"
          />
        ))}

        {videos.map((video, i) => (
          <video
            key={i}
            src={video}
            className="overlay-video"
            controls
            autoPlay
          />
        ))}

      </div>

      {/* TRANSCRIPT BOX */}
      <div id="text-container">{text}</div>

      {/* NEW TEXT INPUT BELOW TRANSCRIPT */}
      <div style={{display:"flex",gap:"10px",marginTop:"8px"}}>

        <input
          type="text"
          placeholder="Type topic if speech does not work..."
          value={manualInput}
          onChange={(e)=>setManualInput(e.target.value)}
          onKeyDown={handleKeyPress}
          style={{
            width:"600px",
            padding:"8px",
            border:"1px solid gray",
            borderRadius:"4px"
          }}
        />

        <button
          onClick={handleManualSubmit}
          style={{
            padding:"8px 16px",
            background:"#1a73e8",
            color:"white",
            border:"none",
            borderRadius:"4px",
            cursor:"pointer"
          }}
        >
          Send
        </button>

      </div>

      {/* TOOLBAR */}

      <div className="toolbar">

        <button onClick={()=>setCurrentColor("black")}>🖊</button>

        <button
          onClick={()=>setErasing(!erasing)}
          style={{backgroundColor: erasing ? "#ff0000" : "white"}}
        >
          🧹
        </button>

        <button onClick={clearCanvas}>🗑</button>

        <button
          onClick={toggleSpeech}
          style={{
            backgroundColor: isSpeaking ? "green" : "red"
          }}
        >
          🎤
        </button>

        <button onClick={undo}>↩</button>

        <button onClick={redo}>↪</button>

        <button onClick={()=>setImages([])}>🖼</button>

        <button onClick={()=>setVideos([])}>🎥</button>

      </div>

    </div>
  );
};

export default Whiteboard;