import { useCallback, useEffect, useRef, useState } from 'react';

/* Minimal typing for the Web Speech API (not in TypeScript's DOM lib). */
interface SpeechResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface RecognitionEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Stop listening after this much quiet once you've started talking. */
export const SILENCE_MS = 2500;
/** Never listen longer than this in one go. */
export const MAX_LISTEN_MS = 30_000;

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings, or type instead.',
  'service-not-allowed': 'Voice input is not available in this browser. Type instead, or use your keyboard’s mic.',
  'no-speech': "Didn't catch that. Tap the mic and try again.",
  'audio-capture': 'No microphone found.',
};

/**
 * Chrome turns speech into text on Google's servers. "network" means that service couldn't be reached:
 * no internet, a VPN / firewall / ad-blocker blocking it, or a browser without access to it (Brave,
 * Opera, Vivaldi and some others report this every time).
 */
export function networkErrorText(online: boolean): string {
  if (!online) return 'You’re offline. Voice input needs an internet connection — type instead for now.';
  return 'Your browser couldn’t reach its speech service. This happens in Brave, Opera and some other browsers, or with a VPN or ad-blocker. Try Chrome, Edge or Safari, or use your keyboard’s mic button.';
}

/**
 * Joins the final pieces of a continuous recognition session into one sentence.
 * Some phones (Chrome on Android) repeat everything said so far in each new piece, so a piece that
 * the next one already starts with is dropped, as are exact repeats.
 */
export function joinSegments(segments: string[]): string {
  const cleaned = segments.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
  const kept = cleaned.filter((s, i) => {
    const next = cleaned[i + 1];
    return !(next && next.toLowerCase().startsWith(s.toLowerCase()));
  });
  return kept.join(' ').trim();
}

/**
 * Live speech-to-text in Indian English. Keeps listening while you talk (long sentences are fine)
 * and stops after a short pause, when you tap stop, or after 30 seconds. `onFinal` receives the text.
 * Where the browser has no support, `supported` is false and the UI hides the mic button.
 */
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const stopRequestedRef = useRef(false);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || recognitionRef.current) return;

    // Text from earlier attempts survives an automatic retry.
    let carried: string[] = [];
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    const capTimer = setTimeout(() => recognitionRef.current?.stop(), MAX_LISTEN_MS);
    const clearTimers = () => {
      clearTimeout(silenceTimer);
      clearTimeout(capTimer);
    };

    const run = (attempt: number) => {
      const recognition = new Ctor();
      recognition.lang = 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;
      let finals: string[] = [];
      let retry = false;
      let failure: string | null = null;

      recognition.onresult = (event) => {
        // Rebuild from the whole list each time: simpler and immune to repeated events.
        const nextFinals: string[] = [];
        let live = '';
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i]!;
          if (result.isFinal) nextFinals.push(result[0].transcript);
          else live += ` ${result[0].transcript}`;
        }
        finals = nextFinals;
        setInterim(`${joinSegments([...carried, ...finals])} ${live}`.trim());
        clearTimeout(silenceTimer);
        silenceTimer = setTimeout(() => recognition.stop(), SILENCE_MS);
      };
      recognition.onerror = (e) => {
        if (e.error === 'aborted') return;
        if (e.error === 'no-speech' && (carried.length > 0 || finals.length > 0)) return; // a pause after talking
        if (e.error === 'network') {
          // Often a one-off hiccup: try once more before giving up.
          if (attempt === 0) retry = true;
          else failure = networkErrorText(navigator.onLine);
          return;
        }
        failure = ERROR_TEXT[e.error] ?? 'Voice input stopped unexpectedly. Try again or type.';
      };
      recognition.onend = () => {
        carried = [...carried, ...finals];
        if (retry && !stopRequestedRef.current && recognitionRef.current === recognition) {
          run(1);
          return;
        }
        clearTimers();
        recognitionRef.current = null;
        setListening(false);
        setInterim('');
        const text = joinSegments(carried);
        if (text) onFinalRef.current(text);
        if (failure && !text) setError(failure);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        clearTimers();
        recognitionRef.current = null;
        setListening(false);
        setError('Voice input could not start. Try again.');
      }
    };

    stopRequestedRef.current = false;
    setError(null);
    setInterim('');
    setListening(true);
    run(0);
  }, []);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}
