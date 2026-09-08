import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "25mb" }));

// Lazy Gemini client helper
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    service: "sa3-soundboard-studio",
  });
});

// Repository Review & Android Architecture details for sa3.cpp
app.get("/api/sa3/info", (req, res) => {
  res.json({
    repo: "https://github.com/betweentwomidnights/sa3.cpp",
    title: "Stable Audio 3 (GGUF) Small SFX Model & Android Engine",
    description:
      "A pure C/C++ port of Stable Audio 3 (SA3) supporting GGUF quantized models including the Small SFX model.",
    modelVariants: [
      {
        name: "sa3-small-sfx (Q4_0)",
        weightsSize: "480 MB",
        ramRequirement: "~750 MB",
        sampleRate: 44100,
        recommended: true,
        description: "Optimized for mobile sound effects, foley, impacts, and UI feedback.",
      },
      {
        name: "sa3-small-sfx (Q8_0)",
        weightsSize: "890 MB",
        ramRequirement: "~1.2 GB",
        sampleRate: 48000,
        recommended: false,
        description: "Higher precision audio synthesis with studio acoustic definition.",
      },
      {
        name: "sa3-full (F16)",
        weightsSize: "2.4 GB",
        ramRequirement: "~3.8 GB",
        sampleRate: 48000,
        recommended: false,
        description: "Full audio model for desktop/workstation generation.",
      },
    ],
    architecture: {
      dit: "Diffusion Transformer (DiT) core running iterative denoising passes.",
      vae: "SAME (Stable Audio Masked Autoencoder) converting latent tensors into 44.1/48kHz PCM audio.",
      conditioner: "Frozen T5Gemma text encoder sidecar parsing semantic prompt embeddings.",
      runtime: "GGML tensor backend with NEON SIMD optimizations for ARM64-v8a.",
    },
    androidIntegration: {
      ndk: "Android NDK r25c+ with CMake 3.22+",
      abi: "arm64-v8a (target Android 8.0+ / API 26+)",
      audioSubsystem: "AAudio / Oboe for ultra-low latency (<15ms) soundboard pad triggering",
      jniFunctions: [
        "sa3_init(const char* dit_path, const char* vae_path, const char* text_path)",
        "sa3_generate_sfx(const char* prompt, float duration_sec, int steps, float cfg, float* out_samples)",
        "sa3_free()",
      ],
    },
  });
});

// AI SFX Generator Endpoint (Gemini-assisted intelligent audio recipe & parameters)
app.post("/api/sfx/generate-recipe", async (req, res) => {
  try {
    const { prompt, category, duration = 1.5, sampleRate = 44100 } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // Return structured default procedural synthesis recipe
      return res.json({
        prompt: prompt || "Custom Sound Effect",
        category: category || "sfx",
        duration: Math.max(0.2, Math.min(8.0, Number(duration))),
        sampleRate: Number(sampleRate) || 44100,
        recipe: {
          baseFreq: 180,
          endFreq: 45,
          oscType: "sine",
          noiseMix: 0.35,
          decay: 0.8,
          attack: 0.02,
          filterCutoff: 3200,
          filterType: "lowpass",
          harmonics: [1.0, 0.4, 0.15],
          pitchEnv: "drop",
          reverbMix: 0.25,
          distortion: 0.1,
          vibratoRate: 5.0,
          vibratoDepth: 0.05,
        },
        aiGenerated: false,
      });
    }

    // Call Gemini to generate a tailored physical/DSP synthesis recipe for the requested sound
    const systemPrompt = `You are an expert audio DSP engineer and sound designer specializing in generative SFX (analogous to Stable Audio 3 small SFX model).
Convert the user's sound effect prompt into sound synthesis parameters in JSON format.
Return ONLY valid JSON matching this schema:
{
  "title": string,
  "category": "sci-fi" | "retro" | "impact" | "ui" | "foley" | "cinematic",
  "baseFreq": number (20 to 5000 Hz),
  "endFreq": number (20 to 5000 Hz),
  "oscType": "sine" | "triangle" | "sawtooth" | "square",
  "pitchEnv": "drop" | "rise" | "siren" | "stable" | "chirp" | "sweep",
  "noiseMix": number (0.0 to 1.0),
  "noiseType": "white" | "pink" | "crackle",
  "attack": number (0.001 to 0.5 sec),
  "decay": number (0.05 to 4.0 sec),
  "filterCutoff": number (100 to 12000 Hz),
  "filterType": "lowpass" | "highpass" | "bandpass",
  "harmonics": [number, number, number],
  "reverbMix": number (0.0 to 0.8),
  "distortion": number (0.0 to 0.8),
  "vibratoRate": number (0.0 to 20.0),
  "vibratoDepth": number (0.0 to 0.5),
  "subBass": number (0.0 to 1.0)
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: `Design a sound effect synthesis recipe for prompt: "${prompt}". Requested duration: ${duration}s.`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    let recipeData;
    try {
      recipeData = JSON.parse(text);
    } catch {
      recipeData = {};
    }

    res.json({
      prompt,
      category: recipeData.category || category || "sfx",
      duration: Math.max(0.2, Math.min(8.0, Number(duration))),
      sampleRate: Number(sampleRate) || 44100,
      recipe: {
        title: recipeData.title || prompt,
        baseFreq: recipeData.baseFreq || 220,
        endFreq: recipeData.endFreq || 80,
        oscType: recipeData.oscType || "sawtooth",
        pitchEnv: recipeData.pitchEnv || "drop",
        noiseMix: recipeData.noiseMix ?? 0.3,
        noiseType: recipeData.noiseType || "white",
        attack: recipeData.attack ?? 0.01,
        decay: recipeData.decay ?? 0.6,
        filterCutoff: recipeData.filterCutoff ?? 3500,
        filterType: recipeData.filterType || "lowpass",
        harmonics: recipeData.harmonics || [1.0, 0.5, 0.2],
        reverbMix: recipeData.reverbMix ?? 0.25,
        distortion: recipeData.distortion ?? 0.1,
        vibratoRate: recipeData.vibratoRate ?? 4.0,
        vibratoDepth: recipeData.vibratoDepth ?? 0.02,
        subBass: recipeData.subBass ?? 0.3,
      },
      aiGenerated: true,
    });
  } catch (error: any) {
    console.error("Error generating SFX recipe:", error);
    res.status(500).json({ error: error?.message || "Failed to generate SFX recipe" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SA3 Soundboard Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
