import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4099';
  const allowedHostsEnv = env.VITE_ALLOWED_HOSTS?.trim();
  const allowedHosts = allowedHostsEnv
    ? allowedHostsEnv.split(',').map((h) => h.trim()).filter(Boolean)
    : true;

  return {
    base: env.VITE_BASE_URL || '/',
    server: {
      port: Number(env.VITE_PORT || 3699),
      host: '0.0.0.0',
      allowedHosts,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/storage': { target: apiTarget, changeOrigin: true }
      }
    },
    preview: { port: Number(env.PORT || env.VITE_PORT || 3699), host: '0.0.0.0', allowedHosts },
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
  };
});
