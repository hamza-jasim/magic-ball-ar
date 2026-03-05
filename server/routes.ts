import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SYSTEM_PROMPT_AR = `أنت "الكرة السحرية" - ذكاء اصطناعي متخصص في تخمين الشخصيات مثل لعبة أكيناتور.

مهمتك الوحيدة: اسأل سؤالاً واحداً بالعربية يمكن الإجابة عليه بـ نعم أو لا.

القواعد الصارمة:
- يجب أن يكون ردك دائماً سؤالاً واحداً فقط، لا أكثر
- السؤال يجب أن ينتهي بعلامة استفهام (؟)
- لا تكتب مقدمات أو تعليقات إضافية
- بعد 7-15 سؤال إذا أصبحت واثقاً جداً، اكتب: تخميني: [اسم الشخصية كاملاً]
- اسأل عن: هل هو/هي حقيقي؟ ذكر؟ رياضي؟ فنان؟ عالم؟ سياسي؟ من الوطن العربي؟ لا يزال حياً؟ مشهور عالمياً؟ إلخ
- كن ذكياً في الأسئلة لتضييق الاحتمالات بسرعة
- تأكد جيداً قبل التخمين، لا تتسرع

ابدأ الآن بسؤالك:`;

const SYSTEM_PROMPT_EN = `You are "The Magic Ball" — an AI specialized in guessing famous people, like the Akinator game.

Your only task: ask ONE yes/no question in English that can be answered with Yes or No.

Strict rules:
- Your response must always be exactly one question, nothing more
- The question must end with a question mark (?)
- Do not write introductions or additional comments
- After 7-15 questions, if you are very confident, write: My guess: [Full name of the person]
- Ask about: Is the person real? Male? An athlete? An artist? A scientist? A politician? Still alive? Internationally famous? From a specific country? etc.
- Be smart with questions to narrow down possibilities quickly
- Make sure you're confident before guessing, don't rush

Start now with your first question:`;

const FALLBACK_QUESTIONS_AR = [
  "هل الشخصية التي تفكر بها حقيقية وليست خيالية؟",
  "هل هذه الشخصية ذكر؟",
  "هل هذه الشخصية رياضي؟",
  "هل هذه الشخصية مشهورة على المستوى العالمي؟",
  "هل هذه الشخصية لا تزال حية؟",
  "هل هذه الشخصية من الوطن العربي؟",
  "هل هذه الشخصية فنان أو ممثل؟",
  "هل هذه الشخصية عالم أو مخترع؟",
];

const FALLBACK_QUESTIONS_EN = [
  "Is the person you're thinking of a real person, not fictional?",
  "Is this person male?",
  "Is this person an athlete?",
  "Is this person internationally famous?",
  "Is this person still alive?",
  "Is this person from the USA or Europe?",
  "Is this person an actor or entertainer?",
  "Is this person a scientist or inventor?",
];

