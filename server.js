import express from 'express';
import dotenv from 'dotenv';
import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });
console.log("Loaded GROQ KEY:", process.env.GROQ_API_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

let characterSystemPrompt = 'You are a helpful assistant.';
try {
    const characterJson = fs.readFileSync(path.join(__dirname, 'character.json'), 'utf8');
    const characterData = JSON.parse(characterJson);
    characterSystemPrompt = `
You are ${characterData.professional_profile?.primary_occupation ?? 'a character'}.
Name: ${characterData.basic_information?.name ?? 'Unknown'}
Age: ${characterData.basic_information?.age ?? 'N/A'}
Background: ${characterData.personal_background?.description ?? ''}
Personality: ${characterData.personality_traits?.join(', ') ?? ''}
Speak in a way that reflects this persona.
`.trim();
} catch (err) {
    console.error('Failed to load character profile:', err);
}

app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    if (!userMessage) return res.status(400).json({ error: 'Message is required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: "llama3-8b-8192", // or "llama3-70b-8192", "mixtral-8x7b-32768"
        temperature: 0.7,
        streaming: true,
        callbacks: [
            {
                handleLLMNewToken(token) {
                    res.write(`data: ${token}\n\n`);
                },
                handleLLMEnd() {
                    res.write("data: [DONE]\n\n");
                    res.end();
                }
            }
        ]
    });

    try {
        await llm.call([
            new SystemMessage(characterSystemPrompt),
            new HumanMessage(userMessage)
        ]);
    } catch (err) {
        console.error('Streaming error:', err);
        res.write('data: [ERROR]\n\n');
        res.end();
    }
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
