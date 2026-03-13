# Bitruvian Rig Builder

A clean, modern posing and rigging application for character animation.

## Features

- **Clean Architecture**: Organized component structure with separation of concerns
- **Modular Design**: Custom hooks for state management
- **TypeScript**: Full type safety throughout
- **Modern UI**: Responsive controls and canvas interface

## Development

**Prerequisites:** Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

## Project Structure

```
src/
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── mannequin/      # Mannequin-related components
│   ├── controls/       # Control panels and inputs
│   └── layout/         # Layout components
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── types/              # TypeScript definitions
└── constants/          # Constants and configuration
```

## Key Components

- **App.tsx**: Main application component with clean structure
- **MannequinCanvas**: Canvas rendering for the character model
- **ControlPanel**: UI controls for posing and settings
- **Custom Hooks**: Modular state management for poses, selections, and workspace
