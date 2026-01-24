# Academic Literature Search - Frontend

Modern Next.js frontend for searching academic papers.

## Features

- 🔍 Search across OpenAlex, arXiv, and Semantic Scholar
- ⚡ Real-time search with loading states
- 🎨 Beautiful UI with TailwindCSS
- 🌙 Dark mode support
- 📱 Fully responsive design
- 🔗 Direct links to papers and PDFs
- 📊 Citation counts and metadata display

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment variables:**
   - Already configured in `.env.local` with your API URL
   - Update if you change AWS endpoints

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Open browser:**
   - Navigate to http://localhost:3000

## Production Build

```bash
npm run build
npm start
```

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **API:** AWS Lambda + API Gateway

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main search page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── SearchBar.tsx     # Search input component
│   ├── PaperCard.tsx     # Paper display card
│   └── LoadingSpinner.tsx # Loading indicator
└── types/
    └── paper.ts          # TypeScript interfaces
```

## Deployment Options

### Vercel (Recommended)
1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy automatically

### AWS Amplify
1. Connect GitHub repository
2. Configure build settings
3. Add environment variables
4. Deploy

### Static Export
```bash
npm run build
# Deploy the 'out' folder to any static host
```
