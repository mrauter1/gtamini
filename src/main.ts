import { mountApp } from "./app";
import "./style.css";

const app = document.querySelector<HTMLElement>("#app");

if (!app) {
  throw new Error("Root element #app was not found.");
}

mountApp(app);
