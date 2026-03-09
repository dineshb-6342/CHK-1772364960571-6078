import React, { useState } from "react";
import "./style.css";
import Whiteboard from "./Whiteboard";
const App: React.FC = () => {
  const [activeComponent, setActiveComponent] = useState<"whiteboard">("whiteboard");

  return (
    <div className="container">
      <h1>AI Smart Board</h1>
      <div className="nav-buttons">
        <button onClick={() => setActiveComponent("whiteboard")}>Whiteboard</button>
      </div>
      <div className="content">
        {activeComponent === "whiteboard" && <Whiteboard />}
      </div>
    </div>
  );
};

export default App;
