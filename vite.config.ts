/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'sandbox-api',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/generate-component' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const componentType = data.type || 'atoms'; // atoms, molecules, etc.
                const componentName = data.name || 'NewComponent';
                const componentCode = data.code || '';

                const basePath = path.resolve(process.cwd(), 'src/02_components', componentType, componentName);
                fs.mkdirSync(basePath, { recursive: true });
                
                // Generate the main component file
                fs.writeFileSync(path.join(basePath, `${componentName}.tsx`), componentCode);
                
                // Optionally generate an empty index.ts or a story file if needed
                // fs.writeFileSync(path.join(basePath, 'index.ts'), `export * from './${componentName}';\n`);

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, path: basePath }));
              } catch (e) {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 500;
                res.end(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }));
              }
            });
            return;
          }
          next();
        });
      }
    }
  ],
  server: {
    watch: {
      ignored: ['**/.nx/**'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/04_validation/setup.ts'],
    exclude: ['node_modules/**', '.claude/**'],
    server: {
      deps: {
        inline: [/@csstools/, /@asamuzakjp/],
      },
    },
  },
})
