import React, { useEffect, useRef, useState } from "react";
import "./style.css";
import { io, Socket } from "socket.io-client";
import QRCode from "qrcode";

// Props interface for Whiteboard component
interface WhiteboardProps {
  showDoubts?: boolean;
  setShowDoubts?: (show: boolean) => void;
  onUnreadChange?: (count: number) => void;
}

// Profanity filter - list of common inappropriate words
const inappropriateWords = [
  "fuck", "shit", "ass", "bitch", "damn", "hell", "crap",
  "bastard", "cunt", "dick", "piss", "cock", "whore",
  "stupid", "idiot", "dumb", "loser", "hate", "kill"
];

// Filter function to replace inappropriate words with '****'
const filterProfanity = (text: string): string => {
  let filtered = text;
  inappropriateWords.forEach(word => {
    const regex = new RegExp(word, "gi");
    filtered = filtered.replace(regex, "****");
  });
  return filtered;
};

// Audio notification sound
const DING_SOUND = "https://cdn.freesound.org/previews/316/316847_4939433-lq.mp3";

const Whiteboard: React.FC<WhiteboardProps> = ({ showDoubts = false, setShowDoubts, onUnreadChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const recognitionRef = useRef<any>(null);
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // Doubt System State
  const [doubts, setDoubts] = useState<{ id: number; studentName: string; doubt: string; timestamp: string }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDoubtPanel, setShowDoubtPanel] = useState(showDoubts);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [serverUrl, setServerUrl] = useState("");

  // Sync with props when they change
  useEffect(() => {
    setShowDoubtPanel(showDoubts);
  }, [showDoubts]);

  // Notify parent when unread count changes
  useEffect(() => {
    if (onUnreadChange) {
      onUnreadChange(unreadCount);
    }
  }, [unreadCount, onUnreadChange]);

  // Get server URL for QR code
  useEffect(() => {
    // Get the current host (works for both localhost and network IP)
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const port = "3001";
    const url = `${protocol}//${host}:${port}`;
    setServerUrl(url);
    
    // Generate QR code for student join link
    const studentJoinUrl = `${url}/join/class123`;
    QRCode.toDataURL(studentJoinUrl, {
      width: 150,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff"
      }
    }).then((dataUrl: string) => {
      setQrCodeUrl(dataUrl);
    }).catch((err: Error) => {
      console.error("QR Code generation error:", err);
    });
  }, []);

  // Socket.io connection
  useEffect(() => {
    // Determine the correct server URL
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const serverAddress = `${protocol}//${host}:3001`;

    // Initialize socket connection
    socketRef.current = io(serverAddress, {
      transports: ["websocket", "polling"]
    });

    const socket = socketRef.current;

    // Join the class123 room as teacher
    socket.emit("join_room", { roomId: "class123", role: "teacher" });

    // Listen for existing doubts
    socket.on("load_doubts", (existingDoubts: any[]) => {
      setDoubts(existingDoubts);
      setUnreadCount(existingDoubts.length);
    });

    // Listen for new doubts
    socket.on("receive_doubt", (doubt: { id: number; studentName: string; doubt: string; timestamp: string }) => {
      // Apply profanity filter
      const filteredDoubt = {
        ...doubt,
        doubt: filterProfanity(doubt.doubt)
      };
      
      setDoubts(prev => [filteredDoubt, ...prev]);
      
      // Increment unread count
      setUnreadCount(prev => prev + 1);
      
      // Play notification sound
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log("Audio play failed:", e));
      }
    });

    // Handle doubts cleared
    socket.on("doubts_cleared", () => {
      setDoubts([]);
      setUnreadCount(0);
    });

    socket.on("connect", () => {
      console.log("Connected to doubt server");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from doubt server");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Play notification sound function
  const playDingSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log("Audio play error:", e));
    }
  };

  // Handle doubt panel toggle
  const toggleDoubtPanel = () => {
    const newValue = !showDoubtPanel;
    setShowDoubtPanel(newValue);
    if (setShowDoubts) {
      setShowDoubts(newValue);
    }
    if (!showDoubtPanel) {
      setUnreadCount(0); // Reset unread count when opening
    }
  };

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
      {/* Audio element for notification sound */}
      <audio ref={audioRef} src={DING_SOUND} preload="auto" />

      {/* Sliding Doubt Panel */}
      <div 
        className={`doubt-panel ${showDoubtPanel ? "open" : ""}`}
        style={{
          position: "fixed",
          right: showDoubtPanel ? "0" : "-350px",
          top: "0",
          width: "350px",
          height: "100vh",
          background: "rgba(26, 26, 26, 0.95)",
          backdropFilter: "blur(15px)",
          borderLeft: "1px solid rgba(0, 255, 136, 0.3)",
          zIndex: 999,
          transition: "right 0.3s ease-in-out",
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          overflow: "hidden"
        }}
      >
        {/* Panel Header */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          borderBottom: "1px solid rgba(0, 255, 136, 0.3)",
          paddingBottom: "15px"
        }}>
          <h2 style={{ color: "#00ff88", margin: 0 }}>📚 Student Doubts</h2>
          <button 
            onClick={toggleDoubtPanel}
            style={{
              background: "transparent",
              border: "none",
              color: "#fff",
              fontSize: "24px",
              cursor: "pointer"
            }}
          >
            ✕
          </button>
        </div>

        {/* QR Code Section */}
        <div style={{
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: "10px",
          padding: "15px",
          marginBottom: "20px",
          textAlign: "center"
        }}>
          <p style={{ color: "#00ff88", marginBottom: "10px", fontSize: "14px" }}>
            📱 Scan to Join
          </p>
          {qrCodeUrl && (
            <img 
              src={qrCodeUrl} 
              alt="QR Code" 
              style={{ width: "150px", height: "150px", borderRadius: "8px" }}
            />
          )}
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", marginTop: "8px", wordBreak: "break-all" }}>
            {serverUrl}/join/class123
          </p>
        </div>

        {/* Clear Button */}
        <button 
          onClick={() => {
            if (socketRef.current) {
              socketRef.current.emit("clear_doubts", { roomId: "class123" });
            }
          }}
          style={{
            background: "linear-gradient(135deg, #ff6b6b, #ee5a5a)",
            color: "white",
            border: "none",
            padding: "10px",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "15px",
            fontWeight: "500"
          }}
        >
          🗑 Clear All Doubts
        </button>

        {/* Doubt List */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          paddingRight: "5px"
        }}>
          {doubts.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", marginTop: "40px" }}>
              No doubts yet. Students can submit questions once they join!
            </p>
          ) : (
            doubts.map((doubt) => (
              <div 
                key={doubt.id}
                className="doubt-card"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  borderRadius: "12px",
                  padding: "15px",
                  marginBottom: "12px",
                  animation: "fadeIn 0.5s ease"
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px"
                }}>
                  <span style={{ color: "#00ff88", fontWeight: "600", fontSize: "13px" }}>
                    {doubt.studentName}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>
                    {doubt.timestamp}
                  </span>
                </div>
                <p style={{ color: "rgba(255,255,255,0.9)", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
                  {doubt.doubt}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

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