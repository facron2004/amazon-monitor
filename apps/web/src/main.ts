import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./styles/base.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./styles/responsive.css";
import "./styles/theme-overrides.css";
import "./styles/auth.css";
import "./styles/dashboard.css";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
