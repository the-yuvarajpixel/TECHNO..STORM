import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Copy,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  PhoneCall,
  PhoneOff,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Upload,
  Video,
  Volume2,
  Wand2,
  X,
} from 'lucide-react';
import { buildSentinelWsUrl, sentinelApi } from '../lib/api';
import type { SystemSnapshot } from '../core/types';

type StudioTab = 'voice' | 'transcribe' | 'maps' | 'image' | 'video';
type LiveVoiceName = 'Zephyr' | 'Kore' | 'Puck' | 'Charon' | 'Fenrir';

interface AiStudioViewProps {
  snapshot: SystemSnapshot;
  onScanTranscript?: (payload: { ticketId: string; ticketText: string }) => Promise<{
    ticketId: string;
    redactedText: string;
    findings: Array<{ kind: string; previewMasked: string; tokenHash: string }>;
  }>;
}

interface LiveTranscriptEntry {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: string;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { base64: dataUrl, mimeType: 'application/octet-stream' };
  }
  return { mimeType: match[1], base64: match[2] };
}

export function AiStudioView({ snapshot, onScanTranscript }: AiStudioViewProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>('voice');

  // --- 1. Live Voice Conversation (gemini-3.8-live) ---
  const [liveVoice, setLiveVoice] = useState<LiveVoiceName>('Zephyr');
  const [liveStatus, setLiveStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [liveMuted, setLiveMuted] = useState(false);
  const [liveLevel, setLiveLevel] = useState(0);
  const [liveTextInput, setLiveTextInput] = useState('');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<LiveTranscriptEntry[]>([]);

  const liveWsRef = useRef<WebSocket | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveInputCtxRef = useRef<AudioContext | null>(null);
  const liveOutputCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveMutedRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const activeOutputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  liveMutedRef.current = liveMuted;

  const stopAllLiveAudioOutput = () => {
    for (const src of activeOutputSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeOutputSourcesRef.current.clear();
    if (liveOutputCtxRef.current) {
      nextStartTimeRef.current = liveOutputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  };

  const playLivePcmChunk = (base64Pcm: string) => {
    const ctx = liveOutputCtxRef.current;
    if (!ctx) return;
    const samples = base64Pcm16ToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeOutputSourcesRef.current.add(source);
    source.onended = () => {
      activeOutputSourcesRef.current.delete(source);
    };
  };

  const appendLiveTranscript = (role: 'user' | 'model' | 'system', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setLiveTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && role !== 'system') {
        const merged = `${last.text}${last.text.endsWith(' ') ? '' : ' '}${trimmed}`;
        return [...prev.slice(0, -1), { ...last, text: merged }];
      }
      return [
        ...prev.slice(-40),
        {
          id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role,
          text: trimmed,
          timestamp: new Date().toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        },
      ];
    });
  };

  const disconnectLiveSession = () => {
    stopAllLiveAudioOutput();
    if (liveProcessorRef.current) {
      liveProcessorRef.current.disconnect();
      liveProcessorRef.current.onaudioprocess = null;
      liveProcessorRef.current = null;
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (liveInputCtxRef.current) {
      void liveInputCtxRef.current.close();
      liveInputCtxRef.current = null;
    }
    if (liveOutputCtxRef.current) {
      void liveOutputCtxRef.current.close();
      liveOutputCtxRef.current = null;
    }
    if (liveWsRef.current) {
      try {
        liveWsRef.current.close();
      } catch {
        // Ignore close error
      }
      liveWsRef.current = null;
    }
    setLiveStatus('idle');
    setLiveLevel(0);
  };

  useEffect(() => {
    return () => {
      disconnectLiveSession();
    };
  }, []);

  const connectLiveSession = async () => {
    disconnectLiveSession();
    setLiveError(null);
    setLiveStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      liveStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      liveInputCtxRef.current = inputCtx;
      liveOutputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsUrl = buildSentinelWsUrl(`/ws/live?voice=${encodeURIComponent(liveVoice)}`);
      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        liveProcessorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (liveMutedRef.current || ws.readyState !== WebSocket.OPEN) {
            setLiveLevel(0);
            return;
          }
          const channel = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 0; i < channel.length; i += 1) {
            sum += channel[i] * channel[i];
          }
          const rms = Math.sqrt(sum / channel.length);
          setLiveLevel(Math.min(100, Math.round(rms * 380)));

          const base64Audio = float32ToPcm16Base64(channel);
          ws.send(JSON.stringify({ audio: base64Audio }));
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data));
          if (msg.type === 'live:ready') {
            setLiveStatus('connected');
            appendLiveTranscript(
              'system',
              `Connected to ${msg.model} (${msg.voice} voice). Speak naturally to brief Sentinel.`,
            );
          } else if (msg.type === 'audio' && typeof msg.audio === 'string') {
            playLivePcmChunk(msg.audio);
          } else if (msg.type === 'interrupted') {
            stopAllLiveAudioOutput();
          } else if (msg.type === 'inputTranscription' && typeof msg.text === 'string') {
            appendLiveTranscript('user', msg.text);
          } else if (msg.type === 'outputTranscription' && typeof msg.text === 'string') {
            appendLiveTranscript('model', msg.text);
          } else if (msg.type === 'error') {
            setLiveError(String(msg.error || 'Live voice session encountered an error.'));
            disconnectLiveSession();
          } else if (msg.type === 'live:closed') {
            disconnectLiveSession();
          }
        } catch {
          // Ignore malformed WS payloads
        }
      };

      ws.onerror = () => {
        setLiveError(
          'Could not connect to /ws/live WebSocket bridge. Ensure the Sentinel Node server is running with GEMINI_API_KEY configured.',
        );
        disconnectLiveSession();
      };

      ws.onclose = () => {
        setLiveStatus('idle');
      };
    } catch (err) {
      setLiveError(
        err instanceof Error
          ? err.message
          : 'Microphone access denied or Live API session failed to initialize.',
      );
      disconnectLiveSession();
    }
  };

  const handleSendLiveText = () => {
    const trimmed = liveTextInput.trim();
    if (!trimmed || !liveWsRef.current || liveWsRef.current.readyState !== WebSocket.OPEN) return;
    liveWsRef.current.send(JSON.stringify({ text: trimmed }));
    appendLiveTranscript('user', trimmed);
    setLiveTextInput('');
  };

  // --- 2. Audio Transcription (gemini-3.5-transcribe) ---
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedAudioMime, setRecordedAudioMime] = useState<string>('audio/webm');
  const [transcribeInstruction, setTranscribeInstruction] = useState(
    'Transcribe this security voice memo accurately with clean punctuation.',
  );
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [scanSummary, setScanSummary] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    };
  }, [recordedAudioUrl]);

  const startMicRecording = async () => {
    setTranscribeError(null);
    setScanSummary(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      mediaRecorderRef.current = recorder;
      recordChunksRef.current = [];
      setRecordSeconds(0);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        const blob = new Blob(recordChunksRef.current, { type: preferredMime.split(';')[0] });
        const objectUrl = URL.createObjectURL(blob);
        setRecordedAudioUrl(objectUrl);
        setRecordedAudioMime(blob.type || 'audio/webm');

        const reader = new FileReader();
        reader.onloadend = () => {
          const parsed = parseDataUrl(String(reader.result || ''));
          setRecordedAudioBase64(parsed.base64);
          if (parsed.mimeType) setRecordedAudioMime(parsed.mimeType);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(250);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setTranscribeError(
        err instanceof Error ? err.message : 'Unable to access microphone for recording.',
      );
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleAudioFileUpload = async (file: File | null) => {
    if (!file) return;
    setTranscribeError(null);
    setScanSummary(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const parsed = parseDataUrl(dataUrl);
      setRecordedAudioUrl(URL.createObjectURL(file));
      setRecordedAudioBase64(parsed.base64);
      setRecordedAudioMime(file.type || parsed.mimeType || 'audio/mp3');
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Failed to load audio file.');
    }
  };

  const handleRunTranscription = async () => {
    if (!recordedAudioBase64) return;
    setTranscribing(true);
    setTranscribeError(null);
    setScanSummary(null);
    try {
      const res = await sentinelApi.transcribeAudio({
        audioBase64: recordedAudioBase64,
        mimeType: recordedAudioMime,
        instruction: transcribeInstruction,
      });
      setTranscriptResult(res.transcript);
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Audio transcription failed.');
    } finally {
      setTranscribing(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (!transcriptResult) return;
    try {
      await navigator.clipboard.writeText(transcriptResult);
      setCopiedTranscript(true);
      window.setTimeout(() => setCopiedTranscript(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  const handleScanTranscriptAtEdge = async () => {
    if (!transcriptResult || !onScanTranscript) return;
    try {
      const res = await onScanTranscript({
        ticketId: `VOICE-${Math.floor(1000 + Math.random() * 9000)}`,
        ticketText: transcriptResult,
      });
      setScanSummary(
        `Scanned as ${res.ticketId}: ${res.findings.length} sensitive token(s) redacted at edge.`,
      );
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'Edge scan failed.');
    }
  };

  // --- 3. Google Maps Grounding (gemini-4-hydrogen + googleMaps) ---
  const [mapsQuery, setMapsQuery] = useState(
    'Find major data center hubs, cybersecurity incident response offices, and emergency law enforcement contacts in Sydney, Australia.',
  );
  const [useGeolocation, setUseGeolocation] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResult, setMapsResult] = useState<{
    answer: string;
    model: string;
    sources: Array<{
      title: string;
      uri: string;
      placeId?: string;
      reviewSnippets: Array<{ text: string; uri?: string }>;
    }>;
    timestamp: string;
  } | null>(null);

  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Browser geolocation unavailable');
      return;
    }
    setGeoStatus('Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
        });
        setUseGeolocation(true);
        setGeoStatus(
          `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        );
      },
      () => {
        setUseGeolocation(false);
        setGeoStatus('Location permission declined');
      },
      { timeout: 8000 },
    );
  };

  const handleRunMapsQuery = async (customQuery?: string) => {
    const q = (customQuery ?? mapsQuery).trim();
    if (!q) return;
    if (customQuery) setMapsQuery(customQuery);
    setMapsLoading(true);
    setMapsError(null);
    try {
      const res = await sentinelApi.queryMapsGrounding({
        query: q,
        latitude: useGeolocation ? coords?.latitude : undefined,
        longitude: useGeolocation ? coords?.longitude : undefined,
      });
      setMapsResult(res);
    } catch (err) {
      setMapsError(err instanceof Error ? err.message : 'Maps grounding lookup failed.');
    } finally {
      setMapsLoading(false);
    }
  };

  // --- 4. Image Studio: Create & Edit Images (gemini-nano-banana-2.1) ---
  const [imageMode, setImageMode] = useState<'create' | 'edit'>('create');
  const [imagePrompt, setImagePrompt] = useState(
    'Clean architectural infographic diagram of an outbound-only zero-trust edge redaction gateway protecting a financial vault, crisp porcelain white and cobalt blue lighting, ultra-sharp minimalist industrial design.',
  );
  const [imageAspect, setImageAspect] = useState<'16:9' | '1:1' | '4:3' | '9:16'>('16:9');
  const [imageSize, setImageSize] = useState<'1K' | '2K'>('1K');
  const [editSourcePreview, setEditSourcePreview] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<{
    imageDataUrl: string;
    mimeType: string;
    caption: string;
    model: string;
    mode: 'create' | 'edit';
    aspectRatio: string;
  } | null>(null);

  const handleUploadEditImage = async (file: File | null) => {
    if (!file) return;
    setImageError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setEditSourcePreview(dataUrl);
      setImageMode('edit');
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to load source image.');
    }
  };

  const handleGenerateOrEditImage = async () => {
    if (!imagePrompt.trim()) return;
    if (imageMode === 'edit' && !editSourcePreview) {
      setImageError('Upload a photo first to run image editing.');
      return;
    }
    setImageLoading(true);
    setImageError(null);
    try {
      const parsed =
        imageMode === 'edit' && editSourcePreview ? parseDataUrl(editSourcePreview) : null;
      const res = await sentinelApi.generateOrEditImage({
        prompt: imagePrompt,
        sourceImageBase64: parsed?.base64,
        sourceMimeType: parsed?.mimeType,
        aspectRatio: imageAspect,
        imageSize,
      });
      setImageResult(res);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setImageLoading(false);
    }
  };

  // --- 5. Video Studio: Text-to-Video & Animate Photo (gemini-omni-1.2-flash Interactions API) ---
  const [videoMode, setVideoMode] = useState<'text' | 'animate'>('text');
  const [videoPrompt, setVideoPrompt] = useState(
    'Slow cinematic dolly shot through a modern glass-walled cybersecurity command center at dawn, soft cobalt light reflections across sleek slate monitors, photorealistic architectural cinematography.',
  );
  const [videoAspect, setVideoAspect] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '8s' | '10s'>('5s');
  const [videoPhotoPreview, setVideoPhotoPreview] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoElapsedSec, setVideoElapsedSec] = useState(0);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoResult, setVideoResult] = useState<{
    videoDataUrl: string | null;
    videoUri: string | null;
    mimeType: string;
    model: string;
    mode: 'text' | 'animate';
    aspectRatio: '16:9' | '9:16';
    duration: string;
  } | null>(null);

  useEffect(() => {
    if (!videoLoading) {
      setVideoElapsedSec(0);
      return;
    }
    const id = window.setInterval(() => setVideoElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [videoLoading]);

  const handleUploadVideoPhoto = async (file: File | null) => {
    if (!file) return;
    setVideoError(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setVideoPhotoPreview(dataUrl);
      setVideoMode('animate');
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Failed to read uploaded photo.');
    }
  };

  const handleRunVideoGeneration = async () => {
    if (videoMode === 'animate' && !videoPhotoPreview) {
      setVideoError('Upload a photo to animate into video.');
      return;
    }
    if (videoMode === 'text' && !videoPrompt.trim()) {
      setVideoError('Enter a text prompt describing the video to generate.');
      return;
    }
    setVideoLoading(true);
    setVideoError(null);
    try {
      const parsed =
        videoMode === 'animate' && videoPhotoPreview ? parseDataUrl(videoPhotoPreview) : null;
      const res = await sentinelApi.generateOrAnimateVideo({
        prompt: videoPrompt,
        sourceImageBase64: parsed?.base64,
        sourceMimeType: parsed?.mimeType,
        aspectRatio: videoAspect,
        duration: videoDuration,
      });
      setVideoResult(res);
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : 'Video generation failed.');
    } finally {
      setVideoLoading(false);
    }
  };

  const handleSendImageToVideoStudio = (dataUrl: string) => {
    setVideoPhotoPreview(dataUrl);
    setVideoMode('animate');
    setVideoPrompt(
      'Smooth cinematic camera push-in with subtle ambient cobalt lighting and crisp depth of field.',
    );
    setActiveTab('video');
  };

  const tabs: Array<{
    id: StudioTab;
    label: string;
    model: string;
    icon: typeof Mic;
  }> = [
    { id: 'voice', label: 'Live Voice', model: 'gemini-3.8-live', icon: AudioLines },
    { id: 'transcribe', label: 'Transcribe Audio', model: 'gemini-3.5-transcribe', icon: Mic },
    { id: 'maps', label: 'Maps Grounding', model: 'gemini-4-hydrogen', icon: MapPin },
    { id: 'image', label: 'Create & Edit Images', model: 'gemini-nano-banana-2.1', icon: Wand2 },
    { id: 'video', label: 'Video & Photo Motion', model: 'gemini-omni-1.2-flash', icon: Film },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-mono text-[var(--sentinel-accent)] font-semibold">
            Sentinel Multimodal Operations · Region {snapshot.controlPlane.region}
          </p>
          <h1 className="font-title text-2xl sm:text-3xl font-bold text-[var(--sentinel-ink)]">
            AI Command Studio
          </h1>
          <p className="text-sm text-[var(--sentinel-ink-secondary)] max-w-3xl">
            Real-time voice incident briefings, microphone speech transcription, Google Maps geospatial grounding, and visual/video briefing generation—all routed server-side.
          </p>
        </div>
      </div>

      {/* Segmented Interactive Mode Bar */}
      <div
        role="tablist"
        aria-label="AI Studio capabilities"
        className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg bg-[var(--sentinel-segment)] border border-[var(--sentinel-border-soft)]"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`ai-tab-${t.id}`}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-sm border border-[var(--sentinel-border)]'
                  : 'text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-ink)]'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-[var(--sentinel-accent)]' : ''}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: LIVE VOICE CONVERSATION (gemini-3.8-live) */}
      {activeTab === 'voice' && (
        <section className="window-suede rounded-lg p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--sentinel-divider)] pb-4">
            <div className="space-y-1">
              <h2 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                Real-Time Voice Conversation
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Bidirectional low-latency voice briefing via <span className="font-mono">gemini-3.8-live</span> grounded in your live Sentinel alerts, vault state, and containment posture.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-[var(--sentinel-ink-secondary)] flex items-center gap-2">
                <span>Voice</span>
                <select
                  value={liveVoice}
                  disabled={liveStatus !== 'idle'}
                  onChange={(e) => setLiveVoice(e.target.value as LiveVoiceName)}
                  className="surface-input rounded-md px-2.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const).map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>

              {liveStatus === 'idle' ? (
                <button
                  type="button"
                  onClick={() => void connectLiveSession()}
                  data-testid="live-voice-connect-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Start Voice Conversation</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setLiveMuted((m) => !m)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] text-xs font-semibold text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {liveMuted ? <MicOff className="w-3.5 h-3.5 text-[var(--sentinel-crit)]" /> : <Mic className="w-3.5 h-3.5 text-[var(--sentinel-teal)]" />}
                    <span>{liveMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={disconnectLiveSession}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[var(--sentinel-crit)] hover:opacity-90 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <PhoneOff className="w-3.5 h-3.5" />
                    <span>End Call</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {liveError && (
            <div className="p-3.5 rounded-md alert-pop-critical text-xs leading-relaxed">
              {liveError}
            </div>
          )}

          {/* Live Signal & Audio Meter */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 surface-inset rounded-md p-4 space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                  Session Telemetry
                </p>
                <p className="text-xs font-mono text-[var(--sentinel-ink-muted)] tabular-nums">
                  Status: {liveStatus === 'connected' ? 'Live Streaming' : liveStatus === 'connecting' ? 'Connecting...' : 'Standby'} · 16kHz in / 24kHz out
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--sentinel-ink-muted)] tabular-nums">
                  <span>Microphone Input Level</span>
                  <span>{liveMuted ? 'MUTED' : `${liveLevel}%`}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--sentinel-segment)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--sentinel-accent)] transition-all duration-100"
                    style={{ width: `${liveMuted ? 0 : liveLevel}%` }}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--sentinel-divider)] space-y-2">
                <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                  Suggested Voice Prompts
                </p>
                <ul className="space-y-1.5 text-xs text-[var(--sentinel-ink-secondary)]">
                  <li>“Give me a 30-second briefing on our open critical alerts.”</li>
                  <li>“What is the blast radius of containing the payroll API key?”</li>
                  <li>“Summarize our current control drift and blocked intruder sessions.”</li>
                </ul>
              </div>
            </div>

            <div className="lg:col-span-8 flex flex-col surface-inset rounded-md overflow-hidden min-h-[300px]">
              <div className="px-4 py-2.5 border-b border-[var(--sentinel-divider)] flex items-center justify-between text-xs">
                <span className="font-semibold text-[var(--sentinel-ink)]">
                  Live Conversation Transcript
                </span>
                <span className="font-mono text-[11px] text-[var(--sentinel-ink-muted)]">
                  {liveTranscript.length} turns
                </span>
              </div>

              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[320px]">
                {liveTranscript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2">
                    <Volume2 className="w-7 h-7 text-[var(--sentinel-ink-muted)]" />
                    <p className="text-sm font-medium text-[var(--sentinel-ink)]">
                      Ready for real-time voice conversation
                    </p>
                    <p className="text-xs text-[var(--sentinel-ink-muted)] max-w-md">
                      Click “Start Voice Conversation” above to open a live bidirectional audio link with Sentinel using gemini-3.8-live.
                    </p>
                  </div>
                ) : (
                  liveTranscript.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-md text-xs space-y-1 ${
                        item.role === 'user'
                          ? 'bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-ink)] ml-8'
                          : item.role === 'model'
                            ? 'bg-[var(--sentinel-suede)] border border-[var(--sentinel-border-soft)] text-[var(--sentinel-ink)] mr-8'
                            : 'text-[var(--sentinel-ink-muted)] font-mono text-[11px] text-center'
                      }`}
                    >
                      {item.role !== 'system' && (
                        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--sentinel-ink-muted)]">
                          <span>{item.role === 'user' ? 'Operator' : `Sentinel (${liveVoice})`}</span>
                          <span>{item.timestamp}</span>
                        </div>
                      )}
                      <p className="leading-relaxed whitespace-pre-wrap">{item.text}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Optional Text Injection during Live Call */}
              <div className="p-3 border-t border-[var(--sentinel-divider)] bg-[var(--sentinel-suede)] flex items-center gap-2">
                <input
                  type="text"
                  value={liveTextInput}
                  disabled={liveStatus !== 'connected'}
                  onChange={(e) => setLiveTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSendLiveText();
                  }}
                  placeholder={
                    liveStatus === 'connected'
                      ? 'Send a follow-up text note into the live voice session...'
                      : 'Start a live session to speak or send text turns...'
                  }
                  className="flex-1 surface-input rounded-md px-3 py-2 text-xs disabled:opacity-60 focus:outline-none focus:border-[var(--sentinel-accent)]"
                />
                <button
                  type="button"
                  disabled={liveStatus !== 'connected' || !liveTextInput.trim()}
                  onClick={handleSendLiveText}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: AUDIO TRANSCRIPTION (gemini-3.5-transcribe) */}
      {activeTab === 'transcribe' && (
        <section className="window-suede rounded-lg p-5 sm:p-6 space-y-5">
          <div className="border-b border-[var(--sentinel-divider)] pb-4 space-y-1">
            <h2 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
              Microphone Audio Transcription
            </h2>
            <p className="text-xs text-[var(--sentinel-ink-secondary)]">
              Record incident voice notes directly from your microphone or upload an audio clip for high-accuracy speech-to-text via <span className="font-mono">gemini-3.5-transcribe</span>.
            </p>
          </div>

          {transcribeError && (
            <div className="p-3.5 rounded-md alert-pop-critical text-xs leading-relaxed">
              {transcribeError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 surface-inset rounded-md p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {!isRecording ? (
                  <button
                    type="button"
                    onClick={() => void startMicRecording()}
                    data-testid="transcribe-record-btn"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Record Microphone</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopMicRecording}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[var(--sentinel-crit)] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span className="font-mono tabular-nums">
                      Stop Recording ({String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                      {String(recordSeconds % 60).padStart(2, '0')})
                    </span>
                  </button>
                )}

                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-xs font-semibold text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] whitespace-nowrap shrink-0 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Audio</span>
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => void handleAudioFileUpload(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {recordedAudioUrl && (
                <div className="space-y-1.5 pt-2 border-t border-[var(--sentinel-divider)]">
                  <p className="text-[11px] font-mono text-[var(--sentinel-ink-muted)]">
                    Captured Audio Preview ({recordedAudioMime})
                  </p>
                  <audio controls src={recordedAudioUrl} className="w-full h-9" />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--sentinel-ink)]">
                  Transcription Instruction
                </label>
                <input
                  type="text"
                  value={transcribeInstruction}
                  onChange={(e) => setTranscribeInstruction(e.target.value)}
                  className="w-full surface-input rounded-md px-3 py-2 text-xs focus:outline-none focus:border-[var(--sentinel-accent)]"
                />
              </div>

              <button
                type="button"
                disabled={!recordedAudioBase64 || transcribing || isRecording}
                onClick={() => void handleRunTranscription()}
                data-testid="transcribe-submit-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {transcribing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Transcribing with gemini-3.5-transcribe...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Transcribe Audio</span>
                  </>
                )}
              </button>
            </div>

            <div className="lg:col-span-7 surface-inset rounded-md p-4 flex flex-col justify-between gap-4 min-h-[260px]">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                    Transcript Output
                  </p>
                  {transcriptResult && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopyTranscript()}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[11px] font-semibold text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)] cursor-pointer"
                      >
                        {copiedTranscript ? <Check className="w-3 h-3 text-[var(--sentinel-teal)]" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedTranscript ? 'Copied' : 'Copy'}</span>
                      </button>
                      {onScanTranscript && (
                        <button
                          type="button"
                          onClick={() => void handleScanTranscriptAtEdge()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--sentinel-teal)] text-white text-[11px] font-semibold hover:opacity-90 cursor-pointer"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>Scan at Edge</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {transcriptResult ? (
                  <div className="p-3.5 rounded-md bg-[var(--sentinel-suede)] border border-[var(--sentinel-border-soft)] text-sm text-[var(--sentinel-ink)] leading-relaxed whitespace-pre-wrap">
                    {transcriptResult}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-[var(--sentinel-ink-muted)]">
                    Record from your microphone or upload an audio recording, then click “Transcribe Audio”.
                  </div>
                )}
              </div>

              {scanSummary && (
                <div className="p-3 rounded-md bg-[var(--sentinel-teal-soft)] border border-[var(--sentinel-teal)]/30 text-xs text-[var(--sentinel-teal-ink)] font-medium">
                  {scanSummary}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: GOOGLE MAPS GROUNDING (gemini-4-hydrogen + googleMaps) */}
      {activeTab === 'maps' && (
        <section className="window-suede rounded-lg p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sentinel-divider)] pb-4">
            <div className="space-y-1">
              <h2 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                Google Maps Geospatial Grounding
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Query real-world places, regional infrastructure, incident response centers, and local facilities grounded with live Google Maps data via <span className="font-mono">gemini-4-hydrogen</span>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRequestLocation}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  useGeolocation
                    ? 'border-[var(--sentinel-accent)] bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)]'
                    : 'border-[var(--sentinel-border)] bg-[var(--sentinel-nude)] text-[var(--sentinel-ink)] hover:border-[var(--sentinel-accent)]'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>{useGeolocation ? 'Location Enabled' : 'Use My Location'}</span>
              </button>
              {geoStatus && (
                <span className="text-[11px] font-mono text-[var(--sentinel-ink-muted)] tabular-nums">
                  {geoStatus}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={mapsQuery}
                onChange={(e) => setMapsQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRunMapsQuery();
                }}
                placeholder="Ask about locations, cloud regions, facilities, emergency offices, or places nearby..."
                className="flex-1 surface-input rounded-md px-3.5 py-2.5 text-sm focus:outline-none focus:border-[var(--sentinel-accent)]"
              />
              <button
                type="button"
                disabled={mapsLoading || !mapsQuery.trim()}
                onClick={() => void handleRunMapsQuery()}
                data-testid="maps-grounding-submit-btn"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                {mapsLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Grounding...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Query Maps Data</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--sentinel-ink-muted)]">Quick lookups:</span>
              {[
                'Major colocation data centers in Sydney NSW',
                'Cybersecurity & legal headquarters in London EC2',
                'Emergency police & cybercrime reporting offices near Melbourne CBD',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => void handleRunMapsQuery(preset)}
                  className="text-left underline decoration-[var(--sentinel-border)] hover:decoration-[var(--sentinel-accent)] text-[var(--sentinel-ink-secondary)] hover:text-[var(--sentinel-accent)] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {mapsError && (
            <div className="p-3.5 rounded-md alert-pop-critical text-xs leading-relaxed">
              {mapsError}
            </div>
          )}

          {mapsResult && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 surface-inset rounded-md p-4 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-[var(--sentinel-ink-muted)]">
                  <span>Maps-Grounded Intelligence · {mapsResult.model}</span>
                  <span>{new Date(mapsResult.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm text-[var(--sentinel-ink)] leading-relaxed whitespace-pre-wrap">
                  {mapsResult.answer}
                </div>
              </div>

              <div className="lg:col-span-5 surface-inset rounded-md p-4 space-y-3">
                <p className="text-xs font-semibold text-[var(--sentinel-ink)]">
                  Google Maps Grounding Sources ({mapsResult.sources.length})
                </p>
                {mapsResult.sources.length === 0 ? (
                  <p className="text-xs text-[var(--sentinel-ink-muted)]">
                    No direct Google Maps place citations were returned for this query. Try naming a specific city or venue.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--sentinel-divider)]">
                    {mapsResult.sources.map((src, idx) => (
                      <li key={`${src.uri}-${idx}`} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--sentinel-accent)] hover:underline"
                        >
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span>{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        {src.reviewSnippets.map((snip, sIdx) => (
                          <p
                            key={sIdx}
                            className="text-[11px] text-[var(--sentinel-ink-secondary)] pl-5 leading-snug"
                          >
                            “{snip.text}”{' '}
                            {snip.uri && (
                              <a
                                href={snip.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[var(--sentinel-accent)] underline"
                              >
                                Source
                              </a>
                            )}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: CREATE & EDIT IMAGES (gemini-nano-banana-2.1) */}
      {activeTab === 'image' && (
        <section className="window-suede rounded-lg p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sentinel-divider)] pb-4">
            <div className="space-y-1">
              <h2 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                Create &amp; Edit Images
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Generate high-resolution visual assets or upload an existing photo to edit via natural language prompts using <span className="font-mono">gemini-nano-banana-2.1</span>.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-md bg-[var(--sentinel-segment)]">
              <button
                type="button"
                onClick={() => setImageMode('create')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  imageMode === 'create'
                    ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-sm'
                    : 'text-[var(--sentinel-ink-secondary)]'
                }`}
              >
                Create from Text
              </button>
              <button
                type="button"
                onClick={() => setImageMode('edit')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  imageMode === 'edit'
                    ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-sm'
                    : 'text-[var(--sentinel-ink-secondary)]'
                }`}
              >
                Edit Uploaded Image
              </button>
            </div>
          </div>

          {imageError && (
            <div className="p-3.5 rounded-md alert-pop-critical text-xs leading-relaxed">
              {imageError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 surface-inset rounded-md p-4 space-y-4">
              {imageMode === 'edit' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--sentinel-ink)]">
                      Source Image to Edit
                    </label>
                    {editSourcePreview && (
                      <button
                        type="button"
                        onClick={() => setEditSourcePreview(null)}
                        className="text-[11px] text-[var(--sentinel-crit)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>
                  {editSourcePreview ? (
                    <img
                      src={editSourcePreview}
                      alt="Uploaded source image for editing"
                      className="w-full max-h-44 object-contain rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)]"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-md border border-dashed border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-xs text-[var(--sentinel-ink-secondary)] hover:border-[var(--sentinel-accent)] cursor-pointer">
                      <Upload className="w-5 h-5 text-[var(--sentinel-accent)]" />
                      <span>Click to upload PNG, JPG, or WebP</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleUploadEditImage(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--sentinel-ink)]">
                  {imageMode === 'edit' ? 'Edit Instructions' : 'Image Prompt'}
                </label>
                <textarea
                  rows={4}
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder={
                    imageMode === 'edit'
                      ? 'Describe what to change, add, or restyle in the uploaded image...'
                      : 'Describe the visual asset you want to generate...'
                  }
                  className="w-full surface-input rounded-md px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-[var(--sentinel-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[var(--sentinel-ink)]">Aspect Ratio</span>
                  <select
                    value={imageAspect}
                    onChange={(e) =>
                      setImageAspect(e.target.value as '16:9' | '1:1' | '4:3' | '9:16')
                    }
                    className="w-full surface-input rounded-md px-2.5 py-2 text-xs font-mono"
                  >
                    <option value="16:9">16:9 Landscape</option>
                    <option value="1:1">1:1 Square</option>
                    <option value="4:3">4:3 Editorial</option>
                    <option value="9:16">9:16 Portrait</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[var(--sentinel-ink)]">Resolution</span>
                  <select
                    value={imageSize}
                    onChange={(e) => setImageSize(e.target.value as '1K' | '2K')}
                    className="w-full surface-input rounded-md px-2.5 py-2 text-xs font-mono"
                  >
                    <option value="1K">1K Standard</option>
                    <option value="2K">2K High-Res</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                disabled={imageLoading || !imagePrompt.trim()}
                onClick={() => void handleGenerateOrEditImage()}
                data-testid="image-studio-submit-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {imageLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering with gemini-nano-banana-2.1...</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>{imageMode === 'edit' ? 'Apply Image Edit' : 'Generate Image'}</span>
                  </>
                )}
              </button>
            </div>

            <div className="lg:col-span-7 surface-inset rounded-md p-4 flex flex-col justify-between gap-3 min-h-[320px]">
              {imageResult ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[11px] text-[var(--sentinel-ink-muted)]">
                      {imageResult.model} · {imageResult.mode === 'edit' ? 'Edited' : 'Generated'} · {imageResult.aspectRatio}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendImageToVideoStudio(imageResult.imageDataUrl)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--sentinel-accent-soft)] text-[var(--sentinel-accent-soft-ink)] text-[11px] font-semibold hover:opacity-90 cursor-pointer"
                      >
                        <Film className="w-3 h-3" />
                        <span>Animate into Video →</span>
                      </button>
                      <a
                        href={imageResult.imageDataUrl}
                        download={`sentinel-image-${Date.now()}.png`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[11px] font-semibold text-[var(--sentinel-ink)]"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                  <img
                    src={imageResult.imageDataUrl}
                    alt="Generated or edited visual output"
                    className="w-full max-h-[400px] object-contain rounded-md border border-[var(--sentinel-border-soft)] bg-[var(--sentinel-suede)]"
                  />
                  {imageResult.caption && (
                    <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                      {imageResult.caption}
                    </p>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <ImageIcon className="w-8 h-8 text-[var(--sentinel-ink-muted)]" />
                  <p className="text-sm font-medium text-[var(--sentinel-ink)]">
                    No image rendered yet
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)] max-w-md">
                    Describe a diagram, executive visual, or upload an image to edit with gemini-nano-banana-2.1.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* TAB 5: VIDEO GENERATION FROM TEXT & ANIMATE PHOTO (gemini-omni-1.2-flash Interactions API) */}
      {activeTab === 'video' && (
        <section className="window-suede rounded-lg p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--sentinel-divider)] pb-4">
            <div className="space-y-1">
              <h2 className="font-title text-xl font-semibold text-[var(--sentinel-ink)]">
                Video Generation &amp; Photo Animation
              </h2>
              <p className="text-xs text-[var(--sentinel-ink-secondary)]">
                Generate video from text or upload a photo to animate into motion via <span className="font-mono">gemini-omni-1.2-flash</span> (Interactions API) in <span className="font-mono">16:9</span> landscape or <span className="font-mono">9:16</span> portrait.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-md bg-[var(--sentinel-segment)]">
              <button
                type="button"
                onClick={() => setVideoMode('text')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  videoMode === 'text'
                    ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-sm'
                    : 'text-[var(--sentinel-ink-secondary)]'
                }`}
              >
                Generate from Text
              </button>
              <button
                type="button"
                onClick={() => setVideoMode('animate')}
                className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                  videoMode === 'animate'
                    ? 'bg-[var(--sentinel-suede)] text-[var(--sentinel-ink)] shadow-sm'
                    : 'text-[var(--sentinel-ink-secondary)]'
                }`}
              >
                Animate Uploaded Photo
              </button>
            </div>
          </div>

          {videoError && (
            <div className="p-3.5 rounded-md alert-pop-critical text-xs leading-relaxed">
              {videoError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-5 surface-inset rounded-md p-4 space-y-4">
              {videoMode === 'animate' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[var(--sentinel-ink)]">
                      Starting Photo Frame
                    </label>
                    {videoPhotoPreview && (
                      <button
                        type="button"
                        onClick={() => setVideoPhotoPreview(null)}
                        className="text-[11px] text-[var(--sentinel-crit)] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3 h-3" /> Clear
                      </button>
                    )}
                  </div>
                  {videoPhotoPreview ? (
                    <img
                      src={videoPhotoPreview}
                      alt="Photo selected for video animation"
                      className="w-full max-h-44 object-contain rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)]"
                    />
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-md border border-dashed border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-xs text-[var(--sentinel-ink-secondary)] hover:border-[var(--sentinel-accent)] cursor-pointer">
                      <Upload className="w-5 h-5 text-[var(--sentinel-accent)]" />
                      <span>Upload a photo to animate (PNG, JPG, WebP)</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => void handleUploadVideoPhoto(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[var(--sentinel-ink)]">
                  {videoMode === 'animate' ? 'Motion & Camera Prompt' : 'Video Scene Prompt'}
                </label>
                <textarea
                  rows={4}
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder={
                    videoMode === 'animate'
                      ? 'Describe how the uploaded photo should come to life...'
                      : 'Describe the video scene, camera movement, and lighting...'
                  }
                  className="w-full surface-input rounded-md px-3 py-2 text-xs leading-relaxed focus:outline-none focus:border-[var(--sentinel-accent)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[var(--sentinel-ink)]">Aspect Ratio</span>
                  <select
                    value={videoAspect}
                    onChange={(e) => setVideoAspect(e.target.value as '16:9' | '9:16')}
                    className="w-full surface-input rounded-md px-2.5 py-2 text-xs font-mono"
                  >
                    <option value="16:9">16:9 Landscape</option>
                    <option value="9:16">9:16 Portrait</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs">
                  <span className="font-semibold text-[var(--sentinel-ink)]">Duration</span>
                  <select
                    value={videoDuration}
                    onChange={(e) => setVideoDuration(e.target.value as '5s' | '8s' | '10s')}
                    className="w-full surface-input rounded-md px-2.5 py-2 text-xs font-mono"
                  >
                    <option value="5s">5 seconds</option>
                    <option value="8s">8 seconds</option>
                    <option value="10s">10 seconds</option>
                  </select>
                </label>
              </div>

              <button
                type="button"
                disabled={videoLoading}
                onClick={() => void handleRunVideoGeneration()}
                data-testid="video-studio-submit-btn"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[var(--sentinel-accent)] hover:bg-[var(--sentinel-accent-hover)] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {videoLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="font-mono tabular-nums">
                      Generating video ({videoElapsedSec}s)...
                    </span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>
                      {videoMode === 'animate' ? 'Animate Photo into Video' : 'Generate Video'}
                    </span>
                  </>
                )}
              </button>
            </div>

            <div className="lg:col-span-7 surface-inset rounded-md p-4 flex flex-col justify-between gap-3 min-h-[320px]">
              {videoResult && (videoResult.videoDataUrl || videoResult.videoUri) ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-[11px] text-[var(--sentinel-ink-muted)]">
                      {videoResult.model} · {videoResult.aspectRatio} · {videoResult.duration} · {videoResult.mode === 'animate' ? 'Photo-to-Video' : 'Text-to-Video'}
                    </span>
                    {videoResult.videoDataUrl && (
                      <a
                        href={videoResult.videoDataUrl}
                        download={`sentinel-video-${videoResult.aspectRatio.replace(':', 'x')}-${Date.now()}.mp4`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[var(--sentinel-border)] bg-[var(--sentinel-suede)] text-[11px] font-semibold text-[var(--sentinel-ink)]"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download MP4</span>
                      </a>
                    )}
                  </div>
                  <video
                    controls
                    playsInline
                    src={videoResult.videoDataUrl ?? videoResult.videoUri ?? undefined}
                    className={`w-full rounded-md border border-[var(--sentinel-border-soft)] bg-black ${
                      videoResult.aspectRatio === '9:16' ? 'max-h-[440px] mx-auto max-w-xs' : 'max-h-[400px]'
                    }`}
                  />
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12 space-y-2">
                  <Film className="w-8 h-8 text-[var(--sentinel-ink-muted)]" />
                  <p className="text-sm font-medium text-[var(--sentinel-ink)]">
                    {videoLoading ? 'Rendering video via Interactions API...' : 'No video rendered yet'}
                  </p>
                  <p className="text-xs text-[var(--sentinel-ink-muted)] max-w-md">
                    {videoLoading
                      ? 'gemini-omni-1.2-flash is synthesizing your 720p video. This can take up to 1–2 minutes.'
                      : 'Choose 16:9 landscape or 9:16 portrait and either generate a clip from text or upload a photo to animate.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
