import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
// Side-effect only: registers Chart.js's controllers/elements/scales and our
// shared custom plugins once, regardless of which chart mounts first.
import "./components/charts/chartSetup";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
