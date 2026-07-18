import DefaultTheme from "vitepress/theme";
import TutorialTabs from "./TutorialTabs.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("TutorialTabs", TutorialTabs);
  },
};
