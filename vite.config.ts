import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  preview: {
    host: "0.0.0.0",
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "healthcheck.railway.app",
      ".railway.app",
      ".up.railway.app"
    ],
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    // Substituir process.env durante o build
    'process.env': process.env,
    // Definir variáveis de ambiente específicas
    __NEON_DATABASE_URL__: JSON.stringify(process.env.NEON_DATABASE_URL),
    __SUPABASE_URL__: JSON.stringify(process.env.SUPABASE_URL),
    __SUPABASE_ANON_KEY__: JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
  build: {
    rollupOptions: {
      external: ['pg'], // Excluir pg do bundle do frontend
    },
  },
}));
