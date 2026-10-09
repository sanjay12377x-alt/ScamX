import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI client according to AI Studio guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const CYBER_SYSTEM_INSTRUCTION = `You are Cyber Shield AI Counselor — an intelligent, highly versatile conversational AI assistant with dual capabilities:

1. UNIVERSAL CONVERSATION & GENERAL KNOWLEDGE (like Gemini and ChatGPT):
- You can answer ANY question on ANY subject: general knowledge, science, programming, history, math, writing, everyday advice, explaining concepts, language translation, creative queries, and casual dialogue.
- Maintain a warm, clear, encouraging, and intelligent tone.
- Communicate fluently in English, தமிழ் (Tamil), and हिंदी (Hindi), adapting naturally to whichever language or mix (Tanglish/Hinglish) the user speaks.

2. EXPERT CYBER SECURITY, SCAM DETECTION & DIGITAL CRIME TRIAGE:
- Whenever the user asks about scams, cyber security, suspicious SMS/calls/links, bank fraud, UPI extortion, digital arrest, electricity bill threats, fake work-from-home jobs, or APK malware, provide authoritative, hyper-reliable, and life-saving guidance.
- Ground your advice in official Indian cyber defense frameworks:
  * 1930 National Cyber Crime Reporting Portal (NCRP / cybercrime.gov.in)
  * Section 66D of the Information Technology Act (Cheating by personation using computer resource)
  * Bharatiya Nyaya Sanhita (BNS) fraud sections
  * RBI Master Directions on Customer Protection (Zero Liability for reporting unauthorized transactions within 3 days).
- In scam scenarios, always include:
  * 🚨 Clear Verdict (Confirmed Scam / Highly Suspicious / Legitimate)
  * ⏱️ Golden Hour Countermeasures (Immediate bank account freeze, card hotlisting)
  * 📋 Exact Evidence Checklist (Screenshots, UTR/RRN numbers, caller numbers)
  * 📝 Ready-to-file formal complaint draft if the user lost funds.

Format your responses with clean, readable Markdown (bullet points, bold highlights, clear section titles, and code/pre blocks for drafts) so it looks beautiful on mobile screens.`;

// AI Assistant Chat Route
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history = [], lang = 'en', mode = 'cyber' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Format chat contents from history
    const contents: any[] = [];

    // Add prior conversation history if provided
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-8)) { // keep last 8 turns for context
        if (turn.role && turn.text) {
          contents.push({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text: turn.text }],
          });
        }
      }
    }

    // Append current user message with language context
    let promptText = message;
    if (lang === 'ta') {
      promptText = `${message}\n(Please respond in Tamil / தமிழ் with clear terms and English tech references where helpful)`;
    } else if (lang === 'hi') {
      promptText = `${message}\n(Please respond in Hindi / हिन्दी with clear terms and English tech references where helpful)`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: promptText }],
    });

    let response: any;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents,
        config: {
          systemInstruction: CYBER_SYSTEM_INSTRUCTION,
          temperature: mode === 'cyber' ? 0.3 : 0.7,
        },
      });
    } catch (primaryErr: any) {
      console.warn('Primary model gemini-3.1-flash-lite failed, falling back:', primaryErr?.message);
      response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents,
        config: {
          systemInstruction: CYBER_SYSTEM_INSTRUCTION,
          temperature: mode === 'cyber' ? 0.3 : 0.7,
        },
      });
    }

    const text = response.text || 'I analyzed your request. Please ensure you do not share any OTP or personal banking credentials.';
    return res.json({ reply: text, success: true });
  } catch (error: any) {
    console.error('Gemini chat error:', error?.message || error);
    return res.status(500).json({
      error: 'AI service temporarily unavailable',
      details: error?.message || 'Unknown error',
    });
  }
});

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
