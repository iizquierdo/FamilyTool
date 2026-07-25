import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  // Hosts permitted by the dev/preview server. Vite 5+ blocks anything other than
  // localhost by default (DNS-rebinding defense). On Railway/Vercel/etc. set
  // VITE_ALLOWED_HOSTS to a comma list, or leave empty to allow all hosts.
  const allowedHostsEnv = env.VITE_ALLOWED_HOSTS?.trim();
  const allowedHosts = allowedHostsEnv
    ? allowedHostsEnv.split(',').map((h) => h.trim()).filter(Boolean)
    : true;

  return {
    base: env.VITE_BASE_URL || '/',
    server: {
      port: Number(env.VITE_PORT || 3509),
      host: '0.0.0.0',
      allowedHosts,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
        '/storage': { target: apiTarget, changeOrigin: true }
      }
    },
    preview: {
      port: Number(env.PORT || env.VITE_PORT || 3509),
      host: '0.0.0.0',
      allowedHosts
    },
    build: {
      chunkSizeWarningLimit: 3000
    },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@modules': path.resolve(__dirname, '..', '..', 'modules'),
        // Modules occasionally pull a shared UI piece (e.g. FileManager) from the web app.
        // Expose it via this alias so the coupling is explicit instead of brittle ../../../ paths.
        '@webapp': path.resolve(__dirname, 'src')
      }
    }
  };
});
