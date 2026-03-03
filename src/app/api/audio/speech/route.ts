import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rateLimitCheck } from '@/lib/rateLimiter';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
    // Rate limiting
    const rateLimitResponse = rateLimitCheck(req, 'audio');
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const openai = getOpenAI();
    try {
        const body = await req.json();
        const { text, model, voice, speed } = body;

        if (!text) return NextResponse.json({ error: "Text is required" }, { status: 400 });

        const mp3 = await openai.audio.speech.create({
            model: model || "tts-1",
            voice: voice || "alloy",
            input: text,
            speed: Number(speed) || 1.0,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        // Return audio stream
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': buffer.length.toString(),
            }
        });

    } catch (e: any) {
        console.error("Audio API Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
