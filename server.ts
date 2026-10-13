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

const GENERAL_SYSTEM_INSTRUCTION = `You are Cyber Shield AI — a real-life, world-class conversational AI companion and advisor (like ChatGPT and Gemini).
You have broad intelligence, empathy, and conversational depth across daily life topics, reasoning, science, communication, decision making, fraud safety, and practical advice.
You communicate naturally, thoughtfully, and clearly in fluent English, தமிழ் (Tamil), and हिंदी (Hindi).

CRITICAL REQUIREMENT - NO PROGRAMMING CODE:
- Strictly DO NOT generate programming code, python/bash/curl scripts, regex, technical source code, or code blocks.
- The user wants everyday practical explanations, clear advice, and friendly human conversation — not code.
- Always explain concepts using simple real-world analogies, concise bullet points, and plain text.

Guidelines:
- Speak like a friendly, thoughtful, articulate human expert.
- Format responses cleanly with bold key points, clean bullet lists, and warm conversational paragraphs.
- Be supportive, insightful, and actionable.`;

const CYBER_SYSTEM_INSTRUCTION = `You are Cyber Shield AI Counselor — an authoritative, compassionate, and rapid-response anti-fraud forensic specialist and legal cyber defense advisor.
Your mission is to protect citizens, elders, and families from online scams, digital arrest fraud, UPI traps, identity theft, and cyber extortion.

CRITICAL REQUIREMENT - NO PROGRAMMING CODE:
- Strictly DO NOT generate programming code, python/bash scripts, technical syntax, or code blocks.
- All advice must be instantly understandable by non-technical citizens, seniors, and students.
- Explain technical threats in plain everyday language with reassuring clarity.

Operational Guidelines:
1. SCAM VERDICT & IMMEDIATE RELIEF:
- Deliver an immediate verdict: 🚨 CONFIRMED SCAM / ⚠️ HIGH SUSPICION / ✅ SAFE & LEGITIMATE.
- Explain the psychological manipulation or fraud trick simply (e.g., urgency trap, fear tactic, fake authority).
- Reassure the user: Remind them that scams happen to millions and prompt action can stop losses.

2. GOLDEN HOUR ACTION CHECKLIST (First 1 to 2 Hours):
- Urgent containment steps:
  * Immediately freeze or block bank account/card via official banking app or customer care.
  * Turn on Airplane Mode if any unknown APK or file was downloaded.
  * Disconnect screen-sharing apps (AnyDesk, QuickSupport, TeamViewer).
- National Indian Cyber Defense Framework:
  * Helpline: Dial 1930 immediately (National Cyber Crime Reporting Helpline - 24x7).
  * Official Portal: Report at cybercrime.gov.in (NCRP).
  * RBI Master Direction: Zero Liability for unauthorized electronic transactions if notified within 3 days.
  * Legal Rights: Protected under Section 66D IT Act (cheating by personation) and relevant Bharatiya Nyaya Sanhita (BNS) fraud sections.

3. READY-TO-FILE COMPLAINT DRAFTS:
- When financial fraud or harassment occurs, draft an official, ready-to-submit formal letter for the Police/Bank using clean text templates with placeholders like [Your Name], [Bank Name], [Transaction ID, Date & Amount]. Do not use programming code blocks.

4. MULTILINGUAL & EMPATHETIC:
- Speak warmly and adapt to English, தமிழ் (Tamil), or हिंदी (Hindi).`;

// AI Assistant Chat Route
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { message, history = [], lang = 'en', mode = 'cyber' } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Select system instruction based on mode
    let sysInstruction = mode === 'general' ? GENERAL_SYSTEM_INSTRUCTION : CYBER_SYSTEM_INSTRUCTION;
    let temp = mode === 'general' ? 0.7 : 0.3;

    // Format chat contents from history
    const contents: any[] = [];

    // Add prior conversation history (keep last 16 turns for rich context)
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history.slice(-16)) {
        if (turn && turn.role && turn.text) {
          contents.push({
            role: turn.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(turn.text) }],
          });
        }
      }
    }

    // Append current user message with language preference
    let promptText = message;
    if (lang === 'ta') {
      promptText = `${message}\n\n[Please respond in Tamil / தமிழ் with clear explanations and terminology]`;
    } else if (lang === 'hi') {
      promptText = `${message}\n\n[Please respond in Hindi / हिन्दी with clear explanations and terminology]`;
    }

    contents.push({
      role: 'user',
      parts: [{ text: promptText }],
    });

    let response: any;
    const modelCandidates = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
    let lastError: any = null;

    for (const modelName of modelCandidates) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: sysInstruction,
            temperature: temp,
          },
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Model ${modelName} call failed, trying next candidate:`, err?.message);
      }
    }

    const text = response?.text || 'I have analyzed your query. If this is an emergency, please dial 1930 immediately.';
    return res.json({ reply: text, success: true });
  } catch (error: any) {
    console.error('Gemini chat error:', error?.message || error);
    return res.status(500).json({
      error: 'AI service temporarily unavailable',
      details: error?.message || 'Unknown error',
    });
  }
});

// Endpoint to generate conversation titles like ChatGPT
app.post('/api/gemini/title', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string') {
      return res.json({ title: 'New Conversation' });
    }

    const prompt = `Summarize this user question into a very short, clean 3 to 5 word ChatGPT-style conversation title without punctuation or quotes: "${message.slice(0, 200)}"`;
    
    try {
      const resp = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const title = resp.text?.trim().replace(/^["']|["']$/g, '').slice(0, 45) || 'New Conversation';
      return res.json({ title });
    } catch {
      // Fallback title from message words
      const words = message.trim().split(/\s+/).slice(0, 5).join(' ');
      return res.json({ title: words.length > 35 ? words.slice(0, 32) + '...' : words });
    }
  } catch (err) {
    return res.json({ title: 'New Conversation' });
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
