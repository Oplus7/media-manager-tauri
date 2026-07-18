import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Import styles
import "./styles/variables.css";
import "./styles/global.css";
import "./styles/modal.css";
import "./styles/library.css";
import "./styles/player.css";
import "./styles/taginput.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);