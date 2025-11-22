# Prompt-to-video app (fal.ai)

Minimal Node.js + AlpineJS app that takes a text prompt describing a scene, calls a fal.ai video model, downloads the resulting video, and saves it into the local `outputs/` folder.

## Setup

1. Install dependencies (from `veed-video-app/`):

   ```bash
   npm install
   ```

2. Configure fal.ai:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set:

   - `FAL_API_URL` – the HTTPS endpoint for your fal.ai video model
   - `FAL_API_KEY` – your fal.ai API key

## Run

From `veed-video-app/`:

```bash
npm start
```

Then open:

- http://localhost:3000

Enter a scene description and submit. The server will:

1. Send the prompt to fal.ai (`FAL_API_URL`)
2. Parse the response to find a video URL
3. Download the video into the `outputs/` directory as `video-<timestamp>.mp4`
4. Return a link you can open in the browser (`/outputs/...`)

If fal.ai’s response format differs, adjust the parsing logic in `index.js` (look for `createVideoFromPrompt`).
