import { createMemoryHistory, createRouter } from "vue-router";

import Price from "./views/Price.vue";
import Today from "./views/Today.vue";
import History from "./views/History.vue";

const routes = [
  { path: '/price', component: Price },
  { path: '/today', component: Today },
  { path: '/history', component: History },
]

export const router = createRouter({
  history: createMemoryHistory(),
  routes,
});
