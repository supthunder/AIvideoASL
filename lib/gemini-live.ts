// Browser-side client for Gemini 2.5 Flash Live STT.
// Opens a WebSocket to Google's Live endpoint, streams 16 kHz Int16 PCM mic audio,
// and emits finalised transcription text via the callback.
//
// For local dev the API key is fetched from /api/stt/token (server reads it from
// process.env.GEMINI_API_KEY). For production the same route should mint an
// ephemeral token instead of returning the raw key — see app/api/stt/token/route.ts.

export type GeminiLiveCallbacks = {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
  onClose?: () => void;
};

const MODEL = "models/gemini-2.5-flash-native-audio-preview-09-2025";

export class GeminiLiveClient {
  private ws: WebSocket | null = null;
  private audioCtx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private ownsStream = true;
  private workletNode: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private callbacks: GeminiLiveCallbacks;
  private currentPartial = "";

  constructor(callbacks: GeminiLiveCallbacks) {
    this.callbacks = callbacks;
  }

  // Start with the user's mic (default).
  async start(): Promise<void> {
    await this.connect();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true },
    });
    this.ownsStream = true;
    await this.attachStream(stream);
  }

  // Start with an externally-provided MediaStream (e.g. from <video>.captureStream()).
  // Caller retains ownership of the stream — we won't stop its tracks on close.
  async startWithStream(stream: MediaStream): Promise<void> {
    await this.connect();
    this.ownsStream = false;
    await this.attachStream(stream);
  }

  private async connect(): Promise<void> {
    const tokenRes = await fetch("/api/stt/token");
    if (!tokenRes.ok) {
      const detail = await tokenRes.text().catch(() => "");
      throw new Error(`token endpoint ${tokenRes.status}: ${detail}`);
    }
    const { apiKey } = (await tokenRes.json()) as { apiKey?: string };
    if (!apiKey) throw new Error("token endpoint returned no apiKey");

    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error("ws missing"));
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("websocket connect failed"));
    });

    this.ws.send(JSON.stringify({
      setup: {
        model: MODEL,
        generationConfig: { responseModalities: ["TEXT"] },
        inputAudioTranscription: {},
        systemInstruction: {
          parts: [{ text: "You are a transcription-only assistant. Do not produce any output text; the user only needs the input transcription." }],
        },
      },
    }));

    this.ws.onmessage = (ev) => this.handleMessage(ev.data);
    this.ws.onclose = () => this.callbacks.onClose?.();
  }

  private async attachStream(stream: MediaStream): Promise<void> {
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    if (this.audioCtx.sampleRate !== 16000) {
      this.callbacks.onError?.(
        `AudioContext returned ${this.audioCtx.sampleRate} Hz; expected 16000. Quality may be reduced.`,
      );
    }
    await this.audioCtx.audioWorklet.addModule("/pcm-recorder-worklet.js");
    this.stream = stream;
    this.source = this.audioCtx.createMediaStreamSource(stream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, "pcm-recorder");
    this.workletNode.port.onmessage = (ev) => {
      const buf = ev.data as ArrayBuffer;
      this.sendAudio(buf);
    };
    this.source.connect(this.workletNode);
  }

  private sendAudio(buf: ArrayBuffer) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const b64 = arrayBufferToBase64(buf);
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64 }],
      },
    }));
  }

  private handleMessage(raw: string | ArrayBuffer) {
    let msg: unknown;
    try {
      msg = typeof raw === "string" ? JSON.parse(raw) : JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const m = msg as {
      serverContent?: {
        inputTranscription?: { text?: string; isFinal?: boolean };
        turnComplete?: boolean;
      };
      error?: { message?: string };
    };
    if (m.error?.message) {
      this.callbacks.onError?.(m.error.message);
      return;
    }
    const t = m.serverContent?.inputTranscription;
    if (t?.text) {
      this.currentPartial += t.text;
      this.callbacks.onPartial?.(this.currentPartial);
    }
    if (m.serverContent?.turnComplete && this.currentPartial.trim()) {
      this.callbacks.onFinal?.(this.currentPartial.trim());
      this.currentPartial = "";
    }
  }

  async stop(): Promise<void> {
    try { this.workletNode?.disconnect(); } catch {}
    try { this.source?.disconnect(); } catch {}
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try { await this.audioCtx.close(); } catch {}
    }
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.audioCtx = null;
    this.stream = null;
    this.workletNode = null;
    this.source = null;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  return btoa(str);
}
