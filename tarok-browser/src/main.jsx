import { createRoot } from "react-dom/client";
import { TarokApp } from "./ui/TarokApp.jsx";
import "./ui/styles.css";

createRoot(document.querySelector("#root")).render(<TarokApp />);
