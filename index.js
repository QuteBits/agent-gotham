require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { fal } = require('@fal-ai/client');

console.log(fal)
fal.config({
  credentials: fs.readFileSync('./config.txt', 'utf8')
});

const app = express();
const PORT = process.env.PORT || 3000;

const OUTPUT_DIR = path.join(__dirname, 'outputs');

// Ensure outputs directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

app.use(express.json());

// Serve static frontend and generated videos
app.use(express.static(path.join(__dirname, 'public')));
app.use('/outputs', express.static(OUTPUT_DIR));

// --- fal.ai client helpers ---

const FAL_API_KEY = process.env.FAL_API_KEY;

// Text-to-image model (first frame), defaulting to nano-banana
// See: https://docs.fal.ai/model-apis/guides/generate-images-from-text
const FAL_IMAGE_MODEL_URL =
  process.env.FAL_IMAGE_MODEL_URL || 'https://fal.run/fal-ai/nano-banana';

// Image-to-video model (final video), defaulting to WAN 2.5
// See: https://docs.fal.ai/model-apis/guides/generate-videos-from-image
const FAL_VIDEO_MODEL_URL =
  process.env.FAL_VIDEO_MODEL_URL || 'https://fal.run/minimax-video/image-to-video';

async function createImageFromPrompt(prompt) {
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY is not set. Please configure it in your .env file.');
  }

  const response = await fetch(FAL_IMAGE_MODEL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    // Body shape approximated from fal.ai docs; adjust if needed for your model
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`fal.ai image request failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();

  const imageUrl =
    (data.image && data.image.url) ||
    (Array.isArray(data.images) &&
      data.images[0] &&
      (data.images[0].url || data.images[0].image_url)) ||
    data.url ||
    (data.output && Array.isArray(data.output) && data.output[0] && data.output[0].url);

  if (!imageUrl) {
    console.error('Unexpected fal.ai image response:', JSON.stringify(data, null, 2));
    throw new Error('Could not find image URL in fal.ai image response. Please adjust parsing logic.');
  }

  return imageUrl;
}

async function createVideoFromImage(imageUrl, prompt) {
  if (!FAL_API_KEY) {
    throw new Error('FAL_API_KEY is not set. Please configure it in your .env file.');
  }

  const response = await fal.subscribe("fal-ai/minimax-video/image-to-video", {
    input: {
      image_url: imageUrl,
      prompt,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS") {
        update.logs.map((log) => log.message).forEach(console.log);
      }
    },
  });
  console.log(response.data);
  console.log(response.requestId);

  if (!response.data) {
    throw new Error(`fal.ai video request failed with status ${response.status}: ${response.data}`);
  }

  const data = await response.data

  const videoUrl =
    (data.video && data.video.url) ||
    data.video_url ||
    data.url ||
    (Array.isArray(data.outputs) &&
      data.outputs[0] &&
      (data.outputs[0].url || (data.outputs[0].video && data.outputs[0].video.url)));

  if (!videoUrl) {
    console.error('Unexpected fal.ai video response:', JSON.stringify(data, null, 2));
    throw new Error('Could not find video URL in fal.ai video response. Please adjust parsing logic.');
  }

  return videoUrl;
}

async function createVideoFromPrompt(prompt) {
  const imageUrl = await createImageFromPrompt(prompt);
  const videoUrl = await createVideoFromImage(imageUrl, prompt);
  return videoUrl;
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to download video. Status ${res.status}: ${text}`);
  }

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
  });
}

// API endpoint to generate a video from a text prompt
app.post('/api/generate-video', async (req, res) => {
  const { prompt } = req.body || {};

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required.' });
  }

  try {
    const videoUrl = await createVideoFromPrompt(prompt.trim());

    const fileName = `video-${Date.now()}.mp4`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    await downloadToFile(videoUrl, filePath);

    return res.json({
      success: true,
      fileName,
      // Local URL served by this app
      downloadUrl: `/outputs/${fileName}`,
      // Original remote URL from fal.ai (for debugging)
      videoUrl,
    });
  } catch (err) {
    console.error('Error generating video:', err);
    return res.status(500).json({
      error: 'Failed to generate video.',
      details: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Prompt-to-video app listening on http://localhost:${PORT}`);
});
