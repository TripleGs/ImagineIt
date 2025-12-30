import { defineConfig } from 'vite';

export default defineConfig({
    // Use relative paths for assets so Electron can load them via file:// protocol
    base: './',
    build: {
        outDir: 'dist',
        emptyDirBeforeBuilding: true,
    }
});
