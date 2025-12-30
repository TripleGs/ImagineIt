# ImagineIt (360)

ImagineIt (360) is a minimalist and simple 3D modeling application that uses Electron and Three.js.

## Getting Started

Follow these steps to get the application running from scratch.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- npm (comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository_url>
   cd ImagineIt
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

### Development Mode (Recommended)
Use this mode for active development with hot-reloading.

1. **Terminal 1**: Start the Vite development server.
   ```bash
   npm run dev
   ```

2. **Terminal 2**: Launch the Electron app (it will automatically connect to the dev server).
   ```bash
   npm start
   ```

### Production Mode
Use this mode to test the built application as it would appear to end users.

1. Build the project:
   ```bash
   npm run build
   ```

2. Start the application:
   ```bash
   npm start
   ```
   *(Ensure the dev server from `npm run dev` is stopped, or Electron will try to connect to it instead.)*

---

This code is not to be distributed, modified, or sold commercially in any way shape or form.