const WIKI_HEADERS = {
  "User-Agent": "MagicBallApp/1.0 (educational project)",
  "Accept": "application/json",
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function getAIResponse(messages: Message[], lang: string, attempt = 0): Promise<string> {
  const systemPrompt = lang === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_AR;
  const fallbacks    = lang === "en" ? FALLBACK_QUESTIONS_EN : FALLBACK_QUESTIONS_AR;

  const chatMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: chatMessages,
    max_completion_tokens: 200,
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content?.trim() || "";

  if (!content && attempt < 3) {
    console.log(`Empty response on attempt ${attempt + 1}, retrying...`);
    await new Promise((r) => setTimeout(r, 500));
    return getAIResponse(messages, lang, attempt + 1);
  }

  if (!content) {
    const fallbackIdx = Math.floor(messages.length / 2) % fallbacks.length;
    return fallbacks[fallbackIdx];
  }

  return content;
}

function parseGuess(content: string, lang: string): { isGuess: boolean; guessName: string | null } {
  const arMarker = "تخميني:";
  const enMarker = "My guess:";
  const marker   = lang === "en" ? enMarker : arMarker;

  const isGuess = content.includes(marker);
  if (!isGuess) return { isGuess: false, guessName: null };

  const afterColon = content.split(marker)[1]?.trim() || "";
  const firstLine  = afterColon.split("\n")[0].trim();
  const guessName  = firstLine.replace(/[،,\.!؟?\[\]]/g, "").trim();

  return { isGuess: true, guessName: guessName || null };
}

async function fetchWikipediaInfo(
  name: string,
  lang: string
): Promise<{ imageUrl: string | null; bio: string | null; enTitle: string | null }> {
  let imageUrl: string | null = null;
  let enBio: string | null = null;
  let enTitle: string | null = null;
  let arBio: string | null = null;

  // Step 1: Search English Wikipedia for image + English bio
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=3&format=json`;
  const searchRes = await fetch(searchUrl, { headers: WIKI_HEADERS });

  if (searchRes.ok) {
    const searchData = (await searchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const results = searchData?.query?.search;
    if (results && results.length > 0) {
      enTitle = results[0].title;
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(enTitle)}`;
      const summaryRes = await fetch(summaryUrl, { headers: WIKI_HEADERS });
      if (summaryRes.ok) {
        const summary = (await summaryRes.json()) as {
          extract?: string;
          thumbnail?: { source: string };
          originalimage?: { source: string };
        };
        imageUrl = summary.thumbnail?.source || summary.originalimage?.source || null;
        const extract = summary.extract || null;
        enBio = extract ? extract.split(/\.\s+/).slice(0, 2).join(". ").trim() + "." : null;
        console.log(`Wikipedia (en): "${enTitle}" — image: ${!!imageUrl}`);
      }
    }
  }

  // Step 2: Search Arabic Wikipedia for Arabic bio (and image fallback)
  const arSearchUrl = `https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&srlimit=3&format=json`;
  const arSearchRes = await fetch(arSearchUrl, { headers: WIKI_HEADERS });

  if (arSearchRes.ok) {
    const arData = (await arSearchRes.json()) as {
      query?: { search?: Array<{ title: string }> };
    };
    const arResults = arData?.query?.search;
    if (arResults && arResults.length > 0) {
      const arTitle = arResults[0].title;
      const arSummaryUrl = `https://ar.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(arTitle)}`;
      const arSummaryRes = await fetch(arSummaryUrl, { headers: WIKI_HEADERS });
      if (arSummaryRes.ok) {
        const arSummary = (await arSummaryRes.json()) as {
          extract?: string;
          thumbnail?: { source: string };
        };
        if (!imageUrl) imageUrl = arSummary.thumbnail?.source || null;
        const arExtract = arSummary.extract || null;
        arBio = arExtract ? arExtract.split(/\.\s+/).slice(0, 2).join(". ").trim() + "." : null;
        console.log(`Wikipedia (ar): "${arTitle}" — arBio: ${!!arBio}`);
      }
    }
  }

  // Step 3: Return bio in the correct language
  let finalBio: string | null;

  if (lang === "en") {
    // English: prefer English bio
    finalBio = enBio;
    if (!finalBio && arBio) {
      // Translate Arabic bio to English
      try {
        const translateRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Translate the following text to English naturally. Provide only the translation without any introduction or comment." },
            { role: "user", content: arBio },
          ],
          max_completion_tokens: 200,
        });
        finalBio = translateRes.choices[0]?.message?.content?.trim() || null;
        console.log(`Translated bio to English`);
      } catch {
        finalBio = arBio;
      }
    }
  } else {
    // Arabic: prefer Arabic bio, fall back to AI-translated English bio
    finalBio = arBio;
    if (!finalBio && enBio) {
      try {
        const translateRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "ترجم النص التالي إلى العربية بشكل طبيعي. أعطِ الترجمة فقط بدون أي مقدمة أو تعليق." },
            { role: "user", content: enBio },
          ],
          max_completion_tokens: 200,
        });
        finalBio = translateRes.choices[0]?.message?.content?.trim() || null;
        console.log(`Translated bio to Arabic`);
      } catch {
        finalBio = enBio;
      }
    }
  }

  return { imageUrl, bio: finalBio, enTitle };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.post("/api/magic-ball/question", async (req, res) => {
    try {
      const { messages, lang = "ar" }: { messages: Message[]; lang?: string } = req.body;
      const content = await getAIResponse(messages, lang);
      const { isGuess, guessName } = parseGuess(content, lang);
      console.log(`AI response (${content.length} chars): "${content.substring(0, 80)}"`);
      res.json({ content, isGuess, guessName });
    } catch (error) {
      console.error("Error calling OpenAI:", error);
      res.status(500).json({ error: "Failed to get response" });
    }
  });

  app.get("/api/person-info", async (req, res) => {
    try {
      const { name, lang = "ar" } = req.query as { name: string; lang?: string };
      if (!name) return res.status(400).json({ error: "Name required" });

      const info = await fetchWikipediaInfo(name, lang);
      res.json(info);
    } catch (error) {
      console.error("Error fetching person info:", error);
      res.json({ imageUrl: null, bio: null, enTitle: null });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
